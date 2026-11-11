import { wsupabase } from "@/lib/whatsapp/server"
import { ok, fail } from "@/lib/api/response"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const url = new URL(req.url)
  const auth = req.headers.get("authorization")
  const qs = url.searchParams.get("secret")
  const autorizado = !!secret && (auth === `Bearer ${secret}` || qs === secret)
  if (!autorizado) return fail("não autorizado", 401)

  try {
    // Arquiva apenas fechamentos de meses anteriores (fim de mês).
    // Leads fechados neste mês continuam visíveis até o mês virar.
    const agora = new Date()
    const inicioMes = `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00Z`
    const { data, error } = await wsupabase
      .from("leads")
      .update({ arquivado_em: agora.toISOString(), atualizado_em: agora.toISOString() })
      .eq("status", "fechado")
      .is("arquivado_em", null)
      .or(`fechado_em.lt.${inicioMes},and(fechado_em.is.null,atualizado_em.lt.${inicioMes})`)
      .select("id")

    if (error) {
      logger.error("Erro no cron de arquivamento de fechados", { error: error.message })
      return fail(error.message, 500)
    }

    logger.info("Cron de arquivamento de fechados executado", { count: data?.length ?? 0 })
    return ok({
      arquivados: data?.length ?? 0,
      quando: agora.toISOString(),
    })
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e)
    logger.error("Exceção no cron de arquivamento", { error: errorMsg })
    return fail(errorMsg, 500)
  }
}
