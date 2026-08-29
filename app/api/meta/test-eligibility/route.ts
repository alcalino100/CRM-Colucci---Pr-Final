import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const VERSAO = process.env.META_API_VERSION || "v26.0"
const BASE = `https://graph.facebook.com/${VERSAO}`

function db() {
  return createClient(SUPABASE_URL, SUPABASE_KEY)
}

async function resolveToken(): Promise<{ token: string | null; source: string }> {
  try {
    const { data } = await db().from("meta_conexao").select("access_token").eq("id", 1).maybeSingle()
    if (data?.access_token) return { token: data.access_token, source: "oauth" }
  } catch {}
  const raw = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN
  const envToken = raw?.trim().replace(/^['"]+|['"]+$/g, "")
  if (envToken) return { token: envToken, source: "env" }
  return { token: null, source: "mock" }
}

function extractCode(url: string): string | null {
  const m = url.match(/\/reel\/([^\/\?#]+)/) || url.match(/\/p\/([^\/\?#]+)/) || url.match(/instagram\.com\/[^\/]+\/([A-Za-z0-9_-]+)/)
  if (!m) return null
  return m[1].split("?")[0].split("&")[0]
}

export async function POST(req: Request) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: "body JSON inválido" }, { status: 400 }) }
  const links: string[] = body.links || body.urls || []
  if (!Array.isArray(links) || links.length === 0) return NextResponse.json({ error: "envie { links: string[] } com URLs do Instagram" }, { status: 400 })

  const codes = links.map((u) => ({ url: u, code: extractCode(String(u)) })).filter((x) => x.code)
  if (codes.length === 0) return NextResponse.json({ error: "nenhum código extraído dos links" }, { status: 400 })

  const { token, source } = await resolveToken()
  if (!token) {
    // mock para demonstrar formato quando sem token
    return NextResponse.json({
      connected: false,
      source,
      modo: "mock",
      resultados: codes.map(({ code, url }) => ({
        url,
        code,
        elegivel: null,
        motivo: "sem token - conecte Meta em /api/meta?op=status",
        mock: true,
      })),
    })
  }

  // Descobre IG business accounts vinculados
  let igUsers: { id: string; username?: string }[] = []
  try {
    const r = await fetch(`${BASE}/me/accounts?fields=instagram_business_account{id,username}&limit=50&access_token=${token}`)
    const j: any = await r.json()
    if (j.error) throw new Error(j.error.message)
    for (const acc of j.data || []) {
      if (acc.instagram_business_account?.id) igUsers.push(acc.instagram_business_account)
    }
    // fallback: tenta /me?fields=instagram_business_account
    if (igUsers.length === 0) {
      const r2 = await fetch(`${BASE}/me?fields=instagram_business_account{id,username}&access_token=${token}`)
      const j2: any = await r2.json()
      if (j2.instagram_business_account?.id) igUsers.push(j2.instagram_business_account)
    }
  } catch (e: any) {
    return NextResponse.json({ error: `falha ao listar IG accounts: ${e.message}`, source }, { status: 500 })
  }

  if (igUsers.length === 0) return NextResponse.json({ error: "nenhum Instagram Business vinculado ao token", source }, { status: 400 })

  const resultados: any[] = []

  for (const { url, code } of codes) {
    let foundId: string | null = null
    let foundPermalink: string | null = null

    // 1) Tenta resolver via oEmbed (requer aprovação) + fallback scraping HTML (media_id)
    let oError: any = null
    try {
      const oUrl = `${BASE}/instagram_oembed?url=${encodeURIComponent(url)}&access_token=${token}`
      const or = await fetch(oUrl)
      const oj: any = await or.json()
      if (!oj.error && oj.media_id) {
        foundId = String(oj.media_id)
        foundPermalink = url
      } else {
        oError = oj.error || oj
        // Fallback: scraping publico do Reel para extrair media_id (sem precisar de permissão Meta)
        const html = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15" } }).then((r) => r.text())
        const m = html.match(/"media_id"\s*:\s*"(\d+)"/) || html.match(/"pk"\s*:\s*"(\d+)"/)
        if (m) {
          // media_id do HTML é o pk puro (ex 397...), precisa converter para Graph ID via IG
          // Tentamos usar direto no Graph - se falhar, avisamos que precisa re-subir
          foundId = m[1]
          foundPermalink = url
          oError = { ...oError, scraped_media_id: foundId, note: "extraído via scraping, mas Graph API pode exigir IG Business do autor (corretor)" }
        }
      }
    } catch (e: any) { oError = e.message }
    // 2) Fallback: busca media por shortcode/permalink em cada IG user
    if (!foundId) {
      for (const ig of igUsers) {
        try {
          const listUrl = `${BASE}/${ig.id}/media?fields=id,shortcode,permalink,media_type,thumbnail_url,caption&limit=100&access_token=${token}`
          const lr = await fetch(listUrl)
          const lj: any = await lr.json()
          if (lj.error) continue
          for (const m of lj.data || []) {
            const sc = (m.shortcode || "") as string
            const perm = (m.permalink || "") as string
            if (sc === code || perm.includes(code)) {
              foundId = m.id
              foundPermalink = perm
              break
            }
          }
          if (foundId) break
        } catch {}
      }
    }

    if (!foundId) {
      resultados.push({ url, code, elegivel: null, motivo: "media não encontrada (oEmbed falhou e não está nos 100 recentes da imobiliária) - pode ser necessário usar IG do corretor como Business", oEmbedError: oError, igUsers: igUsers.map((u) => u.username || u.id) })
      continue
    }

    // Checa elegibilidade
    try {
      const er = await fetch(`${BASE}/${foundId}?fields=id,media_type,media_product_type,permalink,thumbnail_url,is_eligible_for_promotion,caption,like_count,comments_count&access_token=${token}`)
      const ej: any = await er.json()
      if (ej.error) {
        resultados.push({ url, code, ig_media_id: foundId, permalink: foundPermalink, elegivel: null, motivo: ej.error.message, raw: ej.error })
        continue
      }
      const elegivel = ej.is_eligible_for_promotion
      resultados.push({
        url,
        code,
        ig_media_id: foundId,
        permalink: foundPermalink || ej.permalink,
        media_type: ej.media_type,
        media_product_type: ej.media_product_type,
        elegivel: elegivel === true,
        is_eligible_for_promotion: elegivel,
        motivo: elegivel === true ? "elegível para promoção via API (object_story_id)" : elegivel === false ? "não elegível - provavelmente música com restrição ou tipo não promovido" : "campo não retornado",
        thumbnail_url: ej.thumbnail_url,
        like_count: ej.like_count,
      })
    } catch (e: any) {
      resultados.push({ url, code, ig_media_id: foundId, elegivel: null, motivo: e.message })
    }
  }

  return NextResponse.json({ connected: true, source, igUsers, resultados })
}
