import { avaliarTriggers } from "@/lib/ai/escalationDetector"
import type { EscalationTrigger } from "@/lib/ai/types"
import { normalizar } from "./intencoes"
import { Departamento } from "./types"

/**
 * Metas e escalações cadastradas no agente (abas "Metas" e "Escalações" da IA Conversacional), lidas pelo assistente.
 *  - Metas: viram orientação no prompt.
 *  - Escalações de AÇÃO IMEDIATA (immediate_handoff / escalate_specialist): cumpridas pelo CÓDIGO, antes do Claude
 *    (pediu atendente, ameaça jurídica, urgência...): o cliente nunca depende de o modelo "lembrar" de encaminhar.
 *  - Escalações "notify_team": só orientação (um "multa" ou "renovar" solto não deve transferir quem só quer informação).
 * O setor de cada escalação fica em `assign_to` (campo que nenhum outro código usa).
 */
export type MetaAgente = { nome: string; tipo: string; descricao: string; prompt: string; perguntas: string[]; proximoPasso?: string; planoB?: string }
export type GatilhoAgente = { nome: string; condicao: "keyword" | "sentiment" | "max_turns"; palavras: string[]; acao: string; departamento: Departamento }

export const ACOES_IMEDIATAS = ["immediate_handoff", "escalate_specialist"]

export function departamentoDe(v: unknown): Departamento {
  const p = Departamento.safeParse(String(v ?? "").toLowerCase().trim())
  return p.success ? p.data : "administrativo"
}

/**
 * Primeiro gatilho de ação imediata acionado pela mensagem do cliente (ou null).
 * Palavras-chave comparam SEM acento e sem diferença de maiúsculas ("justica" aciona "justiça"): no WhatsApp quase
 * ninguém acentua, e o detector antigo (lead) só baixava a caixa. Sentimento usa o detector existente.
 */
export function gatilhoObrigatorio(gatilhos: GatilhoAgente[], texto: string): GatilhoAgente | null {
  if (!texto.trim()) return null
  const msg = normalizar(texto)
  for (const g of gatilhos) {
    if (!ACOES_IMEDIATAS.includes(g.acao)) continue
    if (g.condicao === "keyword") {
      if (g.palavras.some((k) => { const n = normalizar(k); return n.length > 0 && msg.includes(n) })) return g
    } else if (g.condicao === "sentiment") {
      const t: EscalationTrigger = { id: "g", ai_id: "", name: g.nome, condition: "sentiment", detection_keywords: [], action: g.acao as EscalationTrigger["action"], notification_channels: [], created_at: "" }
      if (avaliarTriggers([t], texto, [], 0).shouldEscalate) return g
    }
  }
  return null
}

const corta = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s)

export function blocoMetas(metas: MetaAgente[]): string {
  if (!metas.length) return ""
  const linhas = metas.slice(0, 8).map((m, i) => {
    const partes = [`${i + 1}. ${m.nome} (${m.tipo}): ${corta(m.prompt, 480)}`]
    if (m.perguntas.length) partes.push(`Perguntas possíveis: ${m.perguntas.slice(0, 4).join(" | ")}.`)
    if (m.proximoPasso) partes.push(`Depois: ${corta(m.proximoPasso, 200)}`)
    if (m.planoB) partes.push(`Se não der: ${corta(m.planoB, 200)}`)
    return partes.join(" ")
  })
  return ["METAS DO ATENDIMENTO (orientação de conduta, em ordem de importância):", ...linhas].join("\n")
}

export function blocoGatilhos(gatilhos: GatilhoAgente[]): string {
  if (!gatilhos.length) return ""
  const linhas = gatilhos.slice(0, 12).map((g) => {
    const quando = g.condicao === "keyword" ? `quando o cliente falar em: ${g.palavras.slice(0, 12).join(", ")}` : g.condicao === "sentiment" ? "quando o cliente demonstrar frustração ou raiva" : "quando a conversa passar de várias trocas sem resolver"
    const como = ACOES_IMEDIATAS.includes(g.acao) ? "encaminhamento imediato (o sistema já faz)" : "encaminhe se o pedido realmente exigir a equipe"
    return `- ${g.nome}: ${quando} → setor ${g.departamento}, ${como}.`
  })
  return ["GATILHOS DE ENCAMINHAMENTO:", ...linhas].join("\n")
}
