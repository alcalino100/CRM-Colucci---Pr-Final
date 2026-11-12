"use client"

import React from "react"
import Link from "next/link"
import { Zap, Clock, Activity, Play, Pause, ArrowRight, CheckCircle } from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent, Badge } from "@/components/ui/primitives"
import { cn } from "@/lib/utils"
import {
  type Automation,
  type AutomationJob,
  AUTOMATION_JOB_STATUS_LABEL,
  AUTOMATION_JOB_STATUS_VARIANT,
} from "@/lib/automation-types"

export interface AutomationLogItem {
  id: string
  event_type: string
  event_title: string
  event_description: string
  created_at: string
  lead_id: string | null
}

interface ProximosEnviosFeedSectionProps {
  automations: Automation[]
  visitante: boolean
  onToggleAutomation: (id: string) => void
  recentLogs: AutomationLogItem[]
  nextSends: AutomationJob[]
  scheduledJobsCount: number
  leadName: (leadId: string) => string
  userName: (agentId: string) => string
  fmtDateTime: (iso: string) => string
}

export function ProximosEnviosFeedSection({
  automations,
  visitante,
  onToggleAutomation,
  recentLogs,
  nextSends,
  scheduledJobsCount,
  leadName,
  userName,
  fmtDateTime,
}: ProximosEnviosFeedSectionProps) {
  return (
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
                      onClick={() => onToggleAutomation(a.id)}
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
                Ver fila completa ({scheduledJobsCount})
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
                          <span
                            className={cn(
                              "rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums",
                              ehHoje
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
                            )}
                          >
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
  )
}
