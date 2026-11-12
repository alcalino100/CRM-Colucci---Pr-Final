// app/api/relatorios/preview/route.ts
// Endpoint para pré-visualização em tempo real do relatório diário do CRM

import { ok, fail } from "@/lib/api/response"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { logger } from "@/lib/logger"
import { limitesDiaAnteriorBRT, limitesDiaBRT } from "@/lib/relatorios/periodo"
import { consolidarRelatorioDia, type SecoesAtivasConfig } from "@/lib/relatorios/montar"
import { formatarRelatorioWhatsApp } from "@/lib/relatorios/formatar-whatsapp"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  if (!process.env.SUPABASE_SECRET_KEY) {
    return fail("configure SUPABASE_SECRET_KEY", 500)
  }

  const url = new URL(request.url)
  const dataParam = url.searchParams.get("data") // YYYY-MM-DD

  try {
    const admin = getSupabaseAdmin()
    const periodo = dataParam ? limitesDiaBRT(dataParam) : limitesDiaAnteriorBRT()

    // Carregar config geral para saber seções ativas
    const { data: config } = await admin
      .from("relatorio_config")
      .select("*")
      .eq("id", "main")
      .maybeSingle()

    const secoes = (config?.secoes as Partial<SecoesAtivasConfig>) ?? undefined
    const incluirGestores = Boolean(config?.incluir_gestores_no_tempo)
    const listarNomesLeads = Boolean(config?.listar_nomes_leads)

    const dados = await consolidarRelatorioDia(admin, periodo, {
      secoes,
      incluirGestoresNoTempo: incluirGestores,
      listarNomesLeads,
    })

    const texto = formatarRelatorioWhatsApp(dados)

    return ok({
      periodo: dados.periodo,
      texto,
      dados,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error("Erro ao gerar preview de relatório", { error: msg })
    return fail(`Erro ao gerar preview: ${msg}`, 500)
  }
}
