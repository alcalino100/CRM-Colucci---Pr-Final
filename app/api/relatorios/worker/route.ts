// app/api/relatorios/worker/route.ts
// Endpoint de disparo do relatório diário do CRM no WhatsApp (08:00 BRT).
// Protegido por CRON_SECRET via Bearer token ou query parameter secret.

import { ok, fail } from "@/lib/api/response"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { logger } from "@/lib/logger"
import { executarDisparoAutomaticoRelatorios } from "@/lib/relatorios/agendador"
import { limitesDiaBRT } from "@/lib/relatorios/periodo"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(request: Request) {
  if (!process.env.SUPABASE_SECRET_KEY) {
    return fail("configure SUPABASE_SECRET_KEY", 500)
  }

  const url = new URL(request.url)
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get("authorization")
  const qs = url.searchParams.get("secret")
  const force = url.searchParams.get("force") === "1"
  const dataCustom = url.searchParams.get("data") // YYYY-MM-DD opcional

  const autorizado = !secret || auth === `Bearer ${secret}` || qs === secret
  if (!autorizado) {
    return fail("não autorizado", 401)
  }

  try {
    const admin = getSupabaseAdmin()
    const periodoCustomizado = dataCustom ? limitesDiaBRT(dataCustom) : undefined

    const resultado = await executarDisparoAutomaticoRelatorios(admin, {
      forcarDisparo: force,
      periodoCustomizado,
    })

    logger.info("Execução do worker de relatórios diários", {
      disparado: resultado.disparado,
      enviados: resultado.enviados,
      falhas: resultado.falhas,
      pulados: resultado.pulados,
    })

    return ok(resultado as unknown as Record<string, unknown>)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error("Falha fatal no worker de relatórios diários", { error: msg })
    return fail(`Erro ao processar relatórios: ${msg}`, 500)
  }
}
