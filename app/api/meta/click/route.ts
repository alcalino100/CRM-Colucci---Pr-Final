// Registra o clique de anúncio (ponte /r) com os identificadores de correspondência
// (fbc/fbp/IP/UA) e as UTMs, retornando um click_id curto que vai no texto do WhatsApp.
// O webhook usa esse click_id para casar o clique com o lead.
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 15

// Sem caracteres ambíguos (0/O/1/I/L) para facilitar o lead digitar/se casar no texto
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
const TAMANHO = 8
const VALIDADE_HORAS = 72

function novoClickId(): string {
  let s = ""
  for (let i = 0; i < TAMANHO; i++) s += ALFABETO[Math.floor(Math.random() * ALFABETO.length)]
  return s
}

export async function POST(req: Request) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    null
  const ua = req.headers.get("user-agent") || null

  // UTM {{campaign.id}}/{{adset.id}}/{{ad.id}} trazem ids numéricos da Meta
  const campanha = String(body?.utm_campaign ?? "").trim()
  const conjunto = String(body?.utm_adset ?? "").trim()
  const anuncio = String(body?.utm_ad ?? "").trim()
  const metaCampaignId = /^\d+$/.test(campanha) ? campanha : null
  const metaAdsetId = /^\d+$/.test(conjunto) ? conjunto : null
  const metaAdId = /^\d+$/.test(anuncio) ? anuncio : null

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

  // Tenta até 5x um click_id único
  let inserido: any = null
  for (let tentativa = 0; tentativa < 5 && !inserido; tentativa++) {
    const clickId = novoClickId()
    const { data, error } = await supabase
      .from("rastreio_cliques")
      .insert({
        click_id: clickId,
        expira_em: new Date(Date.now() + VALIDADE_HORAS * 3600_000).toISOString(),
        ip,
        user_agent: ua,
        fbc: body?.fbc || null,
        fbp: body?.fbp || null,
        fbclid: body?.fbclid || null,
        utm_source: body?.utm_source || null,
        utm_medium: body?.utm_medium || null,
        utm_campaign: campanha || null,
        utm_term: body?.utm_term || null,
        utm_content: body?.utm_content || null,
        meta_campaign_id: metaCampaignId,
        meta_adset_id: metaAdsetId,
        meta_ad_id: metaAdId,
      })
      .select("id, click_id, expira_em")
      .maybeSingle()
    if (data) {
      inserido = data
      break
    }
    if (error && !String(error.message).includes("duplicate")) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  if (!inserido) return NextResponse.json({ error: "não foi possível gerar um click_id" }, { status: 500 })
  return NextResponse.json({ ok: true, click_id: inserido.click_id, expira_em: inserido.expira_em })
}
