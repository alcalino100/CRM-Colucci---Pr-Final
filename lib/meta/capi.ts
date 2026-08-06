// Helpers compartilhados para a Meta Conversions API (CAPI).
// Usados por /api/meta/events (fechamento em tempo real) e /api/meta/backfill (leads já fechados).
import { createHash } from "crypto"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"

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
  email?: string | null
  valor?: number | string | null
  corretor_id?: string | null
  campanha_id?: string | null
  adset_id?: string | null
  ad_id?: string | null
  // Ponte de rastreio (/r): origem real do lead no clique do anúncio
  utm_campaign?: string | null
  utm_adset?: string | null
  utm_ad?: string | null
  event_time?: number
  // Campos de correspondência de eventos (Melhorias do Meta Ads):
  external_id?: string | null // não vai em hash (consistente entre envios)
  fbc?: string | null // _fbc (identificação de clique)
  fbp?: string | null // _fbp (identificação do navegador)
  ip?: string | null // client_ip_address
  ua?: string | null // client_user_agent
  zip?: string | null // zp (código postal) — hash
  city?: string | null // ct (cidade) — hash
  state?: string | null // st (estado) — hash
  birthdate?: string | null // db (data de nascimento) — hash
}

export function buildPurchaseEvent(input: PurchaseEventInput) {
  const eventTime = input.event_time ?? Math.floor(Date.now() / 1000)
  const phoneDigits = String(input.telefone).replace(/\D/g, "")
  const nomePartes = String(input.nome ?? "").trim().split(/\s+/)
  const userData: Record<string, any> = {
    ph: [hashMetaValue(phoneDigits)],
    fn: nomePartes[0] ? [hashMetaValue(nomePartes[0])] : undefined,
    ln: nomePartes.length > 1 ? [hashMetaValue(nomePartes.slice(1).join(" "))] : undefined,
  }
  // Cidade/UF/CEP fixos (Araçatuba-SP) — usados como identificadores de correspondência
  // enquanto o CRM não captura o endereço real do comprador.
  if ((input.city ?? "").trim()) userData.ct = [hashMetaValue(input.city)]
  else userData.ct = [hashMetaValue("Araçatuba")]
  if ((input.state ?? "").trim()) userData.st = [hashMetaValue(input.state)]
  else userData.st = [hashMetaValue("SP")]
  if ((input.zip ?? "").trim()) userData.zp = [hashMetaValue(input.zip)]
  else userData.zp = [hashMetaValue("16010-000")]
  if (input.birthdate?.trim()) userData.db = [hashMetaValue(input.birthdate)]
  userData.external_id = input.external_id || input.lead_id

  const event: Record<string, any> = {
    event_name: "Purchase",
    event_time: eventTime,
    event_id: `${input.lead_id}-${eventTime}`,
    action_source: "website",
    event_source_url: process.env.NEXT_PUBLIC_APP_URL || "https://crm-colucci-pre-final.vercel.app",
    user_data: userData,
    custom_data: {
      currency: "BRL",
      value: typeof input.valor === "number" ? input.valor : Number.parseFloat(String(input.valor ?? "")) || 0,
      lead_id: input.lead_id,
      corretor_id: input.corretor_id ?? null,
      campaign_id: input.campanha_id ?? null,
      adset_id: input.adset_id ?? null,
      ad_id: input.ad_id ?? null,
      utm_campaign: input.utm_campaign ?? null,
      utm_adset: input.utm_adset ?? null,
      utm_ad: input.utm_ad ?? null,
    },
  }
  if (input.fbc?.trim()) event.fbc = input.fbc.trim()
  if (input.fbp?.trim()) event.fbp = input.fbp.trim()
  if (input.ip?.trim()) event.client_ip_address = input.ip.trim()
  if (input.ua?.trim()) event.client_user_agent = input.ua.trim()
  return event
}

export async function sendMetaEvents(token: string, pixelId: string, events: unknown[]): Promise<{ status: number; json: any }> {
  const form = new URLSearchParams({ access_token: token, data: JSON.stringify(events) })
  const r = await fetch(`${BASE}/${pixelId}/events`, { method: "POST", body: form })
  let j: any
  try { j = await r.json() } catch { j = {} }
  return { status: r.status, json: j }
}

let _logSupabase: ReturnType<typeof createClient> | null = null
function logDb() {
  if (!_logSupabase) _logSupabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
  return _logSupabase
}

export function maskPhone(v: unknown): string {
  const d = String(v ?? "").replace(/\D/g, "")
  if (d.length < 10) return d ? `${d.slice(0, 2)}****${d.slice(-2)}` : ""
  return `${d.slice(0, 2)} ${d.slice(2, 3)}****-${d.slice(-4)}`
}

export interface MetaEventLogRow {
  origem: string
  event_id?: string | null
  event_name?: string | null
  pixel_id?: string | null
  lead_id?: string | null
  nome?: string | null
  telefone?: string | null
  valor?: number | string | null
  corretor_id?: string | null
  campaign_id?: string | null
  adset_id?: string | null
  ad_id?: string | null
  status: string
  http_status?: number | null
  events_received?: number | null
  meta_code?: string | null
  meta_message?: string | null
  event_time?: number | null
}

// Registra o envio no Supabase (best-effort: falha de log nunca derruba o envio).
export async function persistMetaEventLog(row: MetaEventLogRow): Promise<void> {
  try {
    const valorNum = typeof row.valor === "number" ? row.valor : Number.parseFloat(String(row.valor ?? ""))
    await logDb().from("meta_event_logs").insert({
      event_id: row.event_id ?? null,
      event_name: row.event_name ?? "Purchase",
      pixel_id: row.pixel_id ?? metaPixelId(),
      origem: row.origem,
      lead_id: row.lead_id ?? null,
      nome: row.nome ?? null,
      telefone_mascarado: maskPhone(row.telefone),
      valor: Number.isFinite(valorNum) ? valorNum : null,
      corretor_id: row.corretor_id ?? null,
      campaign_id: row.campaign_id ?? null,
      adset_id: row.adset_id ?? null,
      ad_id: row.ad_id ?? null,
      status: row.status,
      http_status: row.http_status ?? null,
      events_received: row.events_received ?? null,
      meta_code: row.meta_code ?? null,
      meta_message: row.meta_message ?? null,
      event_time: row.event_time ? new Date(row.event_time * 1000).toISOString() : null,
    })
  } catch {
    // silencioso: não bloqueia o envio se o log falhar
  }
}
