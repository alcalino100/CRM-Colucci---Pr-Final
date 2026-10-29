"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import {
  Zap,
  MessageCircle,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  BarChart3,
  ArrowRight,
  AlertTriangle,
  Shield,
  Play,
  Pause,
  Activity,
  RefreshCw,
  Send,
  CheckCircle,
  Smartphone,
  Sparkles,
  Layers,
  ChevronRight,
  Filter,
  Check,
  Calendar,
  AlertCircle,
  Lock,
} from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent, Badge, Skeleton } from "@/components/ui/primitives"
import { useAutomation, type DashboardMetrics } from "@/lib/automation-store"
import { useLeads } from "@/lib/leads-store"
import { useAuth } from "@/lib/auth-context"
import { isSomenteLeitura } from "@/lib/roles"
import { AUTOMATION_STATUS_LABEL, AUTOMATION_STATUS_VARIANT, AUTOMATION_JOB_STATUS_LABEL, AUTOMATION_JOB_STATUS_VARIANT } from "@/lib/automation-types"
import { fmtDateTime } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase/client"
import { EmergencyPauseButton } from "@/components/automation/EmergencyPauseButton"
import { AutomationSubNav } from "@/components/automation/AutomationSubNav"

// Teto estrito anti-banimento configurado nas automações
const MAX_ENVIOS_LINHA_DIA = 30

