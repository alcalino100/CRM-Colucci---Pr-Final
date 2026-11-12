"use client"

import { UserPlus, CalendarRange, History, CheckCircle2, TrendingUp, TrendingDown } from "lucide-react"
import { Card, CardContent } from "@/components/ui/primitives"
import { cn } from "@/lib/utils"

interface KpiItemProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  subtitle?: string
  accent?: boolean
  variacao?: number | null
  compareTitle?: string
}

function KpiItem({ icon: Icon, label, value, subtitle, accent, variacao: v, compareTitle }: KpiItemProps) {
  return (
    <div
      className={cn(
        "group rounded-xl border border-border bg-card p-px transition-colors duration-150 hover:border-foreground/25",
        accent && "from-accent/25 via-accent/5"
      )}
    >
      <Card className="h-full rounded-[calc(var(--radius-xl)-1px)]">
        <CardContent className="flex h-full items-center gap-4 p-4 pt-5">
          <div
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 transition-all duration-300 group-hover:scale-110 group-hover:-rotate-3",
              accent
                ? "bg-accent/10 text-accent ring-accent/25 shadow-[0_0_18px_rgb(196_30_36/0.45)]"
                : "bg-primary/10 text-primary ring-primary/25 shadow-[0_0_16px_rgb(178_34_34/0.35)]"
            )}
          >
            <Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{label}</p>
            <p className="truncate font-display text-xl font-bold tabular-nums">{value}</p>
            {subtitle && <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>}
            {v != null && (
              <p
                title={compareTitle}
                className={cn(
                  "mt-0.5 flex items-center gap-1 text-xs font-semibold tabular-nums",
                  v >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                )}
              >
                {v >= 0 ? <TrendingUp className="size-3.5 shrink-0" /> : <TrendingDown className="size-3.5 shrink-0" />}
                {v >= 0 ? "+" : ""}
                {v.toFixed(0)}% vs. anterior
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

interface CadastrosKpisProps {
  totalNovos: number
  totalAntigosAtivos: number
  mediaNovosPorDia: number
  totalFechados: number
  dias: number
  comparativo: {
    prevIni: string
    prevFim: string
    novos: { cur: number; prev: number }
    media: { cur: number; prev: number }
    fechados: { cur: number; prev: number }
  } | null
  variacao: (cur: number, prev: number) => number | null
  fmtDia: (ymd: string) => string
}

export function CadastrosKpis({
  totalNovos,
  totalAntigosAtivos,
  mediaNovosPorDia,
  totalFechados,
  comparativo,
  variacao,
  fmtDia,
}: CadastrosKpisProps) {
  const compareRange = comparativo
    ? `Anterior: ${fmtDia(comparativo.prevIni)} — ${fmtDia(comparativo.prevFim)}`
    : undefined

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiItem
        icon={UserPlus}
        label="Novos Cadastrados"
        value={String(totalNovos)}
        subtitle="Entraram neste período"
        variacao={comparativo ? variacao(comparativo.novos.cur, comparativo.novos.prev) : null}
        compareTitle={compareRange}
      />
      <KpiItem
        icon={History}
        label="Base Anterior Ativa"
        value={String(totalAntigosAtivos)}
        subtitle="Criados antes, ativos no período"
      />
      <KpiItem
        icon={CalendarRange}
        label="Média Novos / Dia"
        value={mediaNovosPorDia.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
        variacao={comparativo ? variacao(comparativo.media.cur, comparativo.media.prev) : null}
        compareTitle={compareRange}
      />
      <KpiItem
        icon={CheckCircle2}
        label="Fechamentos no Período"
        value={String(totalFechados)}
        accent
        variacao={comparativo ? variacao(comparativo.fechados.cur, comparativo.fechados.prev) : null}
        compareTitle={compareRange}
      />
    </div>
  )
}
