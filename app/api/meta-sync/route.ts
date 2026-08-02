// app/api/meta-sync/route.ts
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"

function db() {
  return createClient(SUPABASE_URL, SUPABASE_KEY)
}

async function metaGetAll(url: string): Promise<any[]> {
  const out: any[] = []
  let next: string | null = url
  let guard = 0
  while (next && guard < 20) {
    guard++
    const r: Response = await fetch(next)
    const j: any = await r.json()
    if (j.error) throw new Error(`Meta: ${j.error.message}`)
    if (Array.isArray(j.data)) out.push(...j.data)
    next = j.paging?.next ?? null
  }
  return out
}

function prefixoCorretor(nome: string): string {
  return (nome.split(/[-–—|:]/)[0] || "").trim().toUpperCase()
}

// Resolve a conta de anúncio a sincronizar: query ?account_id → env META_AD_ACCOUNT_ID
// → primeira conta ativa do token (evita quebra quando o env não está definido).
async function resolveConta(url: URL, base: string, token: string): Promise<string> {
  let raw = url.searchParams.get("account_id") || process.env.META_AD_ACCOUNT_ID || ""
  if (raw) {
    raw = raw.trim()
    return raw.startsWith("act_") ? raw : `act_${raw}`
  }
  const accs = await metaGetAll(`${base}/me/adaccounts?fields=id,account_status&limit=100&access_token=${token}`)
  const ativa = accs.find((a: any) => a.account_status === 1) ?? accs[0]
  if (!ativa?.id) throw new Error("Nenhuma conta de anúncio encontrada para o token")
  const id = String(ativa.id)
  return id.startsWith("act_") ? id : `act_${id}`
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const url = new URL(req.url)
  const auth = req.headers.get("authorization")
  const qs = url.searchParams.get("secret")
  const autorizado = !!secret && (auth === `Bearer ${secret}` || qs === secret)
  if (!autorizado) return NextResponse.json({ erro: "não autorizado" }, { status: 401 })

  try {
    const rawToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN
    const token = rawToken?.trim().replace(/^['"]+|['"]+$/g, "")
    if (!token) return NextResponse.json({ ok: false, erro: "Token da Meta não configurado." }, { status: 400 })
    const versao = process.env.META_API_VERSION || "v25.0"
    const conta = await resolveConta(url, `https://graph.facebook.com/${versao}`, token)

    const since = url.searchParams.get("since")
    const until = url.searchParams.get("until")
    const datePart = since && until
      ? `time_range=${encodeURIComponent(JSON.stringify({ since, until }))}`
      : `date_preset=last_30d`

    const base = `https://graph.facebook.com/${versao}`
    const supabase = db()
    const erros: string[] = []
    const ok = (e: string[]) => (e.length ? { ok: false, erros: e } : { ok: true })

    // ---------- CAMPANHAS ----------
    const campanhas = await metaGetAll(`${base}/${conta}/campaigns?fields=id,name,effective_status&limit=200&access_token=${token}`)
    const { data: corretores } = await supabase.from("usuarios").select("id, nome").eq("role", "corretor")
    const mapaCorretor = new Map<string, string>()
    for (const c of corretores ?? []) {
      const primeiro = (c.nome || "").split(" ")[0].toUpperCase()
      if (primeiro) mapaCorretor.set(primeiro, c.id)
    }
    const achaCorretor = (nome: string) => mapaCorretor.get(prefixoCorretor(nome)) ?? null

    const linhasCamp = campanhas.map((c) => ({
      id: c.id, nome: c.name ?? "", status: c.effective_status ?? null, conta,
      corretor_id: achaCorretor(c.name ?? ""), atualizado_em: new Date().toISOString(),
    }))
    if (linhasCamp.length) {
      const { error } = await supabase.from("meta_campanhas").upsert(linhasCamp, { onConflict: "id" })
      if (error) erros.push(`campanhas: ${error.message}`)
    }

    // ---------- CONJUNTOS (adsets) ----------
    try {
      const adsets = await metaGetAll(`${base}/${conta}/adsets?fields=id,name,effective_status,campaign_id&limit=500&access_token=${token}`)
      const linhasAdsets = adsets.map((a) => ({
        id: a.id, campanha_id: a.campaign_id, nome: a.name ?? "", status: a.effective_status ?? null,
        atualizado_em: new Date().toISOString(),
      }))
      if (linhasAdsets.length) {
        const { error } = await supabase.from("meta_adsets").upsert(linhasAdsets, { onConflict: "id" })
        if (error) erros.push(`adsets: ${error.message}`)
      }
    } catch (e: any) {
      erros.push(`adsets: ${e.message}`)
    }

    // ---------- ANÚNCIOS (ads) ----------
    try {
      const ads = await metaGetAll(`${base}/${conta}/ads?fields=id,name,effective_status,campaign_id,adset_id&limit=500&access_token=${token}`)
      const linhasAds = ads.map((a) => ({
        id: a.id, campanha_id: a.campaign_id, adset_id: a.adset_id, nome: a.name ?? "", status: a.effective_status ?? null,
        atualizado_em: new Date().toISOString(),
      }))
      if (linhasAds.length) {
        const { error } = await supabase.from("meta_ads").upsert(linhasAds, { onConflict: "id" })
        if (error) erros.push(`ads: ${error.message}`)
      }
    } catch (e: any) {
      erros.push(`ads: ${e.message}`)
    }

    // IDs válidos para as FKs das tabelas de insights (entidades que podem ter sido
    // criadas e deletadas dentro da janela de insights não existem no banco e falhariam).
    const { data: idsCamp } = await supabase.from("meta_campanhas").select("id")
    const { data: idsAdset } = await supabase.from("meta_adsets").select("id")
    const { data: idsAd } = await supabase.from("meta_ads").select("id")
    const campValidos = new Set((idsCamp ?? []).map((r: any) => String(r.id)))
    const adsetValidos = new Set((idsAdset ?? []).map((r: any) => String(r.id)))
    const adValidos = new Set((idsAd ?? []).map((r: any) => String(r.id)))

    // ---------- INSIGHTS POR CAMPANHA ----------
    try {
      const insightsCampanha = await metaGetAll(
        `${base}/${conta}/insights?level=campaign&fields=campaign_id,spend,impressions,clicks,actions&time_increment=1&${datePart}&limit=500&access_token=${token}`
      )
      const linhasGastoCamp = insightsCampanha
        .filter((r: any) => campValidos.has(String(r.campaign_id)))
        .map((r: any) => ({
          campanha_id: r.campaign_id, data: r.date_start,
          gasto: Number(r.spend ?? 0), impressoes: Number(r.impressions ?? 0), cliques: Number(r.clicks ?? 0),
          mensagens_iniciadas: Number((r.actions || []).find((a: any) => a.action_type === "onsite_conversion.messaging_conversation_started_7d")?.value ?? 0),
        }))
      if (linhasGastoCamp.length) {
        const { error } = await supabase.from("meta_insights_campaign_daily").upsert(linhasGastoCamp, { onConflict: "campanha_id,data" })
        if (error) erros.push(`insights_campaign: ${error.message}`)
      }
    } catch (e: any) {
      erros.push(`insights_campaign: ${e.message}`)
    }

    // ---------- INSIGHTS POR CONJUNTO ----------
    try {
      const insightsAdset = await metaGetAll(
        `${base}/${conta}/insights?level=adset&fields=adset_id,spend,impressions,clicks,actions&time_increment=1&${datePart}&limit=500&access_token=${token}`
      )
      const linhasGastoAdset = insightsAdset
        .filter((r: any) => adsetValidos.has(String(r.adset_id)))
        .map((r: any) => ({
          adset_id: r.adset_id, data: r.date_start,
          gasto: Number(r.spend ?? 0), impressoes: Number(r.impressions ?? 0), cliques: Number(r.clicks ?? 0),
          mensagens_iniciadas: Number((r.actions || []).find((a: any) => a.action_type === "onsite_conversion.messaging_conversation_started_7d")?.value ?? 0),
        }))
      if (linhasGastoAdset.length) {
        const { error } = await supabase.from("meta_insights_adset_daily").upsert(linhasGastoAdset, { onConflict: "adset_id,data" })
        if (error) erros.push(`insights_adset: ${error.message}`)
      }
    } catch (e: any) {
      erros.push(`insights_adset: ${e.message}`)
    }

    // ---------- INSIGHTS POR ANÚNCIO ----------
    try {
      const insightsAd = await metaGetAll(
        `${base}/${conta}/insights?level=ad&fields=ad_id,spend,impressions,clicks,actions&time_increment=1&${datePart}&limit=500&access_token=${token}`
      )
      const linhasGastoAd = insightsAd
        .filter((r: any) => adValidos.has(String(r.ad_id)))
        .map((r: any) => ({
          ad_id: r.ad_id, data: r.date_start,
          gasto: Number(r.spend ?? 0), impressoes: Number(r.impressions ?? 0), cliques: Number(r.clicks ?? 0),
          mensagens_iniciadas: Number((r.actions || []).find((a: any) => a.action_type === "onsite_conversion.messaging_conversation_started_7d")?.value ?? 0),
        }))
      if (linhasGastoAd.length) {
        const { error } = await supabase.from("meta_insights_ad_daily").upsert(linhasGastoAd, { onConflict: "ad_id,data" })
        if (error) erros.push(`insights_ad: ${error.message}`)
      }
    } catch (e: any) {
      erros.push(`insights_ad: ${e.message}`)
    }

    return NextResponse.json({
      ok: erros.length === 0,
      conta,
      campanhas: linhasCamp.length,
      conjuntos: (await supabase.from("meta_adsets").select("id").limit(1)).data?.length ?? 0,
      anuncios: (await supabase.from("meta_ads").select("id").limit(1)).data?.length ?? 0,
      erros,
      quando: new Date().toISOString(),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 })
  }
}
