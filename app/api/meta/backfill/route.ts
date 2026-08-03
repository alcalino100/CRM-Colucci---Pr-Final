// Backfill: envia eventos Purchase (CAPI) dos leads JÁ fechados no CRM.
// - GET, protegido pelo CRON_SECRET (mesma convenção do archive-leads).
// - event_id determinístico (lead_id + event_time) → reexecutar não duplica.
// - Idempotente: rodar de novo envia os mesmos eventos; o Meta deduplica por event_id.
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"
import { resolveMetaToken, metaPixelId, buildPurchaseEvent, sendMetaEvents, persistMetaEventLog } from "@/lib/meta/capi"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

const BATCH = 25

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const url = new URL(req.url)
  const auth = req.headers.get("authorization")
  const qs = url.searchParams.get("secret")
  const autorizado = !!secret && (auth === `Bearer ${secret}` || qs === secret)
  if (!autorizado) return NextResponse.json({ erro: "não autorizado" }, { status: 401 })

  const token = resolveMetaToken()
  if (!token) return NextResponse.json({ ok: false, erro: "sem token Meta" }, { status: 401 })
  const pixel = metaPixelId()

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data: leads, error } = await supabase
      .from("leads")
      .select("id,nome,telefone,valor_proposta,corretor_id,meta_campaign_id,meta_adset_id,meta_ad_id,atualizado_em,criado_em")
      .eq("status", "fechado")

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })

    const eventosComMeta = (leads ?? [])
      .filter((l) => l.telefone && String(l.telefone).trim())
      .map((l) => {
        const event = buildPurchaseEvent({
          lead_id: l.id,
          telefone: l.telefone,
          nome: l.nome,
          valor: l.valor_proposta,
          corretor_id: l.corretor_id,
          campanha_id: l.meta_campaign_id,
          adset_id: l.meta_adset_id,
          ad_id: l.meta_ad_id,
          event_time: Math.floor(new Date(l.atualizado_em || l.criado_em || new Date().toISOString()).getTime() / 1000),
        })
        return { event, lead: l }
      })

    const ignorados = (leads ?? []).length - eventosComMeta.length

    const lotes: any[] = []
    for (let i = 0; i < eventosComMeta.length; i += BATCH) {
      const chunk = eventosComMeta.slice(i, i + BATCH)
      const { status, json } = await sendMetaEvents(token, pixel, chunk.map((c) => c.event))
      const ok = !json.error
      await Promise.all(chunk.map((c) =>
        persistMetaEventLog({
          origem: "backfill",
          event_id: c.event.event_id,
          pixel_id: pixel,
          lead_id: c.lead.id,
          nome: c.lead.nome,
          telefone: c.lead.telefone,
          valor: c.lead.valor_proposta,
          corretor_id: c.lead.corretor_id,
          campaign_id: c.lead.meta_campaign_id,
          adset_id: c.lead.meta_adset_id,
          ad_id: c.lead.meta_ad_id,
          status: ok ? "enviado" : "erro",
          http_status: status,
          events_received: ok ? json.events_received : null,
          meta_code: ok ? null : json.error?.code,
          meta_message: ok ? null : json.error?.message,
          event_time: c.event.event_time,
        })
      ))
      lotes.push({ lote: Math.floor(i / BATCH) + 1, eventos: chunk.length, http: status, recebidos: json.events_received ?? 0, erro: json.error?.message ?? null })
    }

    return NextResponse.json({
      ok: true,
      total_leads_fechados: leads?.length ?? 0,
      eventos_enviados: eventosComMeta.length,
      ignorados_sem_telefone: ignorados,
      pixel_id: pixel,
      lotes,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 })
  }
}
