"use client"

import React from "react"
import { Zap, Play, RefreshCw, Activity, Clock, Smartphone, Shield } from "lucide-react"
import { EmergencyPauseButton } from "@/components/automation/EmergencyPauseButton"
import { cn } from "@/lib/utils"

export type SecaoAtiva = "geral" | "regua" | "linhas" | "contencao"

interface AutomacoesHeaderProps {
  visitante: boolean
  secaoAtiva: SecaoAtiva
  onSelectSecao: (secao: SecaoAtiva) => void
  onRefresh: () => void
  refreshing: boolean
  periodoBusy: boolean
  onRunWorker: () => void
  workerRunning: boolean
  elegiveisContencaoCount?: number
}

export function AutomacoesHeader({
  visitante,
  secaoAtiva,
  onSelectSecao,
  onRefresh,
  refreshing,
  periodoBusy,
  onRunWorker,
  workerRunning,
  elegiveisContencaoCount = 0,
}: AutomacoesHeaderProps) {
  return (
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
            onClick={onRefresh}
            disabled={periodoBusy || refreshing}
            title="Atualizar dados agora"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3.5", (periodoBusy || refreshing) && "animate-spin text-primary")} />
            Atualizar
          </button>

          {!visitante && (
            <button
              onClick={onRunWorker}
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
          onClick={() => onSelectSecao("geral")}
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
          onClick={() => onSelectSecao("regua")}
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
          onClick={() => onSelectSecao("linhas")}
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
          onClick={() => onSelectSecao("contencao")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition",
            secaoAtiva === "contencao"
              ? "bg-amber-600 text-white shadow-xs dark:bg-amber-600"
              : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <Shield className="size-3.5" />
          Plano de Contenção IA
          {elegiveisContencaoCount > 0 ? (
            <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              {elegiveisContencaoCount}
            </span>
          ) : null}
        </button>
      </div>
    </div>
  )
}
