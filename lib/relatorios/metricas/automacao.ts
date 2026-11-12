// lib/relatorios/metricas/automacao.ts
// Bloco 2: Métricas de Automação e Régua de Follow-up

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"
import type { PeriodoDiaBRT } from "../periodo"

export interface MetricasEtapasRegua {
  d1: number
  d2: number
  d3: number
}

export interface MetricasAutomacao {
  mensagensEnviadas: number // automation_jobs com sent_at no dia
  leadsDistintosReceberam: number // leads distintos que receberam envio
  leadsDistintosResponderam: number // leads distintos com responded_at no dia
  taxaResposta: number // % arredondada
  entraramEmAutomacao: number // eventos lead_moved_automacao / lead_reativado_trafego_pago_reativacao_base
  concluiramRegua: number // eventos followup_regua_concluida
  falhasEnvio: number // jobs com failed_at no dia
  filaPendenteAgora: number // jobs scheduled ou retrying agora
  etapasRegua?: MetricasEtapasRegua // opcional, só se houver dados
}

export async function coletarMetricasAutomacao(
  supabase: SupabaseClient<Database>,
  periodo: PeriodoDiaBRT
): Promise<MetricasAutomacao> {
  const { inicioIso, fimIso } = periodo

  // 1. Mensagens enviadas no período [inicioIso, fimIso)
  // Paginação segura em batches para pegar todos os jobs e extrair lead_id e metadata
  const PAGE_SIZE = 1000
  let from = 0
  let totalEnviadas = 0
  const leadsReceberamSet = new Set<string>()
  const etapas: MetricasEtapasRegua = { d1: 0, d2: 0, d3: 0 }
  let temDadoEtapa = false

  while (true) {
    const { data: batch, error } = await supabase
      .from("automation_jobs")
      .select("id, lead_id, metadata")
      .gte("sent_at", inicioIso)
      .lt("sent_at", fimIso)
      .range(from, from + PAGE_SIZE - 1)

    if (error || !batch || batch.length === 0) break

    totalEnviadas += batch.length
    for (const job of batch) {
      if (job.lead_id) leadsReceberamSet.add(job.lead_id)

      const meta = (job.metadata ?? {}) as Record<string, unknown>
      const stage = (meta.followup_stage as string) || (meta.step === 1 ? "D+1" : meta.step === 2 ? "D+2" : meta.step === 3 ? "D+3" : null)
      if (stage === "D+1") {
        etapas.d1++
        temDadoEtapa = true
      } else if (stage === "D+2") {
        etapas.d2++
        temDadoEtapa = true
      } else if (stage === "D+3") {
        etapas.d3++
        temDadoEtapa = true
      }
    }

    if (batch.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  // 2. Leads que responderam no período (responded_at)
  let fromResp = 0
  const leadsResponderamSet = new Set<string>()

  while (true) {
    const { data: batchResp, error } = await supabase
      .from("automation_jobs")
      .select("lead_id")
      .gte("responded_at", inicioIso)
      .lt("responded_at", fimIso)
      .range(fromResp, fromResp + PAGE_SIZE - 1)

    if (error || !batchResp || batchResp.length === 0) break

    for (const j of batchResp) {
      if (j.lead_id) leadsResponderamSet.add(j.lead_id)
    }

    if (batchResp.length < PAGE_SIZE) break
    fromResp += PAGE_SIZE
  }

  // 3. Taxa de resposta (%)
  const totalReceberam = leadsReceberamSet.size
  const totalResponderam = leadsResponderamSet.size
  const taxaResposta = totalReceberam > 0 ? Math.round((totalResponderam / totalReceberam) * 1000) / 10 : 0

  // 4. Entraram em automação no período (eventos lead_moved_automacao / lead_reativado_trafego_pago_reativacao_base)
  const { data: logsEntrada } = await supabase
    .from("automation_logs")
    .select("lead_id")
    .in("event_type", ["lead_moved_automacao", "lead_reativado_trafego_pago_reativacao_base"])
    .gte("created_at", inicioIso)
    .lt("created_at", fimIso)
    .limit(5000)

  const entraramSet = new Set((logsEntrada ?? []).map((l) => l.lead_id).filter(Boolean))

  // 5. Concluíram a régua (followup_regua_concluida)
  const { data: logsConcluidos } = await supabase
    .from("automation_logs")
    .select("lead_id")
    .eq("event_type", "followup_regua_concluida")
    .gte("created_at", inicioIso)
    .lt("created_at", fimIso)
    .limit(5000)

  const concluidosSet = new Set((logsConcluidos ?? []).map((l) => l.lead_id).filter(Boolean))

  // 6. Falhas de envio no período (failed_at no período)
  const { count: falhasCount } = await supabase
    .from("automation_jobs")
    .select("id", { count: "exact", head: true })
    .gte("failed_at", inicioIso)
    .lt("failed_at", fimIso)

  // 7. Fila pendente atual
  const { count: filaCount } = await supabase
    .from("automation_jobs")
    .select("id", { count: "exact", head: true })
    .in("status", ["scheduled", "retrying"])

  return {
    mensagensEnviadas: totalEnviadas,
    leadsDistintosReceberam: totalReceberam,
    leadsDistintosResponderam: totalResponderam,
    taxaResposta,
    entraramEmAutomacao: entraramSet.size,
    concluiramRegua: concluidosSet.size,
    falhasEnvio: falhasCount ?? 0,
    filaPendenteAgora: filaCount ?? 0,
    etapasRegua: temDadoEtapa ? etapas : undefined,
  }
}
