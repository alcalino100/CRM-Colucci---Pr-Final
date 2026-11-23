import { exigirGestor } from "@/lib/auth/sessao"
import { fail, ok } from "@/lib/api/response"
import { ClaudeError, CLAUDE_MODELO_PADRAO, CLAUDE_MODELO_RAPIDO, chamarClaudeComFallback } from "@/lib/ai/claude"
import { resolverClaude } from "@/lib/assistente/ia-claude"
import { repositorioSupabase } from "@/lib/assistente/repositorio-supabase"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

/**
 * POST /api/assistente/diagnostico — faz UMA chamada mínima ao Claude com a mesma chave/modelo que o assistente usa
 * e devolve o resultado ou o motivo exato da falha (a mensagem da própria API; a chave nunca é devolvida).
 */
export async function POST(req: Request) {
  const auth = exigirGestor(req)
  if (!auth.ok) return fail(auth.erro, auth.status)

  let aiAgentId: string | undefined
  try { aiAgentId = process.env.SUPABASE_SECRET_KEY ? (await repositorioSupabase.obterConfig()).aiAgentId : undefined } catch { /* sem config */ }
  const res = await resolverClaude(aiAgentId)
  if (!res) return ok({ conectado: false, motivo: "Nenhuma chave Claude encontrada (agente escolhido, CLAUDE_API_KEY/ANTHROPIC_API_KEY ou agente Claude ativo)." })

  const t0 = Date.now()
  try {
    const r = await chamarClaudeComFallback({
      apiKey: res.cred.apiKey,
      modelos: [res.cred.modeloAgente ?? "", CLAUDE_MODELO_PADRAO, CLAUDE_MODELO_RAPIDO],
      system: "Você é um teste de conexão. Responda somente com a palavra: ok",
      messages: [{ role: "user", content: "teste" }],
      maxTokens: 10, timeoutMs: 15_000, maxRetries: 0,
    })
    return ok({ conectado: true, modelo: r.modelo, ms: Date.now() - t0, origem: res.cred.origem, agente: res.persona?.nome ?? null, resposta: r.texto.slice(0, 40) })
  } catch (e) {
    const ce = e instanceof ClaudeError ? e : null
    return ok({ conectado: false, ms: Date.now() - t0, origem: res.cred.origem, agente: res.persona?.nome ?? null, status: ce?.status ?? null, tipo: ce?.tipo ?? null, motivo: (e instanceof Error ? e.message : String(e)).slice(0, 300) })
  }
}
