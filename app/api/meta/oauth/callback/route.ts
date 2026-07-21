// Callback OAuth: troca code → token curto → long-lived token (60 dias) e salva no banco.
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  const fail = (msg: string) => NextResponse.redirect(new URL(`/meta-ads?meta_error=${encodeURIComponent(msg)}`, req.url))
  if (!code || !appId || !appSecret) return fail("Fluxo OAuth incompleto")

  const versao = process.env.META_API_VERSION || "v21.0"
  const redirect = `${url.origin}/api/meta/oauth/callback`
  try {
    // 1) code → token curto
    const r1 = await fetch(`https://graph.facebook.com/${versao}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirect)}&code=${code}`)
    const j1: any = await r1.json()
    if (j1.error) return fail(j1.error.message)
    // 2) token curto → long-lived (~60 dias)
    const r2 = await fetch(`https://graph.facebook.com/${versao}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${j1.access_token}`)
    const j2: any = await r2.json()
    if (j2.error) return fail(j2.error.message)
    const expiresIn = Number(j2.expires_in || 60 * 86400)
    const expiraEm = new Date(Date.now() + expiresIn * 1000).toISOString()

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    await supabase.from("meta_conexao").upsert({ id: 1, access_token: j2.access_token, token_expira_em: expiraEm, atualizado_em: new Date().toISOString() })

    return NextResponse.redirect(new URL("/meta-ads?connected=1", req.url))
  } catch (e: any) {
    return fail(e.message || "Erro na conexão")
  }
}
