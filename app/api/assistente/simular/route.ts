import { z } from "zod"
import { fail, ok } from "@/lib/api/response"
import { CAPACIDADES_PADRAO, RepositorioMemoria, criarMockProvider, type Estado } from "@/lib/assistente"
import { atenderMensagem } from "@/lib/assistente/atendimento"
import { criarAgenteDeps, criarChamadaIa, resolverClaude } from "@/lib/assistente/ia-claude"
import { repositorioSupabase } from "@/lib/assistente/repositorio-supabase"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * POST /api/assistente/simular
 * Simulador: roda o MESMO caminho do WhatsApp (`atenderMensagem`) com dados fictícios e um repositório em memória.
 * Não toca no Immobillis, não grava nada e não envia WhatsApp. O estado e o histórico viajam no corpo (rota sem estado).
 */
const Corpo = z.object({
  texto: z.string().min(1).max(1000),
  telefone: z.string().min(8).max(20),
  indisponivel: z.boolean().optional(),
  usarIa: z.boolean().optional(),
  historico: z.array(z.object({ papel: z.enum(["cliente", "assistente"]), conteudo: z.string().max(2000) })).max(40).optional(),
  estado: z
    .object({
      etapa: z.enum(["inicio", "aguardando_confirmacao", "identificado", "transferido"]),
      tentativasIdentidade: z.number().int().min(0).max(10),
      naoEntendidas: z.number().int().min(0).max(10),
      cliente: z.any().optional(),
      intencaoPendente: z.string().optional(),
      protocolo: z.string().optional(),
      departamento: z.string().optional(),
    })
    .passthrough(),
})

export async function POST(req: Request) {
  const parsed = Corpo.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return fail("Requisição inválida", 400)
  const { texto, telefone, indisponivel, usarIa, estado, historico } = parsed.data

  // Usa o agente escolhido na config (se o banco estiver acessível); senão, a resolução padrão.
  let aiAgentId: string | undefined
  try { aiAgentId = process.env.SUPABASE_SECRET_KEY ? (await repositorioSupabase.obterConfig()).aiAgentId : undefined } catch { /* sem config */ }
  const res = usarIa ? await resolverClaude(aiAgentId) : null

  const agora = new Date()
  const repo = new RepositorioMemoria()
  const conv = await repo.criarConversa(telefone, "simulador", agora)
  conv.estado = estado as Estado
  conv.ultimaMsgEm = new Date(agora.getTime() - 3_600_000).toISOString() // não cai no "silêncio pós-transferência"
  repo.mensagens.set(conv.id, (historico ?? []).map((h) => ({ ...h, criadoEm: agora.toISOString() })))

  const r = await atenderMensagem({
    repo,
    provider: criarMockProvider({ indisponivel }),
    config: { capacidades: CAPACIDADES_PADRAO, usarIa: !!res },
    telefone, instanceName: "simulador", texto, agora,
    ia: res ? criarChamadaIa(res.cred) : null,
    agente: res ? criarAgenteDeps(res) : null,
  })

  return ok({
    estado: repo.conversas[0].estado,
    respostas: r.respostas,
    eventos: r.eventos,
    ia: res ? { ativa: true, origem: res.cred.origem, agente: res.persona?.nome ?? null, modelo: res.cred.modeloAgente ?? null } : { ativa: false },
    iaPedidaSemChave: !!usarIa && !res,
  })
}