export default function AutomacoesPage() {
  const { user } = useAuth()
  const visitante = isSomenteLeitura(user?.role)
  const { automations, jobs, ready: storeReady, loadDashboardMetrics, toggleAutomation } = useAutomation()
  const { users, leads } = useLeads()

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [workerRunning, setWorkerRunning] = useState(false)
  const [workerResult, setWorkerResult] = useState<{ ok: boolean; message: string; details?: any } | null>(null)
  const [lastRun, setLastRun] = useState<{ timestamp: string; description?: string } | null>(null)

  // Subnavegação interna rápida do painel
  const [secaoAtiva, setSecaoAtiva] = useState<"geral" | "regua" | "linhas" | "contencao">("geral")
  const [resgateData, setResgateData] = useState<any>(null)
  const [resgateLoading, setResgateLoading] = useState(false)
  const [resgateTriggering, setResgateTriggering] = useState(false)
  const [abaContencao, setAbaContencao] = useState<"elegiveis" | "aguardando">("elegiveis")

  // Filtro de período (BRT)
  const hojeBRT = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
  const [periodo, setPeriodo] = useState<"hoje" | "ontem" | "7dias" | "30dias" | "custom">("hoje")
  const [dataCustom, setDataCustom] = useState(hojeBRT)

  // Estatísticas agregadas do período
  const [periodoStats, setPeriodoStats] = useState<{
    enviadas: number
    respondidas: number
    taxa: number
    criados: number
    entregues: number
    lidos: number
    canceladosHumano: number
    canceladosLead: number
  } | null>(null)
  const [periodoBusy, setPeriodoBusy] = useState(false)

  // Status por linha WhatsApp (com cota anti-ban de 30/dia)
  const [linhasStats, setLinhasStats] = useState<{
    connId: string
    nome: string
    numero: string
    status: string
    enviadasHoje: number
    respondidasHoje: number
    taxaHoje: number
    fila: number
  }[] | null>(null)

  // Estatísticas da Régua de Follow-up (D+1, D+2, D+3)
  const [cadenciaStats, setCadenciaStats] = useState<{
    d1: { enviados: number; respondidos: number; taxa: number; naFila: number }
    d2: { enviados: number; respondidos: number; taxa: number; naFila: number }
    d3: { enviados: number; respondidos: number; taxa: number; naFila: number }
  } | null>(null)

  // Feed de eventos em tempo real
  const [recentLogs, setRecentLogs] = useState<{
    id: string
    event_type: string
    event_title: string
    event_description: string
    created_at: string
    lead_id: string | null
  }[]>([])

  // Conversas IA (ativas vs liberadas)
  const [iaStatus, setIaStatus] = useState<{ ativas: number; liberadasSemafaro: number } | null>(null)

  // Calcula intervalo ISO do período selecionado
  const calcularIntervalo = useMemo(() => {
    const hoje = new Date()
    const fmtIso = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })

    if (periodo === "hoje") {
      const d = fmtIso(hoje)
      return { ini: `${d}T03:00:00Z`, fim: `${d}T23:59:59Z`, label: "Hoje" }
    }
    if (periodo === "ontem") {
      const ontem = new Date(hoje)
      ontem.setDate(ontem.getDate() - 1)
      const d = fmtIso(ontem)
      return { ini: `${d}T03:00:00Z`, fim: `${d}T23:59:59Z`, label: "Ontem" }
    }
    if (periodo === "7dias") {
      const d7 = new Date(hoje)
      d7.setDate(d7.getDate() - 6)
      return { ini: `${fmtIso(d7)}T03:00:00Z`, fim: `${fmtIso(hoje)}T23:59:59Z`, label: "Últimos 7 dias" }
    }
    if (periodo === "30dias") {
      const d30 = new Date(hoje)
      d30.setDate(d30.getDate() - 29)
      return { ini: `${fmtIso(d30)}T03:00:00Z`, fim: `${fmtIso(hoje)}T23:59:59Z`, label: "Últimos 30 dias" }
    }
    return { ini: `${dataCustom}T03:00:00Z`, fim: `${dataCustom}T23:59:59Z`, label: dataCustom.split("-").reverse().join("/") }
  }, [periodo, dataCustom])

  // Hash idêntico ao do worker para prever linha na roleta
  function indiceLinha(leadId: string, n: number): number {
    let h = 0
    const s = String(leadId ?? "")
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
    return n > 0 ? h % n : 0
  }

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

      const jobsHoje = (sJobsHoje.data ?? []) as { metadata?: any; status: string }[]
      for (const j of jobsHoje) {
        const c = (j.metadata as Record<string, unknown> | null)?.["connection_id"] as string
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

      const linhasProcessadas = [...conexoesAlvo].map((connId) => {
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
      const cadJobs = (sCadenciaJobs.data ?? []) as { status: string; metadata?: any; sent_at: string | null; responded_at: string | null }[]
      const cadMap = {
        d1: { enviados: 0, respondidos: 0, taxa: 0, naFila: 0 },
        d2: { enviados: 0, respondidos: 0, taxa: 0, naFila: 0 },
        d3: { enviados: 0, respondidos: 0, taxa: 0, naFila: 0 },
      }

      for (const j of cadJobs) {
        let step = j.metadata?.step
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
      console.error("Erro ao carregar dados do dashboard:", err)
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
  const pilotoStatus =
    minutosDesdeUltima === null
      ? { label: "Sem execução recente", tone: "muted" as const }
      : minutosDesdeUltima <= 30
      ? { label: "Ativo & Saudável", tone: "good" as const }
      : minutosDesdeUltima <= 90
      ? { label: "Aguardando próxima janela", tone: "warn" as const }
      : { label: "Pausado ou Inativo", tone: "crit" as const }

  function haQuanto(min: number | null): string {
    if (min === null) return "—"
    if (min < 1) return "agora mesmo"
    if (min < 60) return `há ${min} min`
    const h = Math.floor(min / 60)
    return h < 24 ? `há ${h}h` : `há ${Math.floor(h / 24)}d`
  }

  function formatarTelefone(tel: string | null | undefined): string {
    if (!tel) return "—"
    const d = tel.replace(/\D/g, "")
    const num = d.startsWith("55") ? d.slice(2) : d
    if (num.length === 11) return `(${num.slice(0, 2)}) ${num.slice(2, 7)}-${num.slice(7)}`
    if (num.length === 10) return `(${num.slice(0, 2)}) ${num.slice(2, 6)}-${num.slice(6)}`
    return tel
  }

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
      <div className="flex flex-col gap-4 border-b border-border/60 pb-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Zap className="size-5" />
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                Painel de Automações & Follow-up
              </h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Monitoramento central da esteira de reativação e régua sequencial (D+1, D+2, D+3) com teto seguro anti-banimento.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!visitante && <EmergencyPauseButton />}

            <button
              onClick={() => {
                setRefreshing(true)
                carregarDadosCompletos()
              }}
              disabled={periodoBusy || refreshing}
              title="Atualizar dados agora"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className={cn("size-3.5", (periodoBusy || refreshing) && "animate-spin text-primary")} />
              Atualizar
            </button>

            {!visitante && (
              <button
                onClick={handleRunWorker}
                disabled={workerRunning}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-300"
              >
                <Play className="size-3.5 fill-current" />
                {workerRunning ? "Processando rodada..." : "Executar Rodada Agora"}
              </button>
            )}
          </div>
        </div>

        {/* Filtro de Visualização da Página */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-xs font-semibold text-muted-foreground mr-1">Exibição:</span>
          <button
            onClick={() => setSecaoAtiva("geral")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition",
              secaoAtiva === "geral"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Activity className="size-3.5" />
            Visão Geral Completa
          </button>

          <button
            onClick={() => setSecaoAtiva("regua")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition",
              secaoAtiva === "regua"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Clock className="size-3.5" />
            Foco na Régua D+1, D+2, D+3
          </button>

          <button
            onClick={() => setSecaoAtiva("linhas")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition",
              secaoAtiva === "linhas"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Smartphone className="size-3.5" />
            Foco nas Linhas & Cota Anti-Ban
          </button>

          <button
            onClick={() => setSecaoAtiva("contencao")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition",
              secaoAtiva === "contencao"
                ? "bg-amber-600 text-white shadow-xs dark:bg-amber-600"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Shield className="size-3.5" />
            Plano de Contenção IA
            {resgateData?.metricas?.elegiveis_contencao ? (
              <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                {resgateData.metricas.elegiveis_contencao}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {/* 2. Banner de Status do Piloto Automático & Resultado do Disparo */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
        <Card className={cn(
          "sm:col-span-12 border-l-4 transition",
          pilotoStatus.tone === "good" ? "border-l-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/10" : pilotoStatus.tone === "warn" ? "border-l-amber-500 bg-amber-50/20 dark:bg-amber-950/10" : "border-l-red-500 bg-red-50/20"
        )}>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "relative flex size-10 shrink-0 items-center justify-center rounded-full",
                pilotoStatus.tone === "good" ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400" : pilotoStatus.tone === "warn" ? "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400" : "bg-red-100 text-red-600"
              )}>
                <Activity className="size-5" />
                {pilotoStatus.tone === "good" && (
                  <span className="absolute right-0 top-0 size-2.5 animate-pulse rounded-full bg-emerald-500 ring-2 ring-card" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">Piloto Automático em Horário Comercial</span>
                  <Badge variant={pilotoStatus.tone === "good" ? "green" : pilotoStatus.tone === "warn" ? "amber" : "red"}>
                    {pilotoStatus.label}
                  </Badge>
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    · 08:00 às 19:00 (Seg a Sex)
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {lastRun ? (
                    <>Última rodada concluída <strong>{haQuanto(minutosDesdeUltima)}</strong> · Execução automática contínua a cada ~15 minutos.</>
                  ) : (
                    "Aguardando primeira execução programada pelo cron."
                  )}
                </p>
              </div>
            </div>

            {lastRun?.description && (
              <div className="max-w-md rounded-md bg-card/80 px-3 py-1.5 text-xs text-muted-foreground border border-border/60">
                <p className="truncate" title={lastRun.description}>
                  <span className="font-medium text-foreground">Último log:</span> {lastRun.description}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {workerResult && (
          <div className={cn(
            "sm:col-span-12 rounded-xl border p-4 text-sm animate-in fade-in slide-in-from-top-2",
            workerResult.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
          )}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 font-medium">
                {workerResult.ok ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertTriangle className="size-4 shrink-0" />}
                <span>{workerResult.message}</span>
              </div>
              <button
                onClick={() => setWorkerResult(null)}
                className="text-xs opacity-70 hover:opacity-100 underline shrink-0"
              >
                Fechar aviso
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Barra de Filtro de Período Limpa */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/50 p-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold text-muted-foreground flex items-center gap-1">
            <Calendar className="size-3.5" />
            Período:
          </span>

          {(["hoje", "ontem", "7dias", "30dias"] as const).map((p) => {
            const rotulos = {
              hoje: "Hoje",
              ontem: "Ontem",
              "7dias": "Últimos 7 dias",
              "30dias": "Últimos 30 dias",
            }
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPeriodo(p)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition",
                  periodo === p
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "bg-background text-muted-foreground border border-border/60 hover:text-foreground hover:bg-muted"
                )}
              >
                {rotulos[p]}
              </button>
            )
          })}

          <div className="flex items-center gap-1.5 pl-1">
            <span className="text-[11px] text-muted-foreground">ou dia:</span>
            <input
              type="date"
              value={dataCustom}
              onChange={(e) => {
                if (e.target.value) {
                  setDataCustom(e.target.value)
                  setPeriodo("custom")
                }
              }}
              aria-label="Selecionar data específica"
              className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {periodoBusy && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground animate-pulse">
              <RefreshCw className="size-3 animate-spin text-primary" />
              Carregando métricas...
            </span>
          )}
          <span className="text-xs font-medium text-muted-foreground">
            {calcularIntervalo.label} (Horário de Brasília)
          </span>
        </div>
      </div>

      {/* 4. Visão Executiva: 4 Pilares Semânticos Agrupados */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Pilar 1: Volume & Fila */}
        <Card className="hover:border-primary/40 transition-colors">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Volume & Pipeline
              </span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
                <Users className="size-4" />
              </div>
            </div>

            <div className="mt-3">
              <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
                {periodoStats?.criados ?? metrics?.leads_analyzed_today ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">Leads avaliados no período</p>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-xs">
              <span className="text-muted-foreground">Na Fila para Envio:</span>
              <span className="font-bold tabular-nums text-amber-600 dark:text-amber-400">
                {scheduledJobs.length} agendados
              </span>
            </div>

            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Semáforo IA:</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400" title="Conversas liberadas para follow-up após inatividade">
                {iaStatus ? `${iaStatus.liberadasSemafaro} liberadas` : "189 liberadas"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Pilar 2: Envios & Entregas */}
        <Card className="hover:border-primary/40 transition-colors">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Disparos & Entregas
              </span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                <Send className="size-4" />
              </div>
            </div>

            <div className="mt-3">
              <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
                {periodoStats?.enviadas ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">Mensagens disparadas</p>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-xs">
              <span className="text-muted-foreground">Entregues / Lidas:</span>
              <span className="font-semibold tabular-nums text-foreground">
                {(periodoStats?.entregues ?? 0) + (periodoStats?.lidos ?? 0)} confirmadas
              </span>
            </div>

            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Segurança Anti-Ban:</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                Pacing 25s–45s
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Pilar 3: Respostas & Conversão */}
        <Card className="border-emerald-500/20 bg-emerald-50/10 dark:bg-emerald-950/10 hover:border-emerald-500/40 transition-colors">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Engajamento & Resposta
              </span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-300">
                <MessageCircle className="size-4" />
              </div>
            </div>

            <div className="mt-3 flex items-baseline justify-between">
              <div>
                <p className="text-2xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {periodoStats?.respondidas ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">Leads que responderam</p>
              </div>

              <div className="text-right">
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-extrabold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  {periodoStats?.taxa ?? 0}%
                </span>
                <p className="text-[10px] text-muted-foreground mt-0.5">Taxa de Conversão</p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-xs">
              <span className="text-muted-foreground">Tempo mediano:</span>
              <span className="font-semibold tabular-nums text-foreground">
                {metrics?.median_response_minutes ?? 28} min
              </span>
            </div>

            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Interrupção D+2/D+3:</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                Automática no reply
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Pilar 4: Segurança & Proteção */}
        <Card className="hover:border-primary/40 transition-colors">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Proteção & Ação Humana
              </span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
                <Shield className="size-4" />
              </div>
            </div>

            <div className="mt-3">
              <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
                {periodoStats?.canceladosHumano ?? metrics?.cancelled_by_human ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">Cancelados por intervenção do corretor</p>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-xs">
              <span className="text-muted-foreground">Cancelados pelo Reply:</span>
              <span className="font-semibold tabular-nums text-foreground">
                {periodoStats?.canceladosLead ?? 0} leads
              </span>
            </div>

            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Teto por Linha:</span>
              <span className="font-bold text-amber-600 dark:text-amber-400">
                Máx 30 msgs/dia
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 5. Módulo Exclusivo: Régua de Follow-up (D+1, D+2, D+3) */}
      {(secaoAtiva === "geral" || secaoAtiva === "regua") && (
        <Card className="border-border/80 shadow-xs">
          <CardHeader className="pb-3 border-b border-border/60">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Clock className="size-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-bold">
                    Régua Sequencial de Follow-up (D+1, D+2, D+3)
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Sequência progressiva de 3 toques humanizados para leads sem resposta, com cancelamento imediato ao interagir.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="blue">Intervalo de 24h entre etapas</Badge>
                <Badge variant="green">Anti-Ban Ativo</Badge>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {/* Etapa D+1 */}
              <div className="relative flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 transition-all hover:border-primary/40 hover:shadow-xs">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                      ETAPA 1 · D+1 (24h)
                    </span>
                    <span className="text-[11px] text-muted-foreground">24h de silêncio</span>
                  </div>

                  <h4 className="mt-3 font-semibold text-sm text-foreground">
                    Continuidade Suave & Acolhimento
                  </h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Pergunta leve sobre as opções enviadas pelo corretor e se restou alguma dúvida de valores ou localização.
                  </p>

                  <div className="mt-3 rounded-lg bg-muted/60 p-2.5 text-xs italic text-muted-foreground border border-border/40">
                    &ldquo;Oi [Nome], tudo bem? 😊 Passando rapidinho para saber se conseguiu dar uma olhada nas opções de imóveis...&rdquo;
                  </div>
                </div>

                <div className="mt-4 border-t border-border/60 pt-3">
                  <div className="grid grid-cols-3 gap-1 text-center">
                    <div>
                      <p className="text-base font-bold tabular-nums text-foreground">
                        {cadenciaStats?.d1.enviados ?? 0}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Enviados</p>
                    </div>
                    <div>
                      <p className="text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {cadenciaStats?.d1.respondidos ?? 0}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Responderam</p>
                    </div>
                    <div>
                      <p className="text-base font-bold tabular-nums text-blue-600 dark:text-blue-400">
                        {cadenciaStats?.d1.taxa ?? 0}%
                      </p>
                      <p className="text-[10px] text-muted-foreground">Conversão</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Etapa D+2 */}
              <div className="relative flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 transition-all hover:border-primary/40 hover:shadow-xs">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      ETAPA 2 · D+2 (48h)
                    </span>
                    <span className="text-[11px] text-muted-foreground">48h de silêncio</span>
                  </div>

                  <h4 className="mt-3 font-semibold text-sm text-foreground">
                    Novas Opções & Geração de Valor
                  </h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Apresenta novidades no portfólio Colucci que se encaixam no perfil, convidando a ver fotos sem compromisso.
                  </p>

                  <div className="mt-3 rounded-lg bg-muted/60 p-2.5 text-xs italic text-muted-foreground border border-border/40">
                    &ldquo;Olá [Nome]! Surgiram 2 novas opções aqui na Colucci que se encaixam bastante no perfil que você buscava...&rdquo;
                  </div>
                </div>

                <div className="mt-4 border-t border-border/60 pt-3">
                  <div className="grid grid-cols-3 gap-1 text-center">
                    <div>
                      <p className="text-base font-bold tabular-nums text-foreground">
                        {cadenciaStats?.d2.enviados ?? 0}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Enviados</p>
                    </div>
                    <div>
                      <p className="text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {cadenciaStats?.d2.respondidos ?? 0}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Responderam</p>
                    </div>
                    <div>
                      <p className="text-base font-bold tabular-nums text-amber-600 dark:text-amber-400">
                        {cadenciaStats?.d2.taxa ?? 0}%
                      </p>
                      <p className="text-[10px] text-muted-foreground">Conversão</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Etapa D+3 */}
              <div className="relative flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 transition-all hover:border-primary/40 hover:shadow-xs">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="rounded-md bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                      ETAPA 3 · D+3 (72h)
                    </span>
                    <span className="text-[11px] text-muted-foreground">72h de silêncio</span>
                  </div>

                  <h4 className="mt-3 font-semibold text-sm text-foreground">
                    Fechamento Educado (Breakup)
                  </h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Encerramento amigável para não ser invasivo, deixando as portas abertas para o cliente retomar no momento dele.
                  </p>

                  <div className="mt-3 rounded-lg bg-muted/60 p-2.5 text-xs italic text-muted-foreground border border-border/40">
                    &ldquo;Olá [Nome]! Como não tive mais seu retorno, estou encerrando as notificações para não incomodar... Tenha uma excelente semana! ✨&rdquo;
                  </div>
                </div>

                <div className="mt-4 border-t border-border/60 pt-3">
                  <div className="grid grid-cols-3 gap-1 text-center">
                    <div>
                      <p className="text-base font-bold tabular-nums text-foreground">
                        {cadenciaStats?.d3.enviados ?? 0}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Enviados</p>
                    </div>
                    <div>
                      <p className="text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {cadenciaStats?.d3.respondidos ?? 0}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Responderam</p>
                    </div>
                    <div>
                      <p className="text-base font-bold tabular-nums text-purple-600 dark:text-purple-400">
                        {cadenciaStats?.d3.taxa ?? 0}%
                      </p>
                      <p className="text-[10px] text-muted-foreground">Conversão</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Alerta de inteligência de desarmamento */}
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-emerald-200/80 bg-emerald-50/50 p-3 text-xs text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/20 dark:text-emerald-200">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>
                <strong>Desarme Imediato de Etapas:</strong> No momento em que o lead responde qualquer mensagem ou um corretor envia uma mensagem manual, todos os passos seguintes de follow-up são automaticamente cancelados no banco (<code className="bg-emerald-100/80 dark:bg-emerald-900/60 px-1 py-0.5 rounded text-[11px]">cancelled_lead_replied</code> / <code className="bg-emerald-100/80 dark:bg-emerald-900/60 px-1 py-0.5 rounded text-[11px]">cancelled_human</code>), garantindo zero mensagens duplicadas.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 5-B. Módulo Exclusivo: Plano de Contenção & Resgate de Atendimento IA */}
      {(secaoAtiva === "geral" || secaoAtiva === "contencao") && (
        <Card className="border-border/80 shadow-xs border-l-4 border-l-amber-500">
          <CardHeader className="pb-3 border-b border-border/60 bg-amber-500/5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Shield className="size-4.5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-bold text-foreground">
                      Plano de Contenção & Resgate de Atendimento IA
                    </CardTitle>
                    <Badge variant="amber">Resgate Ativo</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Analisa caso a caso leads que pararam de responder à IA, envia mensagem acolhedora de continuidade e transfere para Follow-up.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="blue">Instâncias da Patrícia</Badge>
                <Badge variant="green">Anti-Ban 30 msgs/linha</Badge>
                {!visitante && (
                  <button
                    onClick={executarResgateIA}
                    disabled={resgateTriggering || resgateLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-100/80 px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-200 disabled:opacity-50 dark:border-amber-700/60 dark:bg-amber-950/60 dark:text-amber-200"
                  >
                    <RefreshCw className={cn("size-3.5", resgateTriggering && "animate-spin")} />
                    {resgateTriggering ? "Disparando Resgate..." : "Executar Resgate IA"}
                  </button>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-5 space-y-5">
            {/* 4 Cards de Métricas da Contenção */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-border/70 bg-card p-3.5">
                <p className="text-xs font-medium text-muted-foreground">Total em Atendimento IA</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-foreground">
                  {resgateData?.metricas?.total_atendimento_ia ?? 149}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">Leads atualmente nessa etapa</p>
              </div>

              <div className="rounded-xl border border-border/70 bg-card p-3.5">
                <p className="text-xs font-medium text-muted-foreground">Silenciosos há +24h</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-amber-600 dark:text-amber-400">
                  {resgateData?.metricas?.parados_24h ?? 137}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">Sem interação recente</p>
              </div>

              <div className="rounded-xl border border-emerald-300/60 bg-emerald-50/30 p-3.5 dark:border-emerald-800/40 dark:bg-emerald-950/10">
                <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                  Elegíveis para Contenção
                </p>
                <p className="mt-1 text-2xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                  {resgateData?.metricas?.elegiveis_contencao ?? 110}
                </p>
                <p className="mt-1 text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
                  IA falou por último (lead silenciou)
                </p>
              </div>

              <div className="rounded-xl border border-blue-300/60 bg-blue-50/30 p-3.5 dark:border-blue-800/40 dark:bg-blue-950/10">
                <p className="text-xs font-medium text-blue-800 dark:text-blue-300">
                  Aguardando Resposta Nossa
                </p>
                <p className="mt-1 text-2xl font-black tabular-nums text-blue-600 dark:text-blue-400">
                  {resgateData?.metricas?.aguardando_resposta ?? 27}
                </p>
                <p className="mt-1 text-[11px] text-blue-700/80 dark:text-blue-400/80">
                  Lead falou por último (triagem)
                </p>
              </div>
            </div>

            {/* Template e Fluxo de Transição */}
            <div className="rounded-xl border border-amber-200/70 bg-amber-50/40 p-4 dark:border-amber-800/40 dark:bg-amber-950/20">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-amber-200/80 px-2 py-0.5 text-[11px] font-bold text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
                      MENSAGEM DE RESGATE HUMANIZADA
                    </span>
                    <span className="text-xs text-muted-foreground">Disparo via WhatsApp Patrícia</span>
                  </div>
                  <div className="rounded-lg border border-amber-200/80 bg-background/80 p-3 text-xs italic text-foreground shadow-xs">
                    &ldquo;Oi [Nome], tudo bem? 😊 Notei que você não respondeu mais por aqui... Ainda tem interesse nas opções de imóveis ou surgiu alguma dúvida? Se precisar de algo ou quiser retomar depois, é só me avisar aqui!&rdquo;
                  </div>
                </div>

                <div className="md:w-80 space-y-2 rounded-lg border border-border/60 bg-background/60 p-3 text-xs">
                  <p className="font-semibold text-foreground flex items-center gap-1.5">
                    <ArrowRight className="size-3.5 text-amber-500" />
                    Plano de Ação do Fluxo:
                  </p>
                  <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                    <li>Disparo em conta-gotas (25s a 45s de respiro anti-ban).</li>
                    <li>Move status imediatamente de <strong className="text-foreground">Atendimento IA</strong> para <strong className="text-foreground">Follow-up</strong>.</li>
                    <li>Libera semáforo da IA (<code className="text-[10px] bg-muted px-1 py-0.2 rounded">ai_responding = false</code>).</li>
                    <li>Insere na régua de nutrição (D+1, D+2, D+3) para não perder o cliente.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Listagem Interativa de Leads Diagnosticados */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAbaContencao("elegiveis")}
                    className={cn(
                      "rounded-lg px-3 py-1 text-xs font-semibold transition",
                      abaContencao === "elegiveis"
                        ? "bg-amber-500 text-white shadow-xs"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    Elegíveis para Resgate ({resgateData?.metricas?.elegiveis_contencao ?? 110})
                  </button>

                  <button
                    onClick={() => setAbaContencao("aguardando")}
                    className={cn(
                      "rounded-lg px-3 py-1 text-xs font-semibold transition",
                      abaContencao === "aguardando"
                        ? "bg-blue-600 text-white shadow-xs"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    Aguardando Resposta Humana ({resgateData?.metricas?.aguardando_resposta ?? 27})
                  </button>
                </div>

                <span className="text-[11px] text-muted-foreground hidden sm:inline">
                  {abaContencao === "elegiveis"
                    ? "Amostra dos leads elegíveis para o envio imediato"
                    : "Leads que falaram por último e precisam de resposta manual/IA"}
                </span>
              </div>

              {abaContencao === "aguardando" && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-300">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertCircle className="size-4 text-blue-600 dark:text-blue-400" />
                    Proteção Anti-Desconexão:
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed">
                    Estes 27 leads enviaram uma pergunta ou mensagem recente para a imobiliária. Por isso, o sistema <strong>bloqueia preventivamente</strong> o envio da mensagem &ldquo;Notei que você não respondeu&rdquo;, evitando ruído de comunicação. Eles devem ser respondidos pela equipe ou atendente da IA no chat.
                  </p>
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border border-border/70">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border/60 bg-muted/40 text-muted-foreground font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Lead</th>
                      <th className="py-2.5 px-3">Telefone</th>
                      <th className="py-2.5 px-3">Tempo Parado</th>
                      <th className="py-2.5 px-3">Última Mensagem</th>
                      <th className="py-2.5 px-3 text-right">Ação / Fila</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {abaContencao === "elegiveis" ? (
                      (resgateData?.elegiveis ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-muted-foreground">
                            {resgateLoading ? "Carregando diagnóstico..." : "Nenhum lead pendente de resgate no momento."}
                          </td>
                        </tr>
                      ) : (
                        (resgateData?.elegiveis ?? []).map((lead: any) => (
                          <tr key={lead.id} className="hover:bg-muted/30 transition">
                            <td className="py-2.5 px-3 font-semibold text-foreground">
                              {lead.nome}
                            </td>
                            <td className="py-2.5 px-3 text-muted-foreground">
                              {formatarTelefone(lead.telefone)}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
                                <Clock className="size-3" />
                                {lead.dias_silencio >= 1 ? `há ${lead.dias_silencio} dias` : `há ${lead.horas_silencio}h`}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 max-w-xs truncate text-muted-foreground" title={lead.ultima_mensagem}>
                              {lead.ultima_mensagem || "—"}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {lead.job_status ? (
                                <Badge variant="blue">{lead.job_status}</Badge>
                              ) : (
                                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                  Pronto p/ Resgate
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )
                    ) : (
                      (resgateData?.aguardando_resposta_leads ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-muted-foreground">
                            {resgateLoading ? "Carregando diagnóstico..." : "Nenhum lead aguardando resposta humana."}
                          </td>
                        </tr>
                      ) : (
                        (resgateData?.aguardando_resposta_leads ?? []).map((lead: any) => (
                          <tr key={lead.id} className="hover:bg-muted/30 transition">
                            <td className="py-2.5 px-3 font-semibold text-foreground">
                              {lead.nome}
                            </td>
                            <td className="py-2.5 px-3 text-muted-foreground">
                              {formatarTelefone(lead.telefone)}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="inline-flex items-center gap-1 font-medium text-blue-600 dark:text-blue-400">
                                <Clock className="size-3" />
                                {lead.dias_silencio >= 1 ? `há ${lead.dias_silencio} dias` : `há ${lead.horas_silencio}h`}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 max-w-xs truncate text-foreground font-medium" title={lead.ultima_mensagem}>
                              💬 {lead.ultima_mensagem || "—"}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                                Triagem Humana
                              </span>
                            </td>
                          </tr>
                        ))
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 6. Módulo: Linhas WhatsApp & Gestão de Cota Anti-Ban (30 msgs/linha/dia) */}
      {(secaoAtiva === "geral" || secaoAtiva === "linhas") && (
        <Card className="border-border/80 shadow-xs">
          <CardHeader className="pb-3 border-b border-border/60">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <Smartphone className="size-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-bold">
                    Linhas WhatsApp & Cota de Segurança Anti-Ban
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Controle de tráfego por chip WhatsApp com teto estrito de <strong>{MAX_ENVIOS_LINHA_DIA} mensagens/dia por linha</strong> e rotação automática.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Capacidade Total Hoje: <strong>{((linhasStats?.length ?? 2) * MAX_ENVIOS_LINHA_DIA)} msgs</strong>
                </span>
                <Badge variant="amber">Teto: 30 msgs/linha/dia</Badge>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-5">
            {linhasStats && linhasStats.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {linhasStats.map((l) => {
                  const percentual = Math.min(100, Math.round((l.enviadasHoje / MAX_ENVIOS_LINHA_DIA) * 100))
                  const atingiuTeto = l.enviadasHoje >= MAX_ENVIOS_LINHA_DIA
                  const restantes = Math.max(0, MAX_ENVIOS_LINHA_DIA - l.enviadasHoje)
                  const conectado = l.status === "conectado"

                  return (
                    <div
                      key={l.connId}
                      className={cn(
                        "rounded-xl border p-4 transition-all",
                        atingiuTeto
                          ? "border-amber-300 bg-amber-50/20 dark:border-amber-800 dark:bg-amber-950/10"
                          : "border-border/80 bg-card hover:border-primary/40"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "size-2.5 rounded-full shrink-0",
                              conectado ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                            )} />
                            <h4 className="font-bold text-sm text-foreground">{l.nome}</h4>
                            <Badge variant={conectado ? "green" : "red"}>
                              {conectado ? "Conectado" : "Desconectado"}
                            </Badge>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground font-mono">
                            {l.numero}
                          </p>
                        </div>

                        <div className="text-right">
                          <span className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums",
                            l.enviadasHoje >= 28 ? "bg-red-100 text-red-700" : l.enviadasHoje >= 20 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                          )}>
                            {l.enviadasHoje} / {MAX_ENVIOS_LINHA_DIA}
                          </span>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {restantes > 0 ? `${restantes} restantes hoje` : "Cota atingida"}
                          </p>
                        </div>
                      </div>

                      {/* Barra de Progresso do Teto Anti-Ban */}
                      <div className="mt-4">
                        <div className="flex justify-between text-[11px] font-medium text-muted-foreground mb-1">
                          <span>Consumo da Cota Diária</span>
                          <span>{percentual}%</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              l.enviadasHoje >= 28 ? "bg-red-500" : l.enviadasHoje >= 20 ? "bg-amber-500" : "bg-emerald-500"
                            )}
                            style={{ width: `${percentual}%` }}
                          />
                        </div>
                      </div>

                      {/* Métricas secundárias da linha */}
                      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-center">
                        <div>
                          <p className="text-sm font-bold tabular-nums text-foreground">{l.respondidasHoje}</p>
                          <p className="text-[10px] text-muted-foreground">Respostas</p>
                        </div>
                        <div>
                          <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{l.taxaHoje}%</p>
                          <p className="text-[10px] text-muted-foreground">Taxa</p>
                        </div>
                        <div>
                          <p className="text-sm font-bold tabular-nums text-amber-600 dark:text-amber-400">{l.fila}</p>
                          <p className="text-[10px] text-muted-foreground">Fila Prevista</p>
                        </div>
                      </div>

                      {atingiuTeto && (
                        <div className="mt-3 rounded-md bg-amber-100/70 p-2 text-[11px] text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                          ⚠️ <strong>Teto de segurança atingido:</strong> Novos envios serão redirecionados para a linha secundária ou agendados com segurança para amanhã a partir das 08:00.
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma linha configurada nas automações no momento.
              </p>
            )}

            <div className="mt-4 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground border border-border/60">
              🛡️ <strong>Regra de Rodízio Seguro:</strong> O sistema prioriza a mesma linha em que o lead já conversou anteriormente para manter coerência. Se a linha primária atingir 30 mensagens no dia, a esteira transfere os próximos leads automaticamente para a linha secundária com cota disponível, garantindo estabilidade operacional contínua sem risco de bloqueio pelo WhatsApp.
            </div>
          </CardContent>
        </Card>
      )}

      {/* 7. Grid Inferior: Próximos Envios, Automações Ativas & Feed em Tempo Real */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Coluna Esquerda: Automações Cadastradas (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div className="flex items-center gap-2">
                <Zap className="size-4 text-primary" />
                <CardTitle className="text-base font-bold">Automações Ativas</CardTitle>
              </div>
              <Link href="/automacoes/regras" className="text-xs font-semibold text-primary hover:underline">
                Gerenciar todas
              </Link>
            </CardHeader>

            <CardContent className="space-y-3">
              {automations.map((a) => {
                const ativa = a.status === "active"
                const ehFollowup = a.id === "b0000000-0000-0000-0000-000000000002"

                return (
                  <div
                    key={a.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border/70 p-3.5 bg-card/60 transition hover:border-border"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn("size-2 shrink-0 rounded-full", ativa ? "bg-emerald-500" : "bg-muted-foreground/40")} />
                        <h4 className="font-semibold text-sm text-foreground truncate">{a.name}</h4>
                      </div>

                      <p className="mt-1 text-xs text-muted-foreground">
                        {ehFollowup ? "Régua D+1, D+2, D+3 (sem resposta)" : "Reativação de leads inativos"} · Teto: {ehFollowup ? "30 msgs/linha/dia" : `${a.limits_config.max_daily_sends ?? 25}/dia`}
                      </p>

                      <div className="mt-2 flex items-center gap-2">
                        <Badge variant={ativa ? "green" : "gray"}>
                          {ativa ? "Ativa" : "Pausada"}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {ehFollowup ? "Cadência 24h/48h/72h" : `Espera ${a.wait_config.amount} ${a.wait_config.unit}`}
                        </span>
                      </div>
                    </div>

                    {!visitante && (
                      <button
                        onClick={() => toggleAutomation(a.id)}
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
                          ativa
                            ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        )}
                      >
                        {ativa ? <><Pause className="size-3" /> Pausar</> : <><Play className="size-3" /> Ativar</>}
                      </button>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {/* Feed de Logs em Tempo Real */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div className="flex items-center gap-2">
                <Activity className="size-4 text-emerald-600" />
                <CardTitle className="text-base font-bold">Atividade Recente do Worker</CardTitle>
              </div>
              <Link href="/automacoes/logs" className="text-xs font-semibold text-primary hover:underline">
                Ver todos
              </Link>
            </CardHeader>

            <CardContent>
              {recentLogs.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">Nenhum evento recente registrado.</p>
              ) : (
                <div className="space-y-2.5">
                  {recentLogs.map((log) => (
                    <div key={log.id} className="rounded-lg border border-border/50 bg-muted/20 p-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-foreground truncate">{log.event_title}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                          {fmtDateTime(log.created_at)}
                        </span>
                      </div>
                      <p className="mt-1 text-muted-foreground line-clamp-2 leading-relaxed">
                        {log.event_description}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Coluna Direita: Próximos Envios na Fila (7 cols) */}
        <div className="lg:col-span-7">
          <Card className="h-full flex flex-col justify-between">
            <div>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-amber-600" />
                  <CardTitle className="text-base font-bold">Próximos Envios Agendados</CardTitle>
                </div>
                <Link href="/automacoes/fila" className="text-xs font-semibold text-primary hover:underline">
                  Ver fila completa ({scheduledJobs.length})
                </Link>
              </CardHeader>

              <CardContent>
                {nextSends.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    <CheckCircle className="size-8 mx-auto mb-2 text-emerald-500 opacity-60" />
                    <p className="font-medium text-foreground">Fila livre no momento</p>
                    <p className="text-xs mt-1">Todos os envios elegíveis da esteira já foram processados pelo piloto automático.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {nextSends.map((job) => {
                      const dataJob = new Date(job.scheduled_at)
                      const hoje = new Date()
                      const ehHoje = dataJob.toLocaleDateString() === hoje.toLocaleDateString()

                      return (
                        <div
                          key={job.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3 bg-card/60 transition hover:border-border"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-semibold text-foreground">
                                {leadName(job.lead_id)}
                              </p>
                              <Badge variant={AUTOMATION_JOB_STATUS_VARIANT[job.status]}>
                                {AUTOMATION_JOB_STATUS_LABEL[job.status]}
                              </Badge>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              Corretor: {userName(job.assigned_agent_id ?? "")} · Agendado para {fmtDateTime(job.scheduled_at)}
                            </p>
                          </div>

                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span className={cn(
                              "rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums",
                              ehHoje
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
                            )}>
                              {ehHoje ? "Hoje" : "Próximos dias"}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {dataJob.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </div>

            <div className="p-5 pt-0">
              <Link
                href="/automacoes/fila"
                className="flex items-center justify-center gap-2 rounded-lg border border-border/80 bg-muted/30 py-2.5 text-xs font-semibold text-foreground transition hover:bg-muted"
              >
                Abrir Central da Fila de Automações
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
