"use client"

import { useMemo } from "react"
import { DollarSign, Users, Filter, CheckCircle2, Banknote, Percent, TrendingUp, TrendingDown } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives"
import { cn } from "@/lib/utils"
import type { Lead } from "@/lib/mock-data"

const COMISSAO_PCT = 0.05

interface FunilROIProps {
  leads: Lead[]
  investimento: number | null
  loadingMeta: boolean
}

interface FunilEtapa {
  label: string
  value: number
  subtitle: string
  icon: any
  color: string
  bg: string
  width: string
  isCurrency?: boolean
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function pct(a: number, b: number): string {
  if (b === 0) return "—"
  return ((a / b) * 100).toFixed(1) + "%"
}

export function FunilROI({ leads, investimento, loadingMeta }: FunilROIProps) {
  const metrics = useMemo(() => {
    const trafego = leads.filter((l) => l.origem === "Tráfego Pago")
    const pipeline = trafego.filter((l) => !["fechado", "perdido"].includes(l.status))
    const fechados = trafego.filter((l) => l.status === "fechado")
    const receita = fechados.reduce((s, l) => s + (l.valorNegociacao ?? 0), 0)
    const comissao = receita * COMISSAO_PCT
    const roi = investimento && investimento > 0 ? ((comissao / investimento) * 100) : null
    const cpl = trafego.length > 0 && investimento ? investimento / trafego.length : null
    const ticketMedio = fechados.length > 0 ? receita / fechados.length : null
    const conversao = trafego.length > 0 ? (fechados.length / trafego.length) * 100 : null

    return { trafego, pipeline, fechados, receita, comissao, roi, cpl, ticketMedio, conversao }
  }, [leads, investimento])

  const etapas: FunilEtapa[] = useMemo(() => {
    const base = Math.max(1, metrics.trafego.length)
    return [
      {
        label: "Leads Tráfego Pago",
        value: metrics.trafego.length,
        subtitle: `${pct(metrics.trafego.length, leads.length)} do total de leads`,
        icon: Users,
        color: "text-sky-600",
        bg: "bg-sky-500",
        width: "100%",
      },
      {
        label: "Pipeline Ativo",
        value: metrics.pipeline.length,
        subtitle: `${pct(metrics.pipeline.length, base)} convertem para pipeline`,
        icon: Filter,
        color: "text-blue-600",
        bg: "bg-blue-500",
        width: `${Math.max(10, (metrics.pipeline.length / base) * 100)}%`,
      },
      {
        label: "Fechamentos",
        value: metrics.fechados.length,
        subtitle: `${pct(metrics.fechados.length, base)} taxa de conversão`,
        icon: CheckCircle2,
        color: "text-emerald-600",
        bg: "bg-emerald-500",
        width: `${Math.max(10, (metrics.fechados.length / base) * 100)}%`,
      },
      {
        label: "Comissão Colucci (5%)",
        value: metrics.comissao,
        subtitle: investimento != null ? `ROI: ${metrics.roi != null ? metrics.roi.toFixed(1) + "%" : "—"}` : "Informe o investimento",
        icon: Banknote,
        color: "text-amber-600",
        bg: "bg-amber-500",
        width: `${Math.max(10, metrics.roi != null ? Math.min(100, Math.max(10, metrics.roi)) : 10)}%`,
        isCurrency: true,
      },
    ]
  }, [metrics, leads.length, investimento])

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Funil visual */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Funil de Conversão — Tráfego Pago</CardTitle>
          <p className="text-xs text-muted-foreground">
            Do investimento ao retorno financeiro
          </p>
        </CardHeader>
        <CardContent>
          {metrics.trafego.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhum lead de Tráfego Pago no período selecionado
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {etapas.map((etapa, i) => (
                <div key={etapa.label} className="flex items-center gap-3">
                  <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", etapa.color.replace("text-", "bg-") + "/10")}>
                    <etapa.icon className={cn("size-4.5", etapa.color)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm font-medium">{etapa.label}</span>
                      <span className="text-sm font-bold tabular-nums">
                        {etapa.isCurrency ? brl(etapa.value) : etapa.value}
                      </span>
                    </div>
                    <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("absolute inset-y-0 left-0 rounded-full transition-all duration-700", etapa.bg)}
                        style={{ width: etapa.width }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{etapa.subtitle}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Métricas de ROI */}
      <Card>
        <CardHeader>
          <CardTitle>Métricas de Retorno</CardTitle>
          <p className="text-xs text-muted-foreground">
            Comissão = 5% do valor total fechado
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Investimento */}
          <div className="flex items-center gap-3 rounded-lg border border-border/60 p-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-red-100 text-red-600">
              <DollarSign className="size-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Investimento Meta Ads</p>
              {loadingMeta ? (
                <div className="mt-1 h-5 w-24 animate-pulse rounded bg-muted" />
              ) : (
                <p className="font-display text-lg font-bold tabular-nums">
                  {investimento != null ? brl(investimento) : "—"}
                </p>
              )}
            </div>
          </div>

          {/* Receita total */}
          <div className="flex items-center gap-3 rounded-lg border border-border/60 p-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
              <Banknote className="size-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Receita Total (fechamentos)</p>
              <p className="font-display text-lg font-bold tabular-nums">{brl(metrics.receita)}</p>
            </div>
          </div>

          {/* Comissão */}
          <div className="flex items-center gap-3 rounded-lg border border-border/60 p-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <Percent className="size-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Comissão Colucci (5%)</p>
              <p className="font-display text-lg font-bold tabular-nums text-amber-600">{brl(metrics.comissao)}</p>
            </div>
          </div>

          {/* ROI */}
          <div className={cn(
            "flex items-center gap-3 rounded-lg border p-3",
            metrics.roi != null
              ? metrics.roi >= 100 ? "border-emerald-200 bg-emerald-50" : metrics.roi > 0 ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"
              : "border-border/60"
          )}>
            <div className={cn(
              "flex size-9 items-center justify-center rounded-lg",
              metrics.roi != null
                ? metrics.roi >= 100 ? "bg-emerald-100 text-emerald-600" : metrics.roi > 0 ? "bg-amber-100 text-amber-600" : "bg-red-100 text-red-600"
                : "bg-muted text-muted-foreground"
            )}>
              {metrics.roi != null && metrics.roi >= 0
                ? <TrendingUp className="size-4.5" />
                : <TrendingDown className="size-4.5" />
              }
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">ROI</p>
              <p className={cn(
                "font-display text-lg font-bold tabular-nums",
                metrics.roi != null
                  ? metrics.roi >= 100 ? "text-emerald-600" : metrics.roi > 0 ? "text-amber-600" : "text-red-600"
                  : ""
              )}>
                {metrics.roi != null ? metrics.roi.toFixed(1) + "%" : "—"}
              </p>
            </div>
          </div>

          {/* Extras */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border/60 p-3 text-center">
              <p className="text-xs text-muted-foreground">CPL</p>
              <p className="font-display text-base font-bold tabular-nums">
                {metrics.cpl != null ? brl(metrics.cpl) : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 p-3 text-center">
              <p className="text-xs text-muted-foreground">Ticket Médio</p>
              <p className="font-display text-base font-bold tabular-nums">
                {metrics.ticketMedio != null ? brl(metrics.ticketMedio) : "—"}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 p-3 text-center">
            <p className="text-xs text-muted-foreground">Taxa de Conversão (Lead → Fechamento)</p>
            <p className="font-display text-base font-bold tabular-nums">
              {metrics.conversao != null ? metrics.conversao.toFixed(1) + "%" : "—"}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
