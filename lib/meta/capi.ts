// Helpers compartilhados para a Meta Conversions API (CAPI).
// Usados por /api/meta/events (fechamento em tempo real) e /api/meta/backfill (leads já fechados).
import { createHash } from "crypto"

const VERSAO = process.env.META_API_VERSION || "v21.0"
export const BASE = `https://graph.facebook.com/${VERSAO}`
export const PIXEL_PADRAO = "2053723892017546"

export function resolveMetaToken(): string | null {
  const raw = process.env.META_CAPI_TOKEN || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN
  return raw?.trim().replace(/^['"]+|['"]+$/g, "") ?? null
}

export function metaPixelId(): string {
  return process.env.META_PIXEL_ID || PIXEL_PADRAO
}

export function hashMetaValue(v: unknown): string {
  return createHash("sha256").update(String(v ?? "").toLowerCase().trim()).digest("hex")
}

export interface PurchaseEventInput {
  lead_id: string
  telefone: string
  nome?: string | null
  valor?: number | string | null
  corretor_id?: string | null
  campanha_id?: string | null
  adset_id?: string | null
  ad_id?: string | null
  event_time?: number
}

export function buildPurchaseEvent(input: PurchaseEventInput) {
  const eventTime = input.event_time ?? Math.floor(Date.now() / 1000)
  const phoneDigits = String(input.telefone).replace(/\D/g, "")
  const nomePartes = String(input.nome ?? "").trim().split(/\s+/)
  return {
    event_name: "Purchase",
    event_time: eventTime,
    event_id: `${input.lead_id}-${eventTime}`,
    action_source: "website",
    event_source_url: process.env.NEXT_PUBLIC_APP_URL || "https://crm-colucci-pre-final.vercel.app",
    user_data: {
      ph: [hashMetaValue(phoneDigits)],
      fn: nomePartes[0] ? [hashMetaValue(nomePartes[0])] : undefined,
      ln: nomePartes.length > 1 ? [hashMetaValue(nomePartes.slice(1).join(" "))] : undefined,
    },
    custom_data: {
      currency: "BRL",
      value: typeof input.valor === "number" ? input.valor : Number.parseFloat(String(input.valor ?? "")) || 0,
      lead_id: input.lead_id,
      corretor_id: input.corretor_id ?? null,
      campaign_id: input.campanha_id ?? null,
      adset_id: input.adset_id ?? null,
      ad_id: input.ad_id ?? null,
    },
  }
}

export async function sendMetaEvents(token: string, pixelId: string, events: unknown[]): Promise<{ status: number; json: any }> {
  const form = new URLSearchParams({ access_token: token, data: JSON.stringify(events) })
  const r = await fetch(`${BASE}/${pixelId}/events`, { method: "POST", body: form })
  let j: any
  try { j = await r.json() } catch { j = {} }
  return { status: r.status, json: j }
}
