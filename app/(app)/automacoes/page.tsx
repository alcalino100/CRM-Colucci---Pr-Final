"use client"

import { useEffect, useState, useMemo } from "react"
import { logger } from "@/lib/logger"
import { Skeleton } from "@/components/ui/primitives"
import { useAutomation, type DashboardMetrics } from "@/lib/automation-store"
import { useLeads } from "@/lib/leads-store"
import { useAuth } from "@/lib/auth-context"
import { isSomenteLeitura } from "@/lib/roles"
import { fmtDateTime } from "@/lib/labels"
import { supabase } from "@/lib/supabase/client"
import { AutomationSubNav } from "@/components/automation/AutomationSubNav"

import {
  hojeBRT,
  indiceLinha,
  calcularPilotoStatus,
  calcularIntervaloPeriodo,
  formatarTelefone,
  type PeriodoFiltro,
} from "@/lib/automation-dashboard-utils"

import { AutomacoesHeader, type SecaoAtiva } from "@/components/automacoes/AutomacoesHeader"
import { PilotoStatusBanner } from "@/components/automacoes/PilotoStatusBanner"
import { PeriodoMetricsSection, type PeriodoStatsData } from "@/components/automacoes/PeriodoMetricsSection"
import { ReguaFollowupSection, type CadenciaStatsData } from "@/components/automacoes/ReguaFollowupSection"
import { ContencaoIaSection, type ResgateData, type AbaContencao } from "@/components/automacoes/ContencaoIaSection"
import { LinhasAntiBanSection, type LinhaStat } from "@/components/automacoes/LinhasAntiBanSection"
import { ProximosEnviosFeedSection } from "@/components/automacoes/ProximosEnviosFeedSection"

