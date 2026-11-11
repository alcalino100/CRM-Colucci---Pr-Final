"use client"

import React from "react"
import { Users, Send, MessageCircle, Shield, RefreshCw } from "lucide-react"
import { Card, CardContent } from "@/components/ui/primitives"
import { cn } from "@/lib/utils"
import type { PeriodoFiltro } from "@/lib/automation-dashboard-utils"

export interface PeriodoStatsData {
  criados: number
  enviadas: number
  entregues: number
  lidos: number
  respondidas: number
  taxa: number
  canceladosHumano: number
  canceladosLead: number
}

interface PeriodoMetricsSectionProps {
  periodo: PeriodoFiltro
  onSelectPeriodo: (periodo: PeriodoFiltro) => void
  dataCustom: string
  onChangeDataCustom: (data: string) => void
  periodoBusy: boolean
  periodoLabel: string
  periodoStats: PeriodoStatsData | null
  metrics?: {
    leads_analyzed_today?: number
    median_response_minutes?: number
    cancelled_by_human?: number
  } | null
  scheduledJobsCount: number
  iaStatus?: { liberadasSemafaro: number } | null
}

const PERIODOS: Array<{ id: PeriodoFiltro; label: string }> = [
  { id: "hoje", label: "Hoje" },
  { id: "ontem", label: "Ontem" },
  { id: "7dias", label: "Últimos 7 dias" },
  { id: "30dias", label: "Últimos 30 dias" },
]

export function PeriodoMetricsSection({
  periodo,
  onSelectPeriodo,
  dataCustom,
  onChangeDataCustom,
  periodoBusy,
  periodoLabel,
  periodoStats,
  metrics,
  scheduledJobsCount,
  iaStatus,
}: PeriodoMetricsSectionProps) {
  return (
    <div className="space-y-4">
      {/* Barra de Filtro de Período */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border/70 bg-card/60 p-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-foreground mr-1">Filtrar período:</span>
          {PERIODOS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectPeriodo(item.id)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-medium transition",
                periodo === item.id
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-background text-muted-foreground border border-border/60 hover:text-foreground hover:bg-muted"
              )}
            >
              {item.label}
            </button>
          ))}

          <div className="flex items-center gap-1.5 pl-1">
            <span className="text-[11px] text-muted-foreground">ou dia:</span>
            <input
              type="date"
              value={dataCustom}
              onChange={(e) => {
                if (e.target.value) {
                  onChangeDataCustom(e.target.value)
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
            {periodoLabel} (Horário de Brasília)
          </span>
        </div>
      </div>

      {/* 4 Pilares Semânticos Agrupados */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Pilar 1: Volume & Pipeline */}
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
                {scheduledJobsCount} agendados
              </span>
            </div>

            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Semáforo IA:</span>
              <span
                className="font-semibold text-emerald-600 dark:text-emerald-400"
                title="Conversas liberadas para follow-up após inatividade"
              >
                {iaStatus ? `${iaStatus.liberadasSemafaro} liberadas` : "189 liberadas"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Pilar 2: Disparos & Entregas */}
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

        {/* Pilar 3: Engajamento & Resposta */}
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

        {/* Pilar 4: Proteção & Ação Humana */}
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
    </div>
  )
}
