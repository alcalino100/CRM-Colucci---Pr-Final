import { z } from "zod"
import { fail, ok } from "@/lib/api/response"
import { criarMockProvider, processarMensagem, type Estado } from "@/lib/assistente"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/assistente/simular
 * Simulador do Assistente Virtual. Usa SEMPRE o provedor simulado (dados fictícios),
 * por isso não toca em nenhum sistema externo. O estado da conversa trafega no corpo
 * da requisição (rota sem estado), o que mantém o comportamento previsível e testável.
 */
const Corpo = z.object({
  texto: z.string().min(1).max(1000),
  telefone: z.string().min(8).max(20),
  indisponivel: z.boolean().optional(),
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
  const { texto, telefone, indisponivel, estado } = parsed.data
  const saida = await processarMensagem(estado as Estado, texto, {
    provider: criarMockProvider({ indisponivel }),
    telefone,
  })
  return ok({ ...saida })
}