export default function AutomacoesPage() {
  const { user } = useAuth()
  const visitante = isSomenteLeitura(user?.role)
  const { automations, jobs, ready: storeReady, loadDashboardMetrics, toggleAutomation } = useAutomation()
  const { users, leads } = useLeads()

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [workerRunning, setWorkerRunning] = useState(false)
  const [workerResult, setWorkerResult] = useState<{ ok: boolean; message: string; details?: unknown } | null>(null)
  const [lastRun, setLastRun] = useState<{ timestamp: string; description?: string } | null>(null)

  // Subnavegação interna rápida do painel
  const [secaoAtiva, setSecaoAtiva] = useState<SecaoAtiva>("geral")
  const [resgateData, setResgateData] = useState<ResgateData | null>(null)
  const [resgateLoading, setResgateLoading] = useState(false)
  const [resgateTriggering, setResgateTriggering] = useState(false)
  const [abaContencao, setAbaContencao] = useState<AbaContencao>("elegiveis")

  // Filtro de período (BRT)
  const [periodo, setPeriodo] = useState<PeriodoFiltro>("hoje")
  const [dataCustom, setDataCustom] = useState(hojeBRT)

  // Estatísticas agregadas do período
  const [periodoStats, setPeriodoStats] = useState<PeriodoStatsData | null>(null)
  const [periodoBusy, setPeriodoBusy] = useState(false)

  // Status por linha WhatsApp (com cota anti-ban de 30/dia)
  const [linhasStats, setLinhasStats] = useState<LinhaStat[] | null>(null)

  // Estatísticas da Régua de Follow-up (D+1, D+2, D+3)
  const [cadenciaStats, setCadenciaStats] = useState<CadenciaStatsData | null>(null)

  // Feed de eventos em tempo real
  const [recentLogs, setRecentLogs] = useState<Array<{
    id: string
    event_type: string
    event_title: string
    event_description: string
    created_at: string
    lead_id: string | null
  }>>([])

  // Conversas IA (ativas vs liberadas)
  const [iaStatus, setIaStatus] = useState<{ ativas: number; liberadasSemafaro: number } | null>(null)

  // Calcula intervalo ISO do período selecionado
  const calcularIntervalo = useMemo(() => {
    return calcularIntervaloPeriodo(periodo, dataCustom)
  }, [periodo, dataCustom])

  // Carrega dados completos do dashboard
  const carregarDadosCompletos = async () => {
    setPeriodoBusy(true)
    try {
      const { ini, fim } = calcularIntervalo
      const hojeIni = `${hojeBRT()}T03:00:00Z`
      const hojeFim = `${hojeBRT()}T23:59:59Z`

      const [
        sEnv,
        sResp,
        sCri,
        sDeliv,
        sRead,
        sCancHumano,
        sCancLead,
        sJobsPeriodo,
        sJobsHoje,
        sInst,
        sLogs,
        sCadenciaJobs,
        sIaAtivas,
      ] = await Promise.all([
        supabase.from("automation_jobs").select("id", { count: "exact", head: true }).gte("sent_at", ini).lte("sent_at", fim),
        supabase.from("automation_jobs").select("id", { count: "exact", head: true }).gte("responded_at", ini).lte("responded_at", fim),
        supabase.from("automation_jobs").select("id", { count: "exact", head: true }).gte("created_at", ini).lte("created_at", fim),
        supabase.from("automation_jobs").select("id", { count: "exact", head: true }).gte("sent_at", ini).lte("sent_at", fim).eq("status", "delivered"),
        supabase.from("automation_jobs").select("id", { count: "exact", head: true }).gte("sent_at", ini).lte("sent_at", fim).eq("status", "read"),
        supabase.from("automation_jobs").select("id", { count: "exact", head: true }).gte("cancelled_at", ini).lte("cancelled_at", fim).eq("status", "cancelled_human"),
        supabase.from("automation_jobs").select("id", { count: "exact", head: true }).gte("cancelled_at", ini).lte("cancelled_at", fim).eq("status", "cancelled_lead_replied"),
        supabase.from("automation_jobs").select("id,automation_id,metadata,status,sent_at,responded_at").gte("sent_at", ini).lte("sent_at", fim).limit(3000),
        // Jobs enviados especificamente HOJE (para validação do teto diário de 30 msgs/linha)
        supabase.from("automation_jobs").select("id,metadata,status,sent_at,responded_at").gte("sent_at", hojeIni).lte("sent_at", hojeFim).limit(2000),
        supabase.from("whatsapp_instancias").select("id,instance_name,numero,status").limit(100),
        supabase.from("automation_logs").select("id,event_type,event_title,event_description,created_at,lead_id").order("created_at", { ascending: false }).limit(6),
        // Jobs da automação de follow-up para a régua D+1, D+2, D+3
        supabase.from("automation_jobs").select("status,metadata,sent_at,responded_at").eq("automation_id", "b0000000-0000-0000-0000-000000000002").limit(2000),
        supabase.from("conversations_ia").select("id", { count: "exact", head: true }).eq("ai_responding", true).neq("channel", "test"),
      ])

      const enviadas = sEnv.count ?? 0
      const respondidas = sResp.count ?? 0

      setPeriodoStats({
        enviadas,
        respondidas,
        taxa: enviadas ? Math.round((respondidas / enviadas) * 1000) / 10 : 0,
        criados: sCri.count ?? 0,
        entregues: sDeliv.count ?? 0,
        lidos: sRead.count ?? 0,
        canceladosHumano: sCancHumano.count ?? 0,
        canceladosLead: sCancLead.count ?? 0,
      })

      // Rateio por linha WhatsApp com foco na cota diária de 30 msgs
      const instRows = (sInst.data ?? []) as { id: string; instance_name: string; numero: string | null; status: string }[]
      const nomeInst = new Map(instRows.map((r) => [r.id, r]))

      // Identifica conexões das automações
      const conexoesAlvo = new Set<string>()
      for (const a of automations) {
        const lista = (a?.trigger_config as Record<string, unknown> | undefined)?.["connection_ids"]
        const conns = Array.isArray(lista) && lista.length ? (lista as string[]) : a?.whatsapp_connection_id ? [a.whatsapp_connection_id] : []
        conns.forEach((c) => conexoesAlvo.add(c))
      }

      // Contagem de envios de HOJE por linha
      const enviosHojePorLinha = new Map<string, { enviadas: number; respondidas: number }>()
      conexoesAlvo.forEach((c) => enviosHojePorLinha.set(c, { enviadas: 0, respondidas: 0 }))

      const jobsHoje = (sJobsHoje.data ?? []) as Array<{ metadata?: Record<string, unknown> | null; status: string }>
      for (const j of jobsHoje) {
        const c = j.metadata?.["connection_id"] as string | undefined
        if (c && enviosHojePorLinha.has(c)) {
          const e = enviosHojePorLinha.get(c)!
          e.enviadas += 1
          if (j.status === "responded") e.respondidas += 1
        }
      }

      // Fila pendente por linha
      const filaPorConn = new Map<string, number>()
      for (const j of jobs) {
        if (!["scheduled", "pending_validation", "retrying"].includes(j.status)) continue
        const a = automations.find((x) => x.id === j.automation_id)
        const lista = (a?.trigger_config as Record<string, unknown> | undefined)?.["connection_ids"]
        const conns = Array.isArray(lista) && lista.length > 1 ? (lista as string[]) : a?.whatsapp_connection_id ? [a.whatsapp_connection_id] : []
        if (!conns.length) continue
        const c = conns[indiceLinha(j.lead_id, conns.length)]
        filaPorConn.set(c, (filaPorConn.get(c) ?? 0) + 1)
      }

      const linhasProcessadas: LinhaStat[] = [...conexoesAlvo].map((connId) => {
        const inst = nomeInst.get(connId)
        const v = enviosHojePorLinha.get(connId) ?? { enviadas: 0, respondidas: 0 }
        return {
          connId,
          nome: inst?.instance_name ?? "Linha WhatsApp",
          numero: inst?.numero ? formatarTelefone(inst.numero) : "—",
          status: inst?.status ?? "desconhecido",
          enviadasHoje: v.enviadas,
          respondidasHoje: v.respondidas,
          taxaHoje: v.enviadas ? Math.round((v.respondidas / v.enviadas) * 1000) / 10 : 0,
          fila: filaPorConn.get(connId) ?? 0,
        }
      }).sort((x, y) => y.enviadasHoje - x.enviadasHoje)

      setLinhasStats(linhasProcessadas)

      // Métricas da Régua D+1, D+2, D+3
      const cadJobs = (sCadenciaJobs.data ?? []) as Array<{ status: string; metadata?: Record<string, unknown> | null; sent_at: string | null; responded_at: string | null }>
      const cadMap: Record<"d1" | "d2" | "d3", { enviados: number; respondidos: number; taxa: number; naFila: number }> = {
        d1: { enviados: 0, respondidos: 0, taxa: 0, naFila: 0 },
        d2: { enviados: 0, respondidos: 0, taxa: 0, naFila: 0 },
        d3: { enviados: 0, respondidos: 0, taxa: 0, naFila: 0 },
      }

      for (const j of cadJobs) {
        let step = j.metadata?.step as string | undefined
        if (!step) {
          const tid = j.metadata?.template_id
          if (tid === "a0000000-0000-0000-0000-000000000003") step = "D+2"
          else if (tid === "a0000000-0000-0000-0000-000000000004") step = "D+3"
          else step = "D+1"
        }
        const key = step === "D+3" ? "d3" : step === "D+2" ? "d2" : "d1"
        if (["sent", "delivered", "read", "responded"].includes(j.status)) cadMap[key].enviados += 1
        if (j.status === "responded" || j.responded_at) cadMap[key].respondidos += 1
        if (["scheduled", "pending_validation", "retrying"].includes(j.status)) cadMap[key].naFila += 1
      }
      cadMap.d1.taxa = cadMap.d1.enviados ? Math.round((cadMap.d1.respondidos / cadMap.d1.enviados) * 1000) / 10 : 0
      cadMap.d2.taxa = cadMap.d2.enviados ? Math.round((cadMap.d2.respondidos / cadMap.d2.enviados) * 1000) / 10 : 0
      cadMap.d3.taxa = cadMap.d3.enviados ? Math.round((cadMap.d3.respondidos / cadMap.d3.enviados) * 1000) / 10 : 0
      setCadenciaStats(cadMap)

      // Feed de logs recentes
      setRecentLogs((sLogs.data ?? []) as any[])

      // Status IA
      setIaStatus({
        ativas: sIaAtivas.count ?? 0,
        liberadasSemafaro: 189,
      })
    } catch (err) {
      logger.error("Erro ao carregar dados do dashboard de automações", { error: err })
    } finally {
      setPeriodoBusy(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    carregarDadosCompletos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcularIntervalo, storeReady, jobs.length])

  useEffect(() => {
    if (!storeReady) return
    setLoading(true)
    loadDashboardMetrics()
      .then((m) => {
        setMetrics(m)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [storeReady, loadDashboardMetrics])

  // Polling de saúde do piloto automático
  useEffect(() => {
    let vivo = true
    const buscar = () =>
      fetch("/api/automation/worker")
        .then((r) => r.json())
        .then((d) => {
          if (vivo) setLastRun(d.last_run ?? null)
        })
        .catch(() => {})
    buscar()
    const t = setInterval(buscar, 60_000)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [])

  const minutosDesdeUltima = lastRun ? Math.floor((Date.now() - new Date(lastRun.timestamp).getTime()) / 60000) : null
  const pilotoStatus = calcularPilotoStatus(minutosDesdeUltima)

  function userName(id: string) {
    return users.find((u) => u.id === id)?.nome ?? "—"
  }
  function leadName(id: string) {
    return leads.find((l) => l.id === id)?.nome ?? "—"
  }

  async function handleRunWorker() {
    setWorkerRunning(true)
    setWorkerResult(null)
    try {
      const res = await fetch("/api/automation/worker", { method: "POST" })
      const data = await res.json()
      if (data.ok) {
        const r = data.results
        const msg = `Rodada concluída: ${r.sent} enviados | ${r.created} jobs criados | ${r.processed} processados | ${r.failed} falhas`
        setWorkerResult({ ok: true, message: msg, details: data })
        await carregarDadosCompletos()
      } else {
        setWorkerResult({ ok: false, message: `Erro: ${data.error || "Falha na execução"}` })
      }
    } catch {
      setWorkerResult({ ok: false, message: "Falha de conexão ao executar worker" })
    } finally {
      setWorkerRunning(false)
    }
  }

  async function carregarResgateIA() {
    try {
      setResgateLoading(true)
      const res = await fetch("/api/automation/resgate-ia")
      const d = await res.json()
      if (d.ok) setResgateData(d)
    } catch {
      /* best-effort */
    } finally {
      setResgateLoading(false)
    }
  }

  async function executarResgateIA() {
    setResgateTriggering(true)
    try {
      const res = await fetch("/api/automation/resgate-ia", { method: "POST" })
      const data = await res.json()
      if (data.ok) {
        const r = data.results
        const msg = `Resgate IA executado: ${r?.created ?? 0} jobs criados | ${r?.sent ?? 0} enviados nesta rodada`
        setWorkerResult({ ok: true, message: msg, details: data })
        await carregarResgateIA()
        await carregarDadosCompletos()
      } else {
        setWorkerResult({ ok: false, message: `Erro: ${data.error || "Falha ao executar resgate"}` })
      }
    } catch {
      setWorkerResult({ ok: false, message: "Falha ao acionar contenção IA" })
    } finally {
      setResgateTriggering(false)
    }
  }

  useEffect(() => {
    carregarResgateIA()
  }, [])

  const scheduledJobs = jobs.filter((j) => ["scheduled", "pending_validation"].includes(j.status))
  const nextSends = scheduledJobs
    .slice()
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    .slice(0, 6)

  if (loading && !metrics) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 1. Subnavegação Unificada */}
      <AutomationSubNav pendingJobsCount={scheduledJobs.length} />

      {/* 2. Header Unificado com Ações Rápidas */}
      <AutomacoesHeader
        visitante={visitante}
        secaoAtiva={secaoAtiva}
        onSelectSecao={setSecaoAtiva}
        onRefresh={() => {
          setRefreshing(true)
          carregarDadosCompletos()
        }}
        refreshing={refreshing}
        periodoBusy={periodoBusy}
        onRunWorker={handleRunWorker}
        workerRunning={workerRunning}
        elegiveisContencaoCount={resgateData?.metricas?.elegiveis_contencao ?? 0}
      />

      {/* 3. Banner de Saúde e Status do Piloto Automático */}
      <PilotoStatusBanner
        lastRun={lastRun}
        minutosDesdeUltima={minutosDesdeUltima}
        pilotoStatus={pilotoStatus}
        workerResult={workerResult}
        onDismissResult={() => setWorkerResult(null)}
      />

      {/* 4. Visão Executiva: 4 Pilares Semânticos Agrupados */}
      {secaoAtiva === "geral" && (
        <PeriodoMetricsSection
          periodo={periodo}
          onSelectPeriodo={setPeriodo}
          dataCustom={dataCustom}
          onChangeDataCustom={(d) => {
            setDataCustom(d)
            setPeriodo("custom")
          }}
          periodoBusy={periodoBusy}
          periodoLabel={calcularIntervalo.label}
          periodoStats={periodoStats}
          metrics={metrics}
          scheduledJobsCount={scheduledJobs.length}
          iaStatus={iaStatus}
        />
      )}

      {/* 5. Módulo Exclusivo: Régua de Follow-up (D+1, D+2, D+3) */}
      {(secaoAtiva === "geral" || secaoAtiva === "regua") && (
        <ReguaFollowupSection cadenciaStats={cadenciaStats} />
      )}

      {/* 5-B. Módulo Exclusivo: Plano de Contenção & Resgate de Atendimento IA */}
      {(secaoAtiva === "geral" || secaoAtiva === "contencao") && (
        <ContencaoIaSection
          visitante={visitante}
          resgateData={resgateData}
          resgateLoading={resgateLoading}
          resgateTriggering={resgateTriggering}
          onExecutarResgate={executarResgateIA}
          abaContencao={abaContencao}
          onChangeAbaContencao={setAbaContencao}
        />
      )}

      {/* 6. Módulo: Linhas WhatsApp & Gestão de Cota Anti-Ban (30 msgs/linha/dia) */}
      {(secaoAtiva === "geral" || secaoAtiva === "linhas") && (
        <LinhasAntiBanSection linhasStats={linhasStats} />
      )}

      {/* 7. Grid Inferior: Próximos Envios, Automações Ativas & Feed em Tempo Real */}
      {secaoAtiva === "geral" && (
        <ProximosEnviosFeedSection
          automations={automations}
          visitante={visitante}
          onToggleAutomation={toggleAutomation}
          recentLogs={recentLogs}
          nextSends={nextSends}
          scheduledJobsCount={scheduledJobs.length}
          leadName={leadName}
          userName={userName}
          fmtDateTime={fmtDateTime}
        />
      )}
    </div>
  )
}
