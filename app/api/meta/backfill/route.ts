// Backfill: envia eventos Purchase (CAPI) dos leads JÁ fechados no CRM.
// - GET, protegido pelo CRON_SECRET (mesma convenção do archive-leads).
// - Dedup: usa meta_event_logs para NÃO reenviar leads já enviados (por lead_id).
//   Use ?force=1 para reenviar tudo (ex.: depois de corrigir algum dado).
// - event_id determinístico (lead_id + event_time) → mesmo reenviando, o Meta deduplica.
// - ?now=1: usa o instante atual como event_time (event_id novo → Meta processa como evento novo).
// - ?clear_logs=1: apaga o histórico de meta_event_logs antes de enviar (limpa e grava logs novos).
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
  const force = url.searchParams.get("force") === "1"
  const usarAgora = url.searchParams.get("now") === "1"
  const limparLogs = url.searchParams.get("clear_logs") === "1"

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    // Apaga o histórico antigo de envios antes de gravar os novos (opcional).
    if (limparLogs) {
      const { error: delErr } = await supabase.from("meta_event_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000")
      if (delErr) return NextResponse.json({ ok: false, erro: `falha ao limpar logs: ${delErr.message}` }, { status: 500 })
    }

    const { data: leads, error } = await supabase
      .from("leads")
      .select("id,nome,telefone,email,valor_proposta,corretor_id,meta_campaign_id,meta_adset_id,meta_ad_id,atualizado_em,criado_em")
      .eq("status", "fechado")

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })

    // Leads já enviados anteriormente (tempo real + backfill), por lead_id.
    let jaEnviados = new Set<string>()
    if (!force) {
      const { data: logs } = await supabase
        .from("meta_event_logs")
        .select("lead_id")
        .not("lead_id", "is", null)
      for (const l of logs ?? []) if (l.lead_id) jaEnviados.add(String(l.lead_id))
    }

    const eventosComMeta = (leads ?? [])
      .filter((l) => l.telefone && String(l.telefone).trim())
      .filter((l) => force || !jaEnviados.has(String(l.id)))
      .map((l) => {
        const event = buildPurchaseEvent({
          lead_id: l.id,
          telefone: l.telefone,
          nome: l.nome,
          email: l.email,
          valor: l.valor_proposta,
          corretor_id: l.corretor_id,
          campanha_id: l.meta_campaign_id,
          adset_id: l.meta_adset_id,
          ad_id: l.meta_ad_id,
          event_time: usarAgora
            ? Math.floor(Date.now() / 1000)
            : Math.floor(new Date(l.atualizado_em || l.criado_em || new Date().toISOString()).getTime() / 1000),
        })
        return { event, lead: l }
      })

    const ignorados_sem_telefone = (leads ?? []).filter((l) => !l.telefone || !String(l.telefone).trim()).length
    const ignorados_ja_enviados = force ? 0 : (leads ?? []).filter((l) => l.telefone && String(l.telefone).trim() && jaEnviados.has(String(l.id))).length

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
      ignorados_sem_telefone,
      ignorados_ja_enviados,
      force,
      pixel_id: pixel,
      lotes,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 })
  }
}
