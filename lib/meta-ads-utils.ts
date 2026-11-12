// =============================================================================
// meta-ads-utils.ts — Utilitários, Helpers de Data e Agregações do Meta Ads
// =============================================================================

import { extrairResultadosMeta } from "@/lib/meta/reconciliation"

export const fetcher = (u: string) =>
  fetch(u).then(async (r) => {
    const j = await r.json()
    if (!r.ok) throw Object.assign(new Error(j.error || "Erro"), { expired: j.expired })
    return j
  })

export const fmt = (n: number, d = 0) =>
  n.toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: d })

/**
 * Formata data YYYY-MM-DD no fuso de Brasília (America/Sao_Paulo) para casar com o Meta Ads Manager.
 */
export function toBrasiliaIso(d: Date): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d)
  const y = parts.find((p) => p.type === "year")?.value
  const m = parts.find((p) => p.type === "month")?.value
  const day = parts.find((p) => p.type === "day")?.value
  return `${y}-${m}-${day}`
}

export const brl2 = (v?: number) =>
  v == null
    ? "—"
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 })

export type Nivel = "account" | "campaign" | "adset" | "ad"

export const FILHO: Record<Nivel, Nivel | null> = {
  account: "campaign",
  campaign: "adset",
  adset: "ad",
  ad: null,
}

export const NIVEL_LABEL: Record<Nivel, string> = {
  account: "Conta",
  campaign: "Campanha",
  adset: "Conjunto",
  ad: "Anúncio",
}

export const STATUS_PT: Record<string, { label: string; variant: string }> = {
  ACTIVE: { label: "Ativo", variant: "green" },
  PAUSED: { label: "Pausado", variant: "amber" },
  ARCHIVED: { label: "Arquivado", variant: "gray" },
  DELETED: { label: "Removido", variant: "red" },
  CAMPAIGN_PAUSED: { label: "Campanha pausada", variant: "amber" },
  ADSET_PAUSED: { label: "Conjunto pausado", variant: "amber" },
}

export const PRESETS = [
  { id: "hoje", label: "Hoje" },
  { id: "7d", label: "Últimos 7 dias" },
  { id: "30d", label: "Últimos 30 dias" },
  { id: "mes", label: "Este mês" },
  { id: "custom", label: "Personalizado" },
] as const

export function rangeFor(
  preset: string,
  cSince: string,
  cUntil: string
): { since: string; until: string } {
  const agora = new Date()
  const hojeStr = toBrasiliaIso(agora)

  if (preset === "hoje") return { since: hojeStr, until: hojeStr }
  if (preset === "7d") {
    const d = new Date(Date.now() - 6 * 864e5)
    return { since: toBrasiliaIso(d), until: hojeStr }
  }
  if (preset === "mes") {
    const [ano, mes] = hojeStr.split("-")
    return { since: `${ano}-${mes}-01`, until: hojeStr }
  }
  if (preset === "custom" && cSince && cUntil) return { since: cSince, until: cUntil }
  const d30 = new Date(Date.now() - 29 * 864e5)
  return { since: toBrasiliaIso(d30), until: hojeStr }
}

export function periodoAnterior(since: string, until: string) {
  const d0 = new Date(since + "T12:00:00Z")
  const d1 = new Date(until + "T12:00:00Z")
  const dias = Math.round((d1.getTime() - d0.getTime()) / 864e5) + 1
  return {
    since: toBrasiliaIso(new Date(d0.getTime() - dias * 864e5)),
    until: toBrasiliaIso(new Date(d0.getTime() - 864e5)),
  }
}

export function agrega(rows: any[]) {
  const t = { spend: 0, impressions: 0, clicks: 0, reach: 0, results: 0 }
  for (const r of rows) {
    t.spend += Number(r.spend || 0)
    t.impressions += Number(r.impressions || 0)
    t.clicks += Number(r.clicks || 0)
    t.reach += Number(r.reach || 0)
    t.results += extrairResultadosMeta(r)
  }
  return {
    ...t,
    ctr: t.impressions ? (t.clicks / t.impressions) * 100 : 0,
    cpc: t.clicks ? t.spend / t.clicks : 0,
    cpm: t.impressions ? (t.spend / t.impressions) * 1000 : 0,
    freq: t.reach ? t.impressions / t.reach : 0,
    cpr: t.results ? t.spend / t.results : 0,
  }
}
