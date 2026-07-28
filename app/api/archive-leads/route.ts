import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const url = new URL(req.url)
  const auth = req.headers.get("authorization")
  const qs = url.searchParams.get("secret")
  const autorizado = !!secret && (auth === `Bearer ${secret}` || qs === secret)
  if (!autorizado) return NextResponse.json({ erro: "não autorizado" }, { status: 401 })

  try {
    const agora = new Date().toISOString()
    const { data, error } = await wsupabase
      .from("leads")
      .update({ arquivado_em: agora, atualizado_em: agora })
      .eq("status", "fechado")
      .is("arquivado_em", null)
      .select("id")

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      arquivados: data?.length ?? 0,
      quando: agora,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 })
  }
}
