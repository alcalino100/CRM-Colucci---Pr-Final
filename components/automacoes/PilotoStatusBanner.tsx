"use client"

import React from "react"
import { Activity, CheckCircle, XCircle } from "lucide-react"
import { Card, CardContent, Badge } from "@/components/ui/primitives"
import { cn } from "@/lib/utils"
import { haQuanto, type PilotoStatus } from "@/lib/automation-dashboard-utils"

interface PilotoStatusBannerProps {
  lastRun: { timestamp: string; description?: string } | null
  minutosDesdeUltima: number | null
  pilotoStatus: PilotoStatus
  workerResult: { ok: boolean; message: string; details?: unknown } | null
  onDismissResult?: () => void
}

export function PilotoStatusBanner({
  lastRun,
  minutosDesdeUltima,
  pilotoStatus,
  workerResult,
  onDismissResult,
}: PilotoStatusBannerProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
      <Card
        className={cn(
          "sm:col-span-12 border-l-4 transition",
          pilotoStatus.tone === "good"
            ? "border-l-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/10"
            : pilotoStatus.tone === "warn"
            ? "border-l-amber-500 bg-amber-50/20 dark:bg-amber-950/10"
            : "border-l-red-500 bg-red-50/20"
        )}
      >
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "relative flex size-10 shrink-0 items-center justify-center rounded-full",
                pilotoStatus.tone === "good"
                  ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400"
                  : pilotoStatus.tone === "warn"
                  ? "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
                  : "bg-red-100 text-red-600"
              )}
            >
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
                  <>
                    Última rodada concluída <strong>{haQuanto(minutosDesdeUltima)}</strong> · Execução automática contínua a cada ~15 minutos.
                  </>
                ) : (
                  "Aguardando primeira execução programada pelo cron."
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {workerResult && (
        <div
          className={cn(
            "sm:col-span-12 flex items-center justify-between gap-3 rounded-xl border p-3.5 text-xs font-medium transition",
            workerResult.ok
              ? "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
              : "border-red-300 bg-red-50 text-red-950 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200"
          )}
        >
          <div className="flex items-center gap-2">
            {workerResult.ok ? (
              <CheckCircle className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <XCircle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
            )}
            <span>{workerResult.message}</span>
          </div>
          {onDismissResult && (
            <button
              onClick={onDismissResult}
              className="text-xs font-bold opacity-70 hover:opacity-100"
            >
              Fechar
            </button>
          )}
        </div>
      )}
    </div>
  )
}
