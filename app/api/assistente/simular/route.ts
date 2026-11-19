import { z } from "zod"
import { fail, ok } from "@/lib/api/response"
import { CAPACIDADES_PADRAO, classificarComIa, criarMockProvider, humanizar, processarMensagem, type Estado, type Evento } from "@/lib/assistente"
import { criarChamadaIa, resolverCredencialClaude } from "@/lib/assistente/ia-claude"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

/**
 * POST /api/assistente/simular
 * Simulador do Assistente Virtual. Usa SEMPRE o provedor simulado (dados fictícios): não toca no Immobillis,
 * não grava nada e não envia WhatsApp. Opcionalmente usa o Claude (humanizador + classificador) para
 * o gestor ver o efeito da IA. O estado trafega no corpo (rota sem estado).
 */
const Corpo = z.object({
  texto: z.string().min(1).max(1000),
  telefone: z.string().min(8).max(20),
  indisponivel: z.boolean().optional(),
  usarIa: z.boolean().optional(),
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
  const { texto, telefone, indisponivel, usarIa, estado } = parsed.data

  const cred = usarIa ? await resolverCredencialClaude() : null
  const ia = cred ? criarChamadaIa(cred) : null
  const saida = await processarMensagem(estado as Estado, texto, {
    provider: criarMockProvider({ indisponivel }),
    telefone,
    capacidades: CAPACIDADES_PADRAO,
    classificadorReserva: ia ? (t) => classificarComIa(t, ia) : undefined,
  })

  let respostas = saida.respostas
  const eventos: Evento[] = [...saida.eventos]
  if (ia) {
    const h = await humanizar(respostas, ia)
    respostas = h.respostas
    if (h.usouIa) eventos.push({ tipo: "ia", funcao: "humanizador", ok: h.ok, tokens: h.tokens })
  }
  return ok({ estado: saida.estado, respostas, eventos, iaAtiva: !!ia, iaPedidaSemChave: !!usarIa && !ia })
}
