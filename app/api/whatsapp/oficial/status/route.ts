import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"
import { exigirGestor, negarAcesso } from "@/lib/auth/sessao"
import { statusDoNumero } from "@/lib/whatsapp-oficial/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Estado ao vivo do número na Meta (nome de exibição, status, qualidade, limite diário).
export async function GET(request: Request) {
  const auth = exigirGestor(request)
  if (!auth.ok) return negarAcesso(auth)
  const canalId = new URL(request.url).searchParams.get("canalId")
  const { data: canal } = await (wsupabase as unknown as { from: (t: string) => any }).from("whatsapp_oficial_canais").select("phone_number_id").eq("id", canalId ?? "").maybeSingle()
  if (!canal) return NextResponse.json({ ok: false, erro: "Canal não encontrado." }, { status: 404 })
  const r = await statusDoNumero(canal.phone_number_id)
  return r.ok ? NextResponse.json(r) : NextResponse.json({ ok: false, erro: r.erro }, { status: 502 })
}
