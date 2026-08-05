import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const url = new URL(req.url)
  const auth = req.headers.get("authorization")
  const qs = url.searchParams.get("secret")
  const autorizado = !!secret && (auth === `Bearer ${secret}` || qs === secret)
  if (!autorizado) return NextResponse.json({ erro: "não autorizado" }, { status: 401 })

  const nome = url.searchParams.get("nome")
  if (!nome) return NextResponse.json({ erro: "nome é obrigatório" }, { status: 400 })

  try {
    const { data, error } = await wsupabase
      .from("leads")
      .select("id, nome, telefone, corretor_id, status, criado_em, arquivado_em")
      .ilike("nome", `%${nome}%`)
      .limit(50)

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, total: data?.length ?? 0, leads: data ?? [] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 })
  }
}
