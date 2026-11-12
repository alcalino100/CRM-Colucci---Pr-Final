// lib/relatorios/metricas/trafego.ts
// Bloco 1: Leads de Tráfego Pago por Corretor + Reengajamento de Leads Antigos

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"
import { normalizePhone } from "@/lib/labels"
import { ehTrafegoPago } from "../trafego-helper"
import type { PeriodoDiaBRT } from "../periodo"

export interface CorretorTrafegoResumo {
  corretorId: string
  corretorNome: string
  totalLeads: number
  telefonesUnicos: number
}

export interface MetricasTrafegoPago {
  totalLeadsNovos: number
  totalTelefonesUnicos: number
  porCorretor: CorretorTrafegoResumo[]
  corretoresSemLeads: string[] // Nomes dos corretores ativos que não receberam leads no dia
  reengajadosAnuncioAntigos: number // Contagem de leads antigos reengajados via anúncio
}

/**
 * Coleta métricas de Tráfego Pago do dia anterior com paginação segura (sem limit silencioso).
 */
export async function coletarMetricasTrafego(
  supabase: SupabaseClient<Database>,
  periodo: PeriodoDiaBRT
): Promise<MetricasTrafegoPago> {
  const { inicioIso, fimIso } = periodo

  // 1. Buscar todos os corretores ativos
  const { data: usuariosData } = await supabase
    .from("usuarios")
    .select("id, nome, role, status")
    .eq("status", "ativo")
    .in("role", ["corretor", "corretor_vendas", "corretor_locacao"])

  const corretoresAtivos = usuariosData ?? []
  const mapaNomesCorretores = new Map<string, string>()
  for (const u of corretoresAtivos) {
    mapaNomesCorretores.set(u.id, u.nome)
  }

  // 2. Buscar todos os leads criados na janela [inicioIso, fimIso)
  // Paginação segura em blocos de 1000 para nunca truncar
  const PAGE_SIZE = 1000
  let from = 0
  let leadsNovosTrafego: Array<{
    id: string
    nome: string
    telefone: string
    corretor_id: string | null
    origem: string | null
    meta_campaign_id: string | null
    utm_campaign: string | null
  }> = []

  while (true) {
    const { data: batch, error } = await supabase
      .from("leads")
      .select("id, nome, telefone, corretor_id, origem, meta_campaign_id, utm_campaign")
      .gte("criado_em", inicioIso)
      .lt("criado_em", fimIso)
      .range(from, from + PAGE_SIZE - 1)

    if (error || !batch || batch.length === 0) break

    for (const lead of batch) {
      if (ehTrafegoPago(lead)) {
        leadsNovosTrafego.push(lead)
      }
    }

    if (batch.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  // 3. Agrupamento por corretor
  const leadsPorCorretor = new Map<string, Array<{ telefone: string }>>()
  const conjuntoTelefonesGeral = new Set<string>()

  for (const l of leadsNovosTrafego) {
    const cid = l.corretor_id || "sem_corretor"
    const lista = leadsPorCorretor.get(cid) || []
    lista.push({ telefone: l.telefone })
    leadsPorCorretor.set(cid, lista)

    const norm = normalizePhone(l.telefone)
    if (norm) conjuntoTelefonesGeral.add(norm)
  }

  const porCorretor: CorretorTrafegoResumo[] = []
  const idsCorretoresComLead = new Set<string>()

  for (const [cid, leadsList] of leadsPorCorretor.entries()) {
    idsCorretoresComLead.add(cid)
    const nome = mapaNomesCorretores.get(cid) || (cid === "sem_corretor" ? "Sem corretor atribuído" : "Outro Corretor")
    const telsUnicos = new Set(leadsList.map((l) => normalizePhone(l.telefone)).filter(Boolean)).size

    porCorretor.push({
      corretorId: cid,
      corretorNome: nome,
      totalLeads: leadsList.length,
      telefonesUnicos: telsUnicos,
    })
  }

  // Ordenar por volume decrescente de leads
  porCorretor.sort((a, b) => b.totalLeads - a.totalLeads)

  // Corretores ativos sem leads no dia
  const corretoresSemLeads: string[] = []
  for (const c of corretoresAtivos) {
    if (!idsCorretoresComLead.has(c.id)) {
      corretoresSemLeads.push(c.nome)
    }
  }
  corretoresSemLeads.sort()

  // 4. Buscar reengajamentos via anúncio (leads antigos) em automation_logs
  // Contar DISTINCT lead_id com event_type = "reengajamento_anuncio"
  let reengajadosCount = 0
  const { data: logsReengajamento } = await supabase
    .from("automation_logs")
    .select("lead_id")
    .eq("event_type", "reengajamento_anuncio")
    .gte("created_at", inicioIso)
    .lt("created_at", fimIso)
    .limit(5000)

  if (logsReengajamento) {
    const leadsReengajadosDistintos = new Set(
      logsReengajamento.map((l) => l.lead_id).filter(Boolean)
    )
    reengajadosCount = leadsReengajadosDistintos.size
  }

  return {
    totalLeadsNovos: leadsNovosTrafego.length,
    totalTelefonesUnicos: conjuntoTelefonesGeral.size,
    porCorretor,
    corretoresSemLeads,
    reengajadosAnuncioAntigos: reengajadosCount,
  }
}
