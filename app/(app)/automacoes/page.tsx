"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Zap, MessageCircle, Users, CheckCircle2, XCircle, Clock, Eye, BarChart3, ArrowRight, AlertTriangle, Shield, Play, Pause, Activity } from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent, Badge, Skeleton } from "@/components/ui/primitives"
import { useAutomation, type DashboardMetrics } from "@/lib/automation-store"
import { useLeads } from "@/lib/leads-store"
import { useAuth } from "@/lib/auth-context"
import { AUTOMATION_STATUS_LABEL, AUTOMATION_STATUS_VARIANT, AUTOMATION_JOB_STATUS_LABEL, AUTOMATION_JOB_STATUS_VARIANT, type AutomationJob } from "@/lib/automation-types"
import { fmtDateTime } from "@/lib/labels"
import { cn } from "@/lib/utils"

export default function AutomacoesPage() {
  const { user } = useAuth()
  const { automations, jobs, ready: storeReady, loadDashboardMetrics, toggleAutomation } = useAutomation()
  const { users, leads } = useLeads()
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [workerRunning, setWorkerRunning] = useState(false)
  const [workerResult, setWorkerResult] = useState<{ ok: boolean; message: string; details?: any } | null>(null)
  const [lastRun, setLastRun] = useState<{ timestamp: string; description?: string } | null>(null)

  useEffect(() => {
    if (!storeReady) return
    setLoading(true)
    loadDashboardMetrics()
      .then((m) => { setMetrics(m); setLoading(false) })
      .catch(() => setLoading(false))
  }, [storeReady, loadDashboardMetrics])

  // Status do piloto automático (última execução do worker — manual ou pelo cron)
  useEffect(() => {
    let vivo = true
    const buscar = () =>
      fetch("/api/automation/worker")
        .then((r) => r.json())
        .then((d) => { if (vivo) setLastRun(d.last_run ?? null) })
        .catch(() => {})
    buscar()
    const t = setInterval(buscar, 60_000) // atualiza a cada minuto
    return () => { vivo = false; clearInterval(t) }
  }, [])

  const ordemAutomacoes = [...automations].sort((a, b) => (a.status === "active" ? -1 : 1) - (b.status === "active" ? -1 : 1))
  const scheduledJobs = jobs.filter((j) => ["scheduled", "pending_validation"].includes(j.status))
  const nextSends = scheduledJobs
    .slice()
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    .slice(0, 8)

  // "há X min" desde a última execução — base da transparência do piloto automático
  const minutosDesdeUltima = lastRun ? Math.floor((Date.now() - new Date(lastRun.timestamp).getTime()) / 60000) : null
  const pilotoStatus =
    minutosDesdeUltima === null ? { label: "Sem execução ainda", tone: "muted" as const }
    : minutosDesdeUltima <= 30 ? { label: "Ativo", tone: "good" as const }
    : minutosDesdeUltima <= 90 ? { label: "Sem rodar há um tempo", tone: "warn" as const }
    : { label: "Parado?", tone: "crit" as const }

  function haQuanto(min: number | null): string {
    if (min === null) return "—"
    if (min < 1) return "agora mesmo"
    if (min < 60) return `há ${min} min`
    const h = Math.floor(min / 60)
    return h < 24 ? `há ${h}h` : `há ${Math.floor(h / 24)}d`
  }
  function rotuloDia(iso: string): string {
    const fmt = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
    const d = new Date(iso), hoje = new Date()
    const amanha = new Date(hoje); amanha.setDate(hoje.getDate() + 1)
    if (fmt(d) === fmt(hoje)) return "Hoje"
    if (fmt(d) === fmt(amanha)) return "Amanhã"
    return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" })
  }

  function userName(id: string) { return users.find((u) => u.id === id)?.nome ?? "—" }
  function leadName(id: string) { return leads.find((l) => l.id === id)?.nome ?? "—" }

  async function runWorker() {
    setWorkerRunning(true)
    setWorkerResult(null)
    try {
      const res = await fetch("/api/automation/worker", { method: "POST" })
      const data = await res.json()
      if (data.ok) {
        const r = data.results
        const rej = data.rejections ?? {}
        const parts = [
          `Avaliados: ${r.evaluated}`,
          `Jobs criados: ${r.created}`,
          `Bloqueados (horário): ${r.blocked_hour ?? 0}`,
          `Processados: ${r.processed}`,
          `Enviados: ${r.sent}`,
          `Cancelados: ${r.cancelled}`,
          `Falhas: ${r.failed}`,
        ]
        const rejParts = []
        if (rej.has_active_job) rejParts.push(`Job ativo: ${rej.has_active_job}`)
        if (rej.conditions_not_met) rejParts.push(`Condições: ${rej.conditions_not_met}`)
        if (rej.human_interaction_recent) rejParts.push(`Interação recente: ${rej.human_interaction_recent}`)
        if (rej.insert_error) rejParts.push(`Erro insert: ${rej.insert_error}`)
        if (rej.no_leads_found) rejParts.push(`Sem leads: ${rej.no_leads_found}`)
        const msg = parts.join(" | ") + (rejParts.length ? `\nRejeições: ${rejParts.join(" | ")}` : "")
        setWorkerResult({ ok: true, message: msg, details: data })
      } else {
        setWorkerResult({ ok: false, message: `Erro: ${data.error}` })
      }
    } catch {
      setWorkerResult({ ok: false, message: "Falha de conexão ao executar worker" })
    }
    setWorkerRunning(false)
  }

  if (loading && !metrics) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-80" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Automações de Leads</h1>
          <p className="text-sm text-muted-foreground">Dashboard de automações e métricas de envio</p>
        </div>
        <div className="flex gap-2">
          <button onClick={runWorker} disabled={workerRunning}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50">
            <Play className="size-4" /> {workerRunning ? "Executando..." : "Executar Worker"}
          </button>
          <Link href="/automacoes/regras" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90">
            <Zap className="size-4" /> Ver Regras
          </Link>
          <Link href="/automacoes/fila" className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-muted">
            <Clock className="size-4" /> Fila
          </Link>
        </div>
      </div>

      {/* Resultado do worker */}
      {workerResult && (
        <div className={"rounded-lg border p-4 text-sm " + (workerResult.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700")}>
          <div className="whitespace-pre-wrap font-medium">{workerResult.message}</div>
          {workerResult.details?.rejection_details?.length > 0 && (
            <div className="mt-3 border-t border-emerald-200 pt-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-70">Detalhes das rejeições (primeiros 20)</p>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-left opacity-70"><th className="pr-4 pb-1">Lead</th><th>Motivo</th></tr></thead>
                  <tbody>
                    {workerResult.details.rejection_details.slice(0, 20).map((d: any, i: number) => (
                      <tr key={i} className="border-t border-emerald-200/50"><td className="pr-4 py-1 font-medium">{d.lead_nome}</td><td className="py-1">{d.reason}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Piloto automático — transparência de que o worker roda sozinho */}
      <Card className={cn(
        "border-l-4",
        pilotoStatus.tone === "good" ? "border-l-emerald-500" : pilotoStatus.tone === "warn" ? "border-l-amber-500" : pilotoStatus.tone === "crit" ? "border-l-red-500" : "border-l-border",
      )}>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "relative flex size-10 shrink-0 items-center justify-center rounded-full",
              pilotoStatus.tone === "good" ? "bg-emerald-100 text-emerald-600" : pilotoStatus.tone === "warn" ? "bg-amber-100 text-amber-600" : pilotoStatus.tone === "crit" ? "bg-red-100 text-red-600" : "bg-muted text-muted-foreground",
            )}>
              <Activity className="size-5" />
              {pilotoStatus.tone === "good" && <span className="absolute right-0 top-0 size-2.5 animate-pulse rounded-full bg-emerald-500 ring-2 ring-card" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">Piloto automático</p>
                <Badge variant={pilotoStatus.tone === "good" ? "green" : pilotoStatus.tone === "warn" ? "amber" : pilotoStatus.tone === "crit" ? "red" : "gray"}>{pilotoStatus.label}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {lastRun ? <>Última execução {haQuanto(minutosDesdeUltima)} · roda sozinho a cada ~15 min em horário comercial</> : "Aguardando a primeira execução automática"}
              </p>
            </div>
          </div>
          {lastRun?.description && (
            <p className="max-w-md truncate text-xs text-muted-foreground sm:text-right" title={lastRun.description}>{lastRun.description}</p>
          )}
        </CardContent>
      </Card>

      {/* Métricas principais */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
        <MetricCard icon={Zap} label="Automações Ativas" value={metrics?.active_automations ?? 0} color="text-primary" />
        <MetricCard icon={Users} label="Leads Analisados Hoje" value={metrics?.leads_analyzed_today ?? 0} color="text-sky-600" />
        <MetricCard icon={CheckCircle2} label="Leads Elegíveis" value={metrics?.leads_eligible_today ?? 0} color="text-emerald-600" />
        <MetricCard icon={MessageCircle} label="Enviados Hoje" value={metrics?.messages_sent_today ?? 0} color="text-blue-600" />
        <MetricCard icon={Clock} label="Na Fila" value={metrics?.messages_scheduled ?? scheduledJobs.length} color="text-amber-600" />
        <MetricCard icon={Eye} label="Entregues" value={metrics?.messages_delivered ?? 0} color="text-teal-600" />
        <MetricCard icon={Eye} label="Lidos" value={metrics?.messages_read ?? 0} color="text-green-600" />
        <MetricCard icon={MessageCircle} label="Responderam" value={metrics?.leads_responded ?? 0} color="text-emerald-600" />
        <MetricCard icon={XCircle} label="Cancelados (Humano)" value={metrics?.cancelled_by_human ?? 0} color="text-slate-600" />
        <MetricCard icon={AlertTriangle} label="Falhas" value={metrics?.send_failures ?? 0} color="text-red-600" />
      </div>

      {/* Métricas secundárias */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex size-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{metrics?.response_rate ?? 0}%</p>
              <p className="text-xs text-muted-foreground">Taxa de Resposta</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-600">
              <Users className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{metrics?.cancel_rate ?? 0}%</p>
              <p className="text-xs text-muted-foreground">Cancelamento por Ação Humana</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex size-10 items-center justify-center rounded-full bg-red-100 text-red-600">
              <Shield className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{metrics?.supervisions_applied ?? 0}</p>
              <p className="text-xs text-muted-foreground">Supervisões Aplicadas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex size-10 items-center justify-center rounded-full bg-sky-100 text-sky-600">
              <Clock className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{metrics?.median_response_minutes ?? 0} min</p>
              <p className="text-xs text-muted-foreground">Tempo mediano até responder</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex size-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <Users className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{metrics?.follow_up_pool ?? 0}</p>
              <p className="text-xs text-muted-foreground">Fila de follow-up (enviados sem resposta)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Automações ativas + Próximos envios */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Automações (ativas e pausadas) com controle inline */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Automações</CardTitle>
            <Link href="/automacoes/regras" className="text-xs font-medium text-primary hover:underline">Ver todas</Link>
          </CardHeader>
          <CardContent>
            {ordemAutomacoes.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma automação cadastrada</p>
            ) : (
              <div className="space-y-2">
                {ordemAutomacoes.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn("size-2 shrink-0 rounded-full", a.status === "active" ? "bg-emerald-500" : "bg-muted-foreground/40")} />
                        <p className="truncate text-sm font-medium">{a.name}</p>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {a.trigger_type === "no_response_followup" ? "Follow-up (sem resposta)" : a.trigger_type === "lead_inactive" ? "Lead inativo" : a.trigger_type} · Espera {a.wait_config.amount} {a.wait_config.unit}
                      </p>
                    </div>
                    {a.status !== "draft" && (
                      <button
                        onClick={() => toggleAutomation(a.id)}
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
                          a.status === "active"
                            ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                        )}
                      >
                        {a.status === "active" ? <><Pause className="size-3.5" /> Pausar</> : <><Play className="size-3.5" /> Ativar</>}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Próximos envios */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Próximos Envios</CardTitle>
            <Link href="/automacoes/fila" className="text-xs font-medium text-primary hover:underline">
              {scheduledJobs.length > 0 ? `Ver fila (${scheduledJobs.length})` : "Ver fila"}
            </Link>
          </CardHeader>
          <CardContent>
            {nextSends.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nada agendado no momento</p>
            ) : (
              <div className="space-y-2">
                {nextSends.map((job) => (
                  <div key={job.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{leadName(job.lead_id)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {userName(job.assigned_agent_id ?? "")} · {fmtDateTime(job.scheduled_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className={cn(
                        "rounded-md px-2 py-0.5 text-[11px] font-semibold",
                        rotuloDia(job.scheduled_at) === "Hoje" ? "bg-emerald-100 text-emerald-700" : rotuloDia(job.scheduled_at) === "Amanhã" ? "bg-sky-100 text-sky-700" : "bg-muted text-muted-foreground",
                      )}>{rotuloDia(job.scheduled_at)}</span>
                      <Badge variant={AUTOMATION_JOB_STATUS_VARIANT[job.status]}>
                        {AUTOMATION_JOB_STATUS_LABEL[job.status]}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn("flex size-9 items-center justify-center rounded-lg bg-muted", color)}>
            <Icon className="size-4.5" />
          </div>
          <div>
            <p className="text-xl font-bold leading-tight">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
