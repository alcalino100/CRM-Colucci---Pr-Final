import { exigirGestor } from "@/lib/auth/sessao"
import { fail, ok } from "@/lib/api/response"
import { ClaudeError, CLAUDE_MODELO_PADRAO, CLAUDE_MODELO_RAPIDO, chamarClaudeComFallback } from "@/lib/ai/claude"
import { candidatasClaude } from "@/lib/assistente/ia-claude"
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
  const candidatas = await candidatasClaude(aiAgentId)
  if (!candidatas.length) return ok({ conectado: false, testes: [], motivo: "Nenhuma chave Claude encontrada (CLAUDE_API_KEY/ANTHROPIC_API_KEY, chave do agente escolhido ou de um agente Claude ativo)." })

  // Testa CADA chave separadamente (a de maior prioridade é a que o assistente usa de fato).
  const testes = []
  for (const [i, res] of candidatas.entries()) {
    const t0 = Date.now()
    try {
      const r = await chamarClaudeComFallback({
        apiKey: res.cred.apiKey,
        modelos: [res.cred.modeloAgente ?? "", CLAUDE_MODELO_PADRAO, CLAUDE_MODELO_RAPIDO],
        system: "Você é um teste de conexão. Responda somente com a palavra: ok",
        messages: [{ role: "user", content: "teste" }],
        maxTokens: 10, timeoutMs: 15_000, maxRetries: 0,
      })
      testes.push({ origem: res.cred.origem, emUso: i === 0, conectado: true, modelo: r.modelo, ms: Date.now() - t0 })
    } catch (e) {
      const ce = e instanceof ClaudeError ? e : null
      testes.push({ origem: res.cred.origem, emUso: i === 0, conectado: false, ms: Date.now() - t0, status: ce?.status ?? null, motivo: (e instanceof Error ? e.message : String(e)).slice(0, 300) })
    }
  }
  const emUso = testes[0]
  return ok({ conectado: emUso.conectado, modelo: emUso.modelo, ms: emUso.ms, motivo: emUso.motivo, status: emUso.status ?? null, agente: candidatas[0].persona?.nome ?? null, testes })
}
