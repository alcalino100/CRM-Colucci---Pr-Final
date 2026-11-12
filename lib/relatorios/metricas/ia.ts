// lib/relatorios/metricas/ia.ts
// Bloco 3: Leads que responderam, IA assumiu, escalou ou agendou visita

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"
import type { PeriodoDiaBRT } from "../periodo"

export interface CorretorAtendimentoIAResumo {
  corretorId: string
  corretorNome: string
  leadsAtendidosIA: number
  visitasAgendadasIA: number
}

export interface MetricasIA {
  responderamParaIA: number // distinct lead_id com lead_respondeu_atendimento_ia
  iaAssumiuAtendimento: number // distinct lead_id com ia_assumiu_atendimento
  iaEscalouParaHumano: number // distinct lead_id com ia_handoff_humano ou ia_escalada
  visitasAgendadasIA: number // distinct lead_id com ia_visita_agendada
  porCorretor: CorretorAtendimentoIAResumo[]
}

export async function coletarMetricasIA(
  supabase: SupabaseClient<Database>,
  periodo: PeriodoDiaBRT
): Promise<MetricasIA> {
  const { inicioIso, fimIso } = periodo

  // 1. Buscar eventos de IA no período
  const { data: logs } = await supabase
    .from("automation_logs")
    .select("lead_id, event_type")
    .in("event_type", [
      "lead_respondeu_atendimento_ia",
      "ia_assumiu_atendimento",
      "ia_handoff_humano",
      "ia_escalada",
      "ia_visita_agendada",
    ])
    .gte("created_at", inicioIso)
    .lt("created_at", fimIso)
    .limit(5000)

  const logsIA = logs ?? []

  const responderamParaIASet = new Set<string>()
  const iaAssumiuSet = new Set<string>()
  const iaEscalouSet = new Set<string>()
  const visitasAgendadasSet = new Set<string>()
  const todosLeadsIASet = new Set<string>()

  for (const log of logsIA) {
    if (!log.lead_id) continue
    todosLeadsIASet.add(log.lead_id)

    if (log.event_type === "lead_respondeu_atendimento_ia") {
      responderamParaIASet.add(log.lead_id)
    } else if (log.event_type === "ia_assumiu_atendimento") {
      iaAssumiuSet.add(log.lead_id)
    } else if (log.event_type === "ia_handoff_humano" || log.event_type === "ia_escalada") {
      iaEscalouSet.add(log.lead_id)
    } else if (log.event_type === "ia_visita_agendada") {
      visitasAgendadasSet.add(log.lead_id)
    }
  }

  // 2. Quebra por corretor dono do lead
  const porCorretor: CorretorAtendimentoIAResumo[] = []

  if (todosLeadsIASet.size > 0) {
    const idsLeads = Array.from(todosLeadsIASet)
    const { data: leadsData } = await supabase
      .from("leads")
      .select("id, corretor_id")
      .in("id", idsLeads)

    const corretorPorLead = new Map<string, string>()
    const todosCorretoresIds = new Set<string>()

    for (const l of leadsData ?? []) {
      if (l.corretor_id) {
        corretorPorLead.set(l.id, l.corretor_id)
        todosCorretoresIds.add(l.corretor_id)
      }
    }

    // Buscar nomes dos corretores
    let mapaNomes = new Map<string, string>()
    if (todosCorretoresIds.size > 0) {
      const { data: usersData } = await supabase
        .from("usuarios")
        .select("id, nome")
        .in("id", Array.from(todosCorretoresIds))

      mapaNomes = new Map((usersData ?? []).map((u) => [u.id, u.nome]))
    }

    const mapaCorretorTotais = new Map<string, { atendidos: number; visitas: number }>()

    for (const leadId of responderamParaIASet) {
      const cid = corretorPorLead.get(leadId) || "sem_corretor"
      const cur = mapaCorretorTotais.get(cid) || { atendidos: 0, visitas: 0 }
      cur.atendidos++
      mapaCorretorTotais.set(cid, cur)
    }

    for (const leadId of visitasAgendadasSet) {
      const cid = corretorPorLead.get(leadId) || "sem_corretor"
      const cur = mapaCorretorTotais.get(cid) || { atendidos: 0, visitas: 0 }
      cur.visitas++
      mapaCorretorTotais.set(cid, cur)
    }

    for (const [cid, stats] of mapaCorretorTotais.entries()) {
      const nome = mapaNomes.get(cid) || (cid === "sem_corretor" ? "Sem corretor atribuído" : "Corretor")
      porCorretor.push({
        corretorId: cid,
        corretorNome: nome,
        leadsAtendidosIA: stats.atendidos,
        visitasAgendadasIA: stats.visitas,
      })
    }

    porCorretor.sort((a, b) => b.leadsAtendidosIA - a.leadsAtendidosIA)
  }

  return {
    responderamParaIA: responderamParaIASet.size,
    iaAssumiuAtendimento: iaAssumiuSet.size,
    iaEscalouParaHumano: iaEscalouSet.size,
    visitasAgendadasIA: visitasAgendadasSet.size,
    porCorretor,
  }
}
