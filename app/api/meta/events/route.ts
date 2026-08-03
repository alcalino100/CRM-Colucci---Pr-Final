// Envia eventos de conversão para a Meta (Conversions API / CAPI).
// - Token resolvido no servidor (nunca vai ao client).
// - Evento: Purchase com valor da negociação em BRL, quando um lead fecha no CRM.
// - Pixel padrão: "Colucci Imóveis - DashboardCRM" (2053723892017546). Override via env META_PIXEL_ID.
import { NextResponse } from "next/server"
import { resolveMetaToken, metaPixelId, buildPurchaseEvent, sendMetaEvents, persistMetaEventLog } from "@/lib/meta/capi"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function POST(req: Request) {
  const token = resolveMetaToken()
  if (!token) return NextResponse.json({ error: "sem token (env META_ACCESS_TOKEN / META_CAPI_TOKEN)" }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: "body JSON inválido" }, { status: 400 }) }

  const { lead_id, telefone, nome, valor, corretor_id, campanha_id, adset_id, ad_id } = body
  if (!lead_id || !telefone) return NextResponse.json({ error: "lead_id e telefone são obrigatórios" }, { status: 400 })

  const event = buildPurchaseEvent({ lead_id, telefone, nome, valor, corretor_id, campanha_id, adset_id, ad_id })
  const pixelId = metaPixelId()

  try {
    const { status, json: j } = await sendMetaEvents(token, pixelId, [event])
    if (j.error) {
      await persistMetaEventLog({
        origem: "events",
        event_id: event.event_id,
        pixel_id: pixelId,
        lead_id,
        nome,
        telefone,
        valor,
        corretor_id,
        campaign_id: campanha_id,
        adset_id,
        ad_id,
        status: "erro",
        http_status: status,
        meta_code: j.error.code,
        meta_message: j.error.message,
        event_time: event.event_time,
      })
      return NextResponse.json({ error: j.error.message, metaCode: j.error.code }, { status })
    }
    await persistMetaEventLog({
      origem: "events",
      event_id: event.event_id,
      pixel_id: pixelId,
      lead_id,
      nome,
      telefone,
      valor,
      corretor_id,
      campaign_id: campanha_id,
      adset_id,
      ad_id,
      status: "enviado",
      http_status: status,
      events_received: j.events_received,
      event_time: event.event_time,
    })
    return NextResponse.json({ ok: true, events_received: j.events_received, event_id: event.event_id, pixel_id: pixelId })
  } catch (e: any) {
    await persistMetaEventLog({
      origem: "events",
      event_id: event.event_id,
      pixel_id: pixelId,
      lead_id,
      nome,
      telefone,
      valor,
      corretor_id,
      campaign_id: campanha_id,
      adset_id,
      ad_id,
      status: "erro",
      meta_message: e.message,
      event_time: event.event_time,
    })
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
