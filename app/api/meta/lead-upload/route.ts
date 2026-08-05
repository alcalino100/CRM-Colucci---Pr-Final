// Envio manual de um lead fechado para a Meta (CAPI) + log persistente.
// POST { lead_id, usuario_id } — somente gestores ativos.
// Sempre envia (o gestor clicou de propósito); o Meta deduplica por event_id.
// event_time usa atualizado_em (data do fechamento) p/ atribuir ao mês da venda,
// igual ao backfill. O arquivamento é feito pelo cliente após o envio bem-sucedido.
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"
import { resolveMetaToken, metaPixelId, buildPurchaseEvent, sendMetaEvents, persistMetaEventLog } from "@/lib/meta/capi"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function POST(req: Request) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, erro: "JSON inválido" }, { status: 400 })
  }
  const { lead_id, usuario_id } = body ?? {}
  if (!lead_id || !usuario_id)
    return NextResponse.json({ ok: false, erro: "lead_id e usuario_id são obrigatórios" }, { status: 400 })

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

  const { data: usuario, error: ue } = await supabase
    .from("usuarios")
    .select("id,role,status,nome")
    .eq("id", usuario_id)
    .maybeSingle()
  if (ue) return NextResponse.json({ ok: false, erro: ue.message }, { status: 500 })
  if (!usuario || usuario.role !== "gestor" || usuario.status !== "ativo")
    return NextResponse.json({ ok: false, erro: "Acesso restrito a gestores ativos" }, { status: 403 })

  const { data: lead, error: le } = await supabase
    .from("leads")
    .select("id,nome,telefone,email,valor_proposta,corretor_id,meta_campaign_id,meta_adset_id,meta_ad_id,status,criado_em,atualizado_em")
    .eq("id", lead_id)
    .maybeSingle()
  if (le) return NextResponse.json({ ok: false, erro: le.message }, { status: 500 })
  if (!lead) return NextResponse.json({ ok: false, erro: "Lead não encontrado" }, { status: 404 })
  if (lead.status !== "fechado")
    return NextResponse.json({ ok: false, erro: "Apenas leads fechados podem ser enviados ao Meta" }, { status: 400 })
  if (!lead.telefone || !String(lead.telefone).trim())
    return NextResponse.json({ ok: false, erro: "Lead sem telefone — não pode ser enviado ao Meta" }, { status: 400 })

  const token = resolveMetaToken()
  if (!token) return NextResponse.json({ ok: false, erro: "Token Meta não configurado" }, { status: 500 })
  const pixel = metaPixelId()

  const event = buildPurchaseEvent({
    lead_id: lead.id,
    telefone: lead.telefone,
    nome: lead.nome,
    email: lead.email,
    valor: lead.valor_proposta,
    corretor_id: lead.corretor_id,
    campanha_id: lead.meta_campaign_id,
    adset_id: lead.meta_adset_id,
    ad_id: lead.meta_ad_id,
    event_time: Math.floor(new Date(lead.atualizado_em || lead.criado_em || new Date().toISOString()).getTime() / 1000),
  })

  const { status, json } = await sendMetaEvents(token, pixel, [event])
  const ok = !json.error
  await persistMetaEventLog({
    origem: "manual",
    event_id: event.event_id,
    pixel_id: pixel,
    lead_id: lead.id,
    nome: lead.nome,
    telefone: lead.telefone,
    valor: lead.valor_proposta,
    corretor_id: lead.corretor_id,
    campaign_id: lead.meta_campaign_id,
    adset_id: lead.meta_adset_id,
    ad_id: lead.meta_ad_id,
    status: ok ? "enviado" : "erro",
    http_status: status,
    events_received: ok ? json.events_received : null,
    meta_code: ok ? null : json.error?.code,
    meta_message: ok ? null : json.error?.message,
    event_time: event.event_time,
  })

  return NextResponse.json({
    ok,
    enviado_por: usuario.nome,
    lead_id: lead.id,
    event_id: event.event_id,
    http_status: status,
    events_received: json.events_received ?? 0,
    erro: json.error?.message ?? null,
  }, { status: ok ? 200 : 502 })
}
