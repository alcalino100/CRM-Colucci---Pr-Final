import "server-only"
import { chamarClaudeComFallback, CLAUDE_MODELO_PADRAO, CLAUDE_MODELO_RAPIDO } from "@/lib/ai/claude"
import { providerFromModel } from "@/lib/ai/generateResponse"
import { searchKBSemantic } from "@/lib/ai/ragSearch"
import { decryptToken } from "@/lib/encryption"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import type { AgenteDeps, PersonaAgente } from "./agente"
import { buscarFaq } from "./faq"
import type { ChamadaIa } from "./ia"
import { normalizar } from "./intencoes"

/** "agente" = agente escolhido na config; "agente_auto" = achamos a chave em um agente Claude ativo; "ambiente" = variável do servidor. */
export type CredencialClaude = { apiKey: string; modeloAgente?: string; origem: "agente" | "agente_auto" | "ambiente" }
export type ResolucaoClaude = { cred: CredencialClaude; persona?: PersonaAgente & { id: string; kbId?: string } }

const db = () => getSupabaseAdmin() as any
const COLUNAS = "id,name,model_name,api_token,system_prompt,additional_instructions,brand_voice,is_active"

function chaveDoAgente(a: { api_token?: string | null }): string | undefined {
  if (!a.api_token) return undefined
  try { return decryptToken(a.api_token) } catch { return a.api_token }
}

/**
 * Chaves Claude disponíveis, em ORDEM DE PRIORIDADE:
 *  1) CLAUDE_API_KEY / ANTHROPIC_API_KEY do servidor (variável de ambiente: o lugar certo para um segredo);
 *  2) chave guardada no agente escolhido na config (legado: fica em texto puro na tabela ai_agents);
 *  3) chave de qualquer agente Claude da IA Conversacional (só a CHAVE e o modelo: o prompt de um agente de leads
 *     nunca vira a personalidade do assistente por acaso).
 * A personalidade (prompt, tom de voz, base de conhecimento) vem SEMPRE do agente escolhido, seja qual for a chave usada.
 */
export async function candidatasClaude(aiAgentId?: string): Promise<ResolucaoClaude[]> {
  const env = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY
  const out: ResolucaoClaude[] = []
  let persona: ResolucaoClaude["persona"]
  let modeloAgente: string | undefined
  let chaveAgente: string | undefined
  try {
    if (aiAgentId) {
      const { data: a } = await db().from("ai_agents").select(COLUNAS).eq("id", aiAgentId).maybeSingle()
      if (a && providerFromModel(a.model_name) === "claude") {
        const { data: kb } = await db().from("knowledge_bases").select("id").eq("ai_id", a.id).maybeSingle()
        persona = { id: a.id, nome: a.name, system: a.system_prompt ?? undefined, instrucoes: a.additional_instructions ?? undefined, voz: a.brand_voice ?? undefined, kbId: kb?.id }
        modeloAgente = a.model_name
        chaveAgente = chaveDoAgente(a)
      }
    }
  } catch { /* segue para as demais fontes */ }
  if (env) out.push({ cred: { apiKey: env, modeloAgente, origem: "ambiente" }, persona })
  if (chaveAgente && chaveAgente !== env) out.push({ cred: { apiKey: chaveAgente, modeloAgente, origem: "agente" }, persona })
  if (!out.length) {
    try {
      const { data } = await db().from("ai_agents").select(COLUNAS).order("is_active", { ascending: false }).limit(20)
      for (const a of data ?? []) {
        if (providerFromModel(a.model_name) !== "claude") continue
        const apiKey = chaveDoAgente(a)
        if (apiKey) { out.push({ cred: { apiKey, modeloAgente: a.model_name, origem: "agente_auto" }, persona }); break }
      }
    } catch { /* sem chave */ }
  }
  return out
}

/** A chave de maior prioridade. Devolve null se não houver nenhuma chave Claude (o assistente segue pelo fluxo de regras). */
export async function resolverClaude(aiAgentId?: string): Promise<ResolucaoClaude | null> {
  return (await candidatasClaude(aiAgentId))[0] ?? null
}

export async function resolverCredencialClaude(aiAgentId?: string): Promise<CredencialClaude | null> {
  return (await resolverClaude(aiAgentId))?.cred ?? null
}

/** Chamada simples (saída estruturada): modelo rápido primeiro. Usada pelo classificador e pelo humanizador. */
export function criarChamadaIa(cred: CredencialClaude): ChamadaIa {
  return (p) =>
    chamarClaudeComFallback({
      apiKey: cred.apiKey,
      modelos: [CLAUDE_MODELO_RAPIDO, cred.modeloAgente ?? "", CLAUDE_MODELO_PADRAO],
      system: p.system, messages: p.messages, tools: p.tools, toolChoice: p.toolChoice,
      maxTokens: p.maxTokens, timeoutMs: p.timeoutMs, maxRetries: 1,
    })
}

/** Base de conhecimento: FAQ padrão + (se houver agente escolhido) RAG semântico e FAQs dele. */
export function criarConhecimento(kbId?: string): (pergunta: string) => Promise<string> {
  return async (pergunta) => {
    const partes: string[] = []
    const padrao = buscarFaq(pergunta)
    if (padrao) partes.push(`${padrao.pergunta}\n${padrao.resposta}`)
    if (kbId) {
      try {
        const hits = await searchKBSemantic(kbId, pergunta, 3)
        for (const h of hits) partes.push(h.chunk_text)
      } catch { /* RAG é opcional */ }
      try {
        const { data } = await db().from("faqs").select("question,answer").eq("knowledge_base_id", kbId).limit(60)
        const termos = normalizar(pergunta).split(" ").filter((t) => t.length >= 4)
        const pontuadas = ((data ?? []) as { question: string; answer: string }[])
          .map((f) => ({ f, pts: termos.filter((t) => normalizar(f.question + " " + f.answer).includes(t)).length }))
          .filter((x) => x.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, 2)
        for (const { f } of pontuadas) partes.push(`${f.question}\n${f.answer}`)
      } catch { /* idem */ }
    }
    return Array.from(new Set(partes)).join("\n---\n").slice(0, 2500)
  }
}

/** Monta o agente (Claude conduzindo a conversa) a partir da resolução de chave/persona. */
export function criarAgenteDeps(res: ResolucaoClaude): AgenteDeps {
  return {
    persona: res.persona,
    conhecimento: criarConhecimento(res.persona?.kbId),
    llm: async (p) => {
      const r = await chamarClaudeComFallback({
        apiKey: res.cred.apiKey,
        modelos: [res.cred.modeloAgente ?? "", CLAUDE_MODELO_PADRAO, CLAUDE_MODELO_RAPIDO],
        system: p.system, messages: p.messages, tools: p.tools, onToolUse: p.onToolUse,
        maxTokens: p.maxTokens, timeoutMs: p.timeoutMs, maxRounds: p.maxRounds, maxRetries: 1,
      })
      return { texto: r.texto, tokensTotal: r.tokensTotal, modelo: r.modelo }
    },
  }
}
