"use client"

import React from "react"
import { CalendarRange } from "lucide-react"
import { Card, CardContent, Select, Input } from "@/components/ui/primitives"
import { PRESETS } from "@/lib/meta-ads-utils"

interface MetaAdsFilterBarProps {
  contas: any
  conta: any
  onSelectConta: (id: string) => void
  preset: string
  onSelectPreset: (preset: string) => void
  cSince: string
  onChangeCSince: (since: string) => void
  cUntil: string
  onChangeCUntil: (until: string) => void
  comparar: boolean
  onToggleComparar: (checked: boolean) => void
  prev: { since: string; until: string }
}

export function MetaAdsFilterBar({
  contas,
  conta,
  onSelectConta,
  preset,
  onSelectPreset,
  cSince,
  onChangeCSince,
  cUntil,
  onChangeCUntil,
  comparar,
  onToggleComparar,
  prev,
}: MetaAdsFilterBarProps) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="grid gap-4 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label
            className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            htmlFor="meta-conta"
          >
            Conta de anúncios
          </label>
          <Select
            id="meta-conta"
            value={conta?.id ?? ""}
            onChange={(e) => onSelectConta(e.target.value)}
            aria-label="Conta de anúncios"
          >
            {(contas?.data ?? []).map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.currency}
              </option>
            ))}
            {!contas && <option>Carregando…</option>}
          </Select>
          {conta && (
            <span className="text-xs text-muted-foreground">
              {conta.timezone_name} · {conta.account_status === 1 ? "Conta ativa" : "Conta inativa"}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label
            className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            htmlFor="meta-periodo"
          >
            <CalendarRange className="size-3.5" /> Período
          </label>
          <Select
            id="meta-periodo"
            value={preset}
            onChange={(e) => onSelectPreset(e.target.value)}
            aria-label="Período"
          >
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>

        {preset === "custom" ? (
          <>
            <div className="flex min-w-0 flex-col gap-1.5">
              <label
                className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                htmlFor="meta-de"
              >
                De
              </label>
              <Input
                id="meta-de"
                type="date"
                value={cSince}
                onChange={(e) => onChangeCSince(e.target.value)}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <label
                className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                htmlFor="meta-ate"
              >
                Até
              </label>
              <Input
                id="meta-ate"
                type="date"
                value={cUntil}
                onChange={(e) => onChangeCUntil(e.target.value)}
              />
            </div>
          </>
        ) : (
          <div className="flex items-end md:col-span-1 xl:col-span-2">
            <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted/60">
              <input
                type="checkbox"
                checked={comparar}
                onChange={(e) => onToggleComparar(e.target.checked)}
                className="size-4 accent-primary"
              />
              Comparar com período anterior
              <span className="rounded-full bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-border tabular-nums">
                {prev.since.split("-").reverse().join("/")} – {prev.until.split("-").reverse().join("/")}
              </span>
            </label>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
