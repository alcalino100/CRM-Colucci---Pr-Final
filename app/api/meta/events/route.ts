// Envia eventos de conversão para a Meta (Conversions API / CAPI).
// - Token resolvido no servidor (nunca vai ao client).
// - Evento: Purchase com valor da negociação em BRL, quando um lead de tráfego fecha no CRM.
// - Pixel padrão: "Pixel de Colucci Imóveis" (554284008964640). Override via env META_PIXEL_ID.
import { NextResponse } from "next/server"
import { createHash } from "crypto"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

const VERSAO = process.env.META_API_VERSION || "v21.0"
const BASE = `https://graph.facebook.com/${VERSAO}`
const PIXEL_PADRAO = "2053723892017546"

function resolveToken(): string | null {
  const raw = process.env.META_CAPI_TOKEN || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN
  return raw?.trim().replace(/^['"]+|['"]+$/g, "") ?? null
}

function hash(v: unknown): string {
  return createHash("sha256").update(String(v ?? "").toLowerCase().trim()).digest("hex")
}

export async function POST(req: Request) {
  const token = resolveToken()
  if (!token) return NextResponse.json({ error: "sem token (env META_ACCESS_TOKEN / META_CAPI_TOKEN)" }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: "body JSON inválido" }, { status: 400 }) }

  const { lead_id, telefone, nome, valor, campanha_id, adset_id, ad_id } = body
  if (!lead_id || !telefone) return NextResponse.json({ error: "lead_id e telefone são obrigatórios" }, { status: 400 })

  const pixelId = process.env.META_PIXEL_ID || PIXEL_PADRAO
  const eventTime = Math.floor(Date.now() / 1000)
  const phoneDigits = String(telefone).replace(/\D/g, "")
  const nomePartes = String(nome ?? "").trim().split(/\s+/)

  const event = {
    event_name: "Purchase",
    event_time: eventTime,
    event_id: `${lead_id}-${eventTime}`,
    action_source: "website",
    event_source_url: process.env.NEXT_PUBLIC_APP_URL || "https://crm-colucci-pre-final.vercel.app",
    user_data: {
      ph: [hash(phoneDigits)],
      fn: nomePartes[0] ? [hash(nomePartes[0])] : undefined,
      ln: nomePartes.length > 1 ? [hash(nomePartes.slice(1).join(" "))] : undefined,
    },
    custom_data: {
      currency: "BRL",
      value: typeof valor === "number" ? valor : Number.parseFloat(valor) || 0,
      lead_id,
      corretor_id: body.corretor_id ?? null,
      campaign_id: campanha_id ?? null,
      adset_id: adset_id ?? null,
      ad_id: ad_id ?? null,
    },
  }

  const form = new URLSearchParams({ access_token: token, data: JSON.stringify([event]) })
  try {
    const r = await fetch(`${BASE}/${pixelId}/events`, { method: "POST", body: form })
    const j: any = await r.json()
    if (j.error) {
      return NextResponse.json({ error: j.error.message, metaCode: j.error.code }, { status: r.status })
    }
    return NextResponse.json({ ok: true, events_received: j.events_received, event_id: event.event_id, pixel_id: pixelId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
