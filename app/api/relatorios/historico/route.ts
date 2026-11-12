// app/api/relatorios/historico/route.ts
// Histórico e auditoria de relatórios enviados (automático, teste, reenvio)

import { ok, fail } from "@/lib/api/response"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  if (!process.env.SUPABASE_SECRET_KEY) {
    return fail("configure SUPABASE_SECRET_KEY", 500)
  }

  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get("limit") || "30"), 100)
  const offset = Math.max(Number(url.searchParams.get("offset") || "0"), 0)
  const statusParam = url.searchParams.get("status") // enviado | falhou | pulado
  const dataParam = url.searchParams.get("data") // YYYY-MM-DD

  try {
    const admin = getSupabaseAdmin()

    let query = admin
      .from("relatorio_envios")
      .select("*, destinatario:relatorio_destinatarios(id, nome, tipo, destino)", { count: "exact" })

    if (statusParam && ["enviado", "falhou", "pulado"].includes(statusParam)) {
      query = query.eq("status", statusParam as "enviado" | "falhou" | "pulado")
    }

    if (dataParam && /^\d{4}-\d{2}-\d{2}$/.test(dataParam)) {
      query = query.eq("data_referencia", dataParam)
    }

    const { data, count, error } = await query
      .order("enviado_em", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      logger.error("Erro ao consultar histórico de envios", { error: error.message })
      return fail(error.message, 500)
    }

    return ok({
      envios: data ?? [],
      total: count ?? 0,
      limit,
      offset,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return fail(`Erro ao carregar histórico: ${msg}`, 500)
  }
}
