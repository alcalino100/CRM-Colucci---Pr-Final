// Inicia o fluxo OAuth (Facebook Login for Business) — somente leitura de anúncios.
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const appId = process.env.META_APP_ID
  if (!appId) {
    return NextResponse.redirect(new URL("/meta-ads?meta_error=Configure%20META_APP_ID%20e%20META_APP_SECRET", req.url))
  }
  const origin = new URL(req.url).origin
  const redirect = `${origin}/api/meta/oauth/callback`
  const dialog =
    `https://www.facebook.com/${process.env.META_API_VERSION || "v21.0"}/dialog/oauth` +
    `?client_id=${appId}&redirect_uri=${encodeURIComponent(redirect)}` +
    `&scope=ads_read,business_management&response_type=code`
  return NextResponse.redirect(dialog)
}
