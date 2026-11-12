"use client"

import React from "react"
import useSWR from "swr"
import { ArrowUpRight, ArrowDownRight, TriangleAlert, RefreshCw, BarChart3 } from "lucide-react"
import { Badge, Card, CardContent, Skeleton } from "@/components/ui/primitives"
import { cn } from "@/lib/utils"
import { brl } from "@/lib/labels"
import { fetcher, fmt, STATUS_PT } from "@/lib/meta-ads-utils"
import { extrairResultadosMeta } from "@/lib/meta/reconciliation"

export function StatusBadge({ s }: { s?: string | null }) {
  const m = STATUS_PT[(s || "").toUpperCase()] ?? { label: s || "—", variant: "gray" }
  return <Badge variant={m.variant as any}>{m.label}</Badge>
}

export function Kpi({
  icon: Icon,
  label,
  value,
  prev,
  cur,
  invert,
  accent,
}: {
  icon: any
  label: string
  value: string
  prev?: number
  cur: number
  invert?: boolean
  accent?: boolean
}) {
  let delta: number | null = null
  if (prev !== undefined && prev > 0) delta = ((cur - prev) / prev) * 100
  const positivo = delta !== null && (invert ? delta < 0 : delta > 0)

  return (
    <div
      className={cn(
        "group rounded-2xl bg-gradient-to-b from-primary/20 via-primary/5 to-transparent p-px transition-all duration-300 hover:-translate-y-1 hover:from-primary/40",
        accent && "from-accent/25 via-accent/5"
      )}
    >
      <Card className="h-full rounded-[calc(var(--radius-2xl)-1px)] transition-shadow duration-300 hover:shadow-[0_14px_36px_-10px_rgb(178_34_34/0.4)]">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
              <p className="mt-1 truncate font-display text-xl font-bold tabular-nums tracking-tight md:text-2xl">
                {value}
              </p>
              {delta !== null && (
                <span
                  className={cn(
                    "mt-1.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                    positivo ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                  )}
                >
                  {delta >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                  {fmt(Math.abs(delta), 1)}% vs anterior
                </span>
              )}
            </div>
            <div
              className={cn(
                "shrink-0 rounded-xl p-2.5 ring-1 transition-all duration-300 group-hover:scale-110 group-hover:-rotate-3",
                accent
                  ? "bg-accent/10 text-accent ring-accent/25 shadow-[0_0_18px_rgb(196_30_36/0.45)]"
                  : "bg-primary/10 text-primary ring-primary/25 shadow-[0_0_16px_rgb(178_34_34/0.35)]"
              )}
            >
              <Icon className="size-4.5" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-lg">
      {label && <p className="mb-1.5 font-semibold text-foreground">{label}</p>}
      <div className="flex flex-col gap-1">
        {payload.map((p: any, i: number) => (
          <span key={i} className="flex items-center justify-between gap-4 tabular-nums">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="size-2 rounded-full"
                style={{ background: p.color || p.fill || "#b22222" }}
              />
              {p.name}
            </span>
            <span className="font-semibold text-foreground">
              {p.name === "Gasto (R$)" ? brl(Number(p.value)) : p.value}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

export function Aviso({
  texto,
  acao,
  erro,
}: {
  texto: string
  acao: string
  erro?: boolean
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm shadow-sm",
        erro ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800"
      )}
    >
      <span className="flex items-center gap-2.5">
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full",
            erro ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"
          )}
        >
          <TriangleAlert className="size-4" />
        </span>
        {texto}
      </span>
      <a
        href="/api/meta/oauth/start"
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition hover:brightness-110"
      >
        <RefreshCw className="size-3" /> {acao}
      </a>
    </div>
  )
}

export function Vazio({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 py-12 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-muted">
        <BarChart3 className="size-5 text-muted-foreground/70" />
      </div>
      <p className="text-sm text-muted-foreground">{texto}</p>
    </div>
  )
}

const CTA_PT: Record<string, string> = {
  LEARN_MORE: "Saiba mais",
  WHATSAPP_MESSAGE: "Enviar WhatsApp",
  SIGN_UP: "Cadastre-se",
  CONTACT_US: "Fale conosco",
}

export function CreativeCard({
  ad,
  ins,
  adsetNome,
}: {
  ad: any
  ins?: any
  adsetNome: string
}) {
  const { data: cr } = useSWR(
    ad.creative?.id ? `/api/meta?op=creative&id=${ad.creative.id}` : null,
    fetcher
  )
  const res = ins ? extrairResultadosMeta(ins) : 0

  return (
    <div className="group rounded-2xl bg-gradient-to-b from-primary/15 via-primary/5 to-transparent p-px transition-all duration-300 hover:-translate-y-1 hover:from-primary/40">
      <div className="flex h-full flex-col overflow-hidden rounded-[calc(var(--radius-2xl)-1px)] border border-border bg-card shadow-sm transition-shadow duration-300 hover:shadow-[0_16px_44px_-12px_rgb(178_34_34/0.4)]">
        <div className="relative">
          {cr?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cr.image_url || "/placeholder.svg"}
              alt={`Criativo do anúncio ${ad.name}`}
              className="h-44 w-full object-cover transition-all duration-300 group-hover:scale-[1.04]"
            />
          ) : (
            <Skeleton className="h-44 w-full rounded-none" />
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/25 to-transparent" aria-hidden="true" />
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            <StatusBadge s={ad.effective_status} />
            {cr?.object_type && (
              <Badge variant="slate">
                {cr.object_type === "VIDEO"
                  ? "Vídeo"
                  : cr.object_type === "CAROUSEL"
                  ? "Carrossel"
                  : "Imagem"}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <p className="text-sm font-semibold text-pretty">{cr?.title ?? ad.name}</p>
          {cr?.body && <p className="line-clamp-2 text-xs text-muted-foreground">{cr.body}</p>}
          <p className="text-xs text-muted-foreground">
            Anúncio: {ad.name} · Conjunto: {adsetNome}
          </p>
          {cr?.call_to_action_type && (
            <span className="w-fit rounded-lg bg-primary/10 px-2 py-1 text-xs font-medium text-primary shadow-[0_0_12px_rgb(178_34_34/0.25)]">
              {CTA_PT[cr.call_to_action_type] ?? cr.call_to_action_type}
            </span>
          )}
          <div className="mt-auto grid grid-cols-4 gap-1 border-t border-border pt-3 text-center tabular-nums">
            <MiniMetric l="Gasto" v={brl(Number(ins?.spend ?? 0))} />
            <MiniMetric l="Cliques" v={fmt(Number(ins?.clicks ?? 0))} />
            <MiniMetric l="CTR" v={`${fmt(Number(ins?.ctr ?? 0), 2)}%`} />
            <MiniMetric l="Result." v={fmt(res)} />
          </div>
        </div>
      </div>
    </div>
  )
}

function MiniMetric({ l, v }: { l: string; v: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{l}</p>
      <p className="text-xs font-semibold text-foreground">{v}</p>
    </div>
  )
}
