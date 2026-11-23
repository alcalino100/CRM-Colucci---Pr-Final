import { z } from "zod"
import { exigirGestor } from "@/lib/auth/sessao"
import { fail, ok } from "@/lib/api/response"
import { parseBody } from "@/lib/api/validate"
import { repositorioSupabase, tabelaAusente } from "@/lib/assistente/repositorio-supabase"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/assistente/reiniciar — "recomeçar do zero".
 * Encerra a conversa (por id) ou todas as do telefone. A próxima mensagem do cliente abre uma conversa nova: sem
 * memória, sem o estado de "já transferido" e sem identidade confirmada. Só gestor (visitante não altera).
 */
const Corpo = z
  .object({
    conversaId: z.string().uuid().optional(),
    telefone: z.string().max(20).optional(),
  })
  .refine((c) => !!c.conversaId || (c.telefone ?? "").replace(/\D/g, "").length >= 10, "Informe a conversa ou um telefone válido.")

export async function POST(req: Request) {
  const auth = exigirGestor(req)
  if (!auth.ok) return fail(auth.erro, auth.status)
  const parsed = await parseBody(req, Corpo)
  if (!parsed.success) return parsed.response
  if (!process.env.SUPABASE_SECRET_KEY) return fail("Servidor sem SUPABASE_SECRET_KEY configurada.", 500)
  try {
    const reiniciadas = await repositorioSupabase.reiniciarConversas(parsed.data, new Date())
    logger.info("assistente: conversa reiniciada pelo painel", { reiniciadas, por: auth.sessao.id })
    return ok({ reiniciadas })
  } catch (e) {
    if (tabelaAusente(e)) return fail("As tabelas do assistente ainda não existem.", 503)
    logger.error("assistente: erro ao reiniciar conversa", { error: e instanceof Error ? e.message : String(e) })
    return fail("Não foi possível reiniciar a conversa.", 500)
  }
}
