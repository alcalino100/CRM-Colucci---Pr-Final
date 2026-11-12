// lib/relatorios/metricas/arquivados.ts
// Bloco 4: Leads Arquivados e Reaparecidos (Eventos do dia via tabela auditoria)

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"
import { MOTIVO_ARQUIVAMENTO_LABEL, type MotivoArquivamento } from "@/lib/mock-data"
import { type PeriodoDiaBRT, diaAnteriorBRT, TIMEZONE_BRT } from "../periodo"

export interface CorretorArquivadosResumo {
  corretorNome: string
  arquivados: number
  reaparecidos: number
}

export interface MetricasArquivados {
  totalArquivados: number
  arquivadosManual: number
  arquivadosAutomatico: number
  porMotivo: Array<{ motivo: string; contagem: number }>
  totalReaparecidos: number
  reaparecidosRedistribuidos: number
  conflitosDuplicidade: number
  porCorretor: CorretorArquivadosResumo[]
  vaoReaparecerHoje: number // Leads com data_reaparecimento = hoje BRT
}

export async function coletarMetricasArquivados(
  supabase: SupabaseClient<Database>,
  periodo: PeriodoDiaBRT
): Promise<MetricasArquivados> {
  const { inicioIso, fimIso } = periodo

  // 1. Buscar registros de auditoria do período (tipo arquivamento ou reativacao)
  const { data: auditorias } = await supabase
    .from("auditoria")
    .select("id, lead_id, lead_nome, usuario_nome, tipo, descricao, motivo, criado_em")
    .in("tipo", ["arquivamento", "reativacao"])
    .gte("criado_em", inicioIso)
    .lt("criado_em", fimIso)
    .limit(5000)

  const logsAuditoria = auditorias ?? []

  // Também buscar se há auditorias gravadas como tipo 'edicao' com texto 'arquivado' (compatibilidade)
  const { data: auditoriasEdicao } = await supabase
    .from("auditoria")
    .select("id, lead_id, lead_nome, usuario_nome, tipo, descricao, motivo, criado_em")
    .eq("tipo", "edicao")
    .ilike("descricao", "%arquivado%")
    .gte("criado_em", inicioIso)
    .lt("criado_em", fimIso)
    .limit(1000)

  const todosEventos = [...logsAuditoria, ...(auditoriasEdicao ?? [])]

  // Buscar dados dos leads envolvidos para contexto
  const leadIdsEnvolvidos = Array.from(new Set(todosEventos.map((a) => a.lead_id).filter(Boolean))) as string[]
  let leadsInfoMap = new Map<string, { corretor_id: string | null; arquivado_por: string | null }>()

  if (leadIdsEnvolvidos.length > 0) {
    const { data: leadsContext } = await supabase
      .from("leads")
      .select("id, corretor_id, arquivado_por")
      .in("id", leadIdsEnvolvidos)

    leadsInfoMap = new Map(
      (leadsContext ?? []).map((l) => [l.id, { corretor_id: l.corretor_id, arquivado_por: l.arquivado_por }])
    )
  }

  // Buscar todos os usuários para mapear nomes de corretores
  const { data: usuariosData } = await supabase.from("usuarios").select("id, nome")
  const mapaUsuarios = new Map((usuariosData ?? []).map((u) => [u.id, u.nome]))

  let totalArquivados = 0
  let arquivadosManual = 0
  let arquivadosAutomatico = 0
  const motivosMap = new Map<string, number>()

  let totalReaparecidos = 0
  let reaparecidosRedistribuidos = 0

  const porCorretorMap = new Map<string, { arquivados: number; reaparecidos: number }>()

  for (const ev of todosEventos) {
    const isArquivamento = ev.tipo === "arquivamento" || ev.descricao.toLowerCase().includes("arquivado")
    const isReativacao = ev.tipo === "reativacao"

    const leadCtx = ev.lead_id ? leadsInfoMap.get(ev.lead_id) : null
    const corretorId = leadCtx?.corretor_id || "sem_corretor"
    const corretorNome = mapaUsuarios.get(corretorId) || (corretorId === "sem_corretor" ? "Sem corretor atribuído" : "Corretor")

    const statCorretor = porCorretorMap.get(corretorNome) || { arquivados: 0, reaparecidos: 0 }

    if (isArquivamento && !isReativacao) {
      totalArquivados++
      statCorretor.arquivados++

      // Manual vs Automático
      const autor = (ev.usuario_nome || "").toLowerCase()
      const isAuto = autor.includes("sistema") || autor.includes("cron") || (!leadCtx?.arquivado_por && autor === "")
      if (isAuto) {
        arquivadosAutomatico++
      } else {
        arquivadosManual++
      }

      // Motivo do arquivamento
      const rawMotivo = (ev.motivo || "outro").toLowerCase()
      const labelMotivo = MOTIVO_ARQUIVAMENTO_LABEL[rawMotivo as MotivoArquivamento] || ev.motivo || "Outro"
      motivosMap.set(labelMotivo, (motivosMap.get(labelMotivo) || 0) + 1)
    } else if (isReativacao) {
      totalReaparecidos++
      statCorretor.reaparecidos++

      // Redistribuído (corretor original inativo)
      if (ev.descricao.toLowerCase().includes("redistribuído") || ev.descricao.toLowerCase().includes("redistribuido")) {
        reaparecidosRedistribuidos++
      }
    }

    porCorretorMap.set(corretorNome, statCorretor)
  }

  // 2. Conflitos de duplicidade em automation_logs
  const { count: conflitosCount } = await supabase
    .from("automation_logs")
    .select("id", { count: "exact", head: true })
    .eq("event_type", "conflito_duplicidade_reativacao")
    .gte("created_at", inicioIso)
    .lt("created_at", fimIso)

  // 3. Vão reaparecer hoje: leads com data_reaparecimento = hoje civil no fuso de Brasília
  const hojePartes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE_BRT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())

  const { count: vaoReaparecerCount } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("data_reaparecimento", hojePartes)
    .not("arquivado_em", "is", null)
    .or("sem_interesse_permanente.is.null,sem_interesse_permanente.eq.false")

  // Ordenar lista de motivos por frequência decrescente
  const porMotivo = Array.from(motivosMap.entries())
    .map(([motivo, contagem]) => ({ motivo, contagem }))
    .sort((a, b) => b.contagem - a.contagem)

  // Agrupamento por corretor
  const porCorretor: CorretorArquivadosResumo[] = Array.from(porCorretorMap.entries())
    .map(([corretorNome, stats]) => ({
      corretorNome,
      arquivados: stats.arquivados,
      reaparecidos: stats.reaparecidos,
    }))
    .filter((c) => c.arquivados > 0 || c.reaparecidos > 0)
    .sort((a, b) => b.reaparecidos + b.arquivados - (a.reaparecidos + a.arquivados))

  return {
    totalArquivados,
    arquivadosManual,
    arquivadosAutomatico,
    porMotivo,
    totalReaparecidos,
    reaparecidosRedistribuidos,
    conflitosDuplicidade: conflitosCount ?? 0,
    porCorretor,
    vaoReaparecerHoje: vaoReaparecerCount ?? 0,
  }
}
