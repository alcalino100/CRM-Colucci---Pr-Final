// TEMPORÁRIO: réplica do meta-sync com diagnóstico por seção.
// Será removido após corrigir a causa.
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

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

async function resolveConta(base: string, token: string): Promise<string> {
  let raw = process.env.META_AD_ACCOUNT_ID || ""
  if (raw) {
    raw = raw.trim()
    return raw.startsWith("act_") ? raw : `act_${raw}`
  }
  const accs = await metaGetAll(`${base}/me/adaccounts?fields=id,account_status&limit=100&access_token=${token}`)
  const ativa = accs.find((a: any) => a.account_status === 1) ?? accs[0]
  if (!ativa?.id) throw new Error("Nenhuma conta de anúncio encontrada")
  const id = String(ativa.id)
  return id.startsWith("act_") ? id : `act_${id}`
}

export async function GET() {
  const report: any = {}
  try {
    const rawToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN
    const token = rawToken?.trim().replace(/^['"]+|['"]+$/g, "")
    if (!token) return NextResponse.json({ ok: false, erro: "sem token" })
    const versao = process.env.META_API_VERSION || "v25.0"
    const base = `https://graph.facebook.com/${versao}`
    const conta = await resolveConta(base, token)
    report.versao = versao
    report.conta = conta
    const supabase = db()
    const datePart = `date_preset=last_30d`

    report.campanhas = await (async () => {
      try {
        const c = await metaGetAll(`${base}/${conta}/campaigns?fields=id,name,effective_status&limit=200&access_token=${token}`)
        return { ok: true, total: c.length }
      } catch (e: any) {
        return { ok: false, erro: e.message }
      }
    })()

    report.adsets = await (async () => {
      try {
        const a = await metaGetAll(`${base}/${conta}/adsets?fields=id,name,effective_status,campaign_id&limit=500&access_token=${token}`)
        const linhas = a.map((x) => ({ id: x.id, campanha_id: x.campaign_id, nome: x.name ?? "", status: x.effective_status ?? null, atualizado_em: new Date().toISOString() }))
        if (linhas.length) {
          const { error } = await supabase.from("meta_adsets").upsert(linhas, { onConflict: "id" })
          if (error) return { ok: false, total: linhas.length, erro: `supabase: ${error.message}` }
        }
        return { ok: true, total: linhas.length }
      } catch (e: any) {
        return { ok: false, erro: e.message }
      }
    })()

    report.ads = await (async () => {
      try {
        const a = await metaGetAll(`${base}/${conta}/ads?fields=id,name,effective_status,campaign_id,adset_id&limit=500&access_token=${token}`)
        const linhas = a.map((x) => ({ id: x.id, campanha_id: x.campaign_id, adset_id: x.adset_id, nome: x.name ?? "", status: x.effective_status ?? null, atualizado_em: new Date().toISOString() }))
        if (linhas.length) {
          const { error } = await supabase.from("meta_ads").upsert(linhas, { onConflict: "id" })
          if (error) return { ok: false, total: linhas.length, erro: `supabase: ${error.message}` }
        }
        return { ok: true, total: linhas.length }
      } catch (e: any) {
        return { ok: false, erro: e.message }
      }
    })()

    report.insightsCampanha = await (async () => {
      try {
        const r = await metaGetAll(`${base}/${conta}/insights?level=campaign&fields=campaign_id,spend,impressions,clicks,actions&time_increment=1&${datePart}&limit=500&access_token=${token}`)
        return { ok: true, total: r.length }
      } catch (e: any) {
        return { ok: false, erro: e.message }
      }
    })()

    report.insightsAdset = await (async () => {
      try {
        const r = await metaGetAll(`${base}/${conta}/insights?level=adset&fields=adset_id,spend,impressions,clicks,actions&time_increment=1&${datePart}&limit=500&access_token=${token}`)
        return { ok: true, total: r.length }
      } catch (e: any) {
        return { ok: false, erro: e.message }
      }
    })()

    report.insightsAd = await (async () => {
      try {
        const r = await metaGetAll(`${base}/${conta}/insights?level=ad&fields=ad_id,spend,impressions,clicks,actions&time_increment=1&${datePart}&limit=500&access_token=${token}`)
        return { ok: true, total: r.length }
      } catch (e: any) {
        return { ok: false, erro: e.message }
      }
    })()
  } catch (e: any) {
    report.fatal = e.message
  }
  return NextResponse.json(report)
}
