// Proxy seguro para a Meta Graph API (Marketing API).
// - Token NUNCA vai ao client: resolvido no servidor (tabela meta_conexao → env META_ACCESS_TOKEN).
// - Sem token: responde com mock estruturalmente idêntico ao Graph API (modo demonstração).
// - Cache em memória de 3 min para evitar rate limit no /insights.
// - Paginação (paging.cursors) tratada em metaGetAll.
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { MOCK_ACCOUNTS, mockAds, mockAdsets, mockCampaigns, mockCreative, mockInsights } from "@/lib/meta/mock"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const VERSAO = process.env.META_API_VERSION || "v21.0"
const BASE = `https://graph.facebook.com/${VERSAO}`

import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"

function db() {
  return createClient(SUPABASE_URL, SUPABASE_KEY)
}

// ---------- Token: meta_conexao (OAuth, permite trocar no futuro) → env → mock ----------
async function resolveToken(): Promise<{ token: string | null; source: "oauth" | "env" | "mock"; expiresAt: string | null }> {
  try {
    const { data } = await db().from("meta_conexao").select("access_token, token_expira_em").eq("id", 1).maybeSingle()
    if (data?.access_token) return { token: data.access_token, source: "oauth", expiresAt: data.token_expira_em ?? null }
  } catch { /* tabela pode não existir ainda */ }
  // Token padrão via env (FACEBOOK_PAGE_ACCESS_TOKEN ou META_ACCESS_TOKEN)
  // Remove aspas e espaços acidentais colados junto com o valor
  const raw = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN
  const envToken = raw?.trim().replace(/^['"]+|['"]+$/g, "")
  if (envToken) return { token: envToken, source: "env", expiresAt: null }
  return { token: null, source: "mock", expiresAt: null }
}

// ---------- Cache em memória (TTL 3 min) ----------
const cache = new Map<string, { at: number; body: any }>()
const TTL = 3 * 60_000
function getCache(k: string) {
  const c = cache.get(k)
  if (c && Date.now() - c.at < TTL) return c.body
  cache.delete(k)
  return null
}
function setCache(k: string, body: any) {
  if (cache.size > 200) cache.clear()
  cache.set(k, { at: Date.now(), body })
}

// ---------- Fetch com paginação ----------
async function metaGetAll(url: string): Promise<any[]> {
  const out: any[] = []
  let next: string | null = url
  let guard = 0
  while (next && guard < 25) {
    guard++
    const r: Response = await fetch(next)
    const j: any = await r.json()
    if (j.error) {
      const code = j.error.code
      const expired = code === 190
      throw Object.assign(new Error(j.error.message), { expired })
    }
    if (Array.isArray(j.data)) out.push(...j.data)
    else return [j]
    next = j.paging?.next ?? null
  }
  return out
}

const INSIGHT_FIELDS = "spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,cost_per_action_type"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const op = url.searchParams.get("op") || "status"
  const { token, source, expiresAt } = await resolveToken()
  const mock = !token

  const key = url.searchParams.toString() + "|" + source
  if (op !== "status") {
    const hit = getCache(key)
    if (hit) return NextResponse.json(hit)
  }

  try {
    let body: any

    if (op === "status") {
      let warnExpiring = false
      if (expiresAt) {
        const dias = (new Date(expiresAt).getTime() - Date.now()) / 864e5
        warnExpiring = dias < 7
      }
      body = { connected: !!token, source, expiresAt, warnExpiring, hasOAuthApp: !!(process.env.META_APP_ID && process.env.META_APP_SECRET) }
      return NextResponse.json(body)
    }

    if (op === "accounts") {
      body = mock
        ? MOCK_ACCOUNTS
        : { data: await metaGetAll(`${BASE}/me/adaccounts?fields=id,name,currency,timezone_name,account_status&limit=100&access_token=${token}`) }
    } else if (op === "campaigns") {
      const acc = url.searchParams.get("account")!
      body = mock
        ? mockCampaigns(acc)
        : { data: await metaGetAll(`${BASE}/${acc}/campaigns?fields=id,name,objective,effective_status,daily_budget,lifetime_budget,start_time,stop_time&limit=200&access_token=${token}`) }
    } else if (op === "adsets") {
      const camp = url.searchParams.get("campaign")!
      body = mock
        ? mockAdsets(camp)
        : { data: await metaGetAll(`${BASE}/${camp}/adsets?fields=id,name,effective_status,campaign_id,optimization_goal,daily_budget,lifetime_budget,targeting{geo_locations,age_min,age_max}&limit=200&access_token=${token}`) }
    } else if (op === "ads") {
      const adset = url.searchParams.get("adset")!
      body = mock
        ? mockAds(adset)
        : { data: await metaGetAll(`${BASE}/${adset}/ads?fields=id,name,effective_status,adset_id,creative{id}&limit=200&access_token=${token}`) }
    } else if (op === "pixels") {
      const acc = url.searchParams.get("account") || "act_321873088505518"
      body = mock
        ? { data: [] }
        : { data: await metaGetAll(`${BASE}/${acc}/adspixels?fields=id,name,is_unavailable,is_created_by_business,owner_business{id,name}&limit=100&access_token=${token}`) }
    } else if (op === "creative") {
      const cr = url.searchParams.get("id")!
      body = mock
        ? mockCreative(cr)
        : (await metaGetAll(`${BASE}/${cr}?fields=id,title,body,object_type,call_to_action_type,image_url,thumbnail_url,video_id,link_description&access_token=${token}`))[0]
    } else if (op === "insights") {
      const node = url.searchParams.get("node")! // act_x | campaign_id | adset_id | ad_id
      const level = url.searchParams.get("level") || "" // vazio = agregado do próprio nó
      const since = url.searchParams.get("since")!
      const until = url.searchParams.get("until")!
      const daily = url.searchParams.get("daily") === "1"
      if (mock) {
        let children: string[] | undefined
        if (level === "campaign") children = mockCampaigns(node).data.map((c: any) => c.id)
        else if (level === "adset") children = mockAdsets(node).data.map((a: any) => a.id)
        else if (level === "ad") children = mockAds(node).data.map((a: any) => a.id)
        body = mockInsights(node, since, until, daily, level || undefined, children)
      } else {
        const levelPart = level ? `&level=${level}&fields=${level}_id,${INSIGHT_FIELDS}` : `&fields=${INSIGHT_FIELDS}`
        const inc = daily ? "&time_increment=1" : ""
        const range = `time_range=${encodeURIComponent(JSON.stringify({ since, until }))}`
        body = { data: await metaGetAll(`${BASE}/${node}/insights?${range}${levelPart}${inc}&limit=500&access_token=${token}`) }
      }
    } else {
      return NextResponse.json({ error: "op inválida" }, { status: 400 })
    }

    setCache(key, body)
    return NextResponse.json(body)
  } catch (e: any) {
    const status = e.expired ? 401 : 500
    return NextResponse.json({ error: e.message, expired: !!e.expired }, { status })
  }
}

// ---------- Mutação: atualizar orçamento diário de um conjunto ----------
// POST /api/meta?op=set_budget  body: { adset_id: string, daily_budget: number (em centavos) }
export async function POST(req: Request) {
  const url = new URL(req.url)
  const op = url.searchParams.get("op")
  const { token } = await resolveToken()
  if (!token) return NextResponse.json({ error: "sem token (env META_ACCESS_TOKEN / FACEBOOK_PAGE_ACCESS_TOKEN)" }, { status: 401 })
  if (op !== "set_budget") return NextResponse.json({ error: "op inválida (use op=set_budget)" }, { status: 400 })

  try {
    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ error: "body JSON inválido" }, { status: 400 }) }

    const adsetId: string | undefined = body.adset_id
    const dailyBudget: number | undefined = body.daily_budget
    if (!adsetId || !Number.isInteger(dailyBudget) || dailyBudget! < 1) {
      return NextResponse.json({ error: "informe adset_id e daily_budget inteiro (em centavos, >= 1)" }, { status: 400 })
    }

    const form = new URLSearchParams({ access_token: token, daily_budget: String(dailyBudget) })
    const r = await fetch(`${BASE}/${adsetId}`, { method: "POST", body: form })
    const j: any = await r.json()
    if (j.error) return NextResponse.json({ error: j.error.message, metaCode: j.error.code, metaErrorSubcode: j.error.error_subcode }, { status: r.status })
    return NextResponse.json({ ok: true, adset_id: adsetId, daily_budget: dailyBudget, meta: j })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
