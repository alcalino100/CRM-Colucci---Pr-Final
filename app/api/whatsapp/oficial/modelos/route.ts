import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"
import { exigirSessao, negarAcesso } from "@/lib/auth/sessao"
import { listarModelos } from "@/lib/whatsapp-oficial/client"
import { phoneNumberIdDoCanal } from "@/lib/whatsapp-oficial/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Modelos (templates) aprovados do canal — usados pelo Inbox para falar com o cliente fora da janela de 24h.
export async function GET(request: Request) {
  const auth = exigirSessao(request)
  if (!auth.ok) return negarAcesso(auth)
  const instanceName = new URL(request.url).searchParams.get("instanceName") ?? ""
  const { data: canal } = await (wsupabase as unknown as { from: (t: string) => any })
    .from("whatsapp_oficial_canais")
    .select("waba_id")
    .eq("phone_number_id", phoneNumberIdDoCanal(instanceName))
    .maybeSingle()
  if (!canal?.waba_id) return NextResponse.json({ ok: false, erro: "Este canal não tem o WABA ID cadastrado (edite o canal em Configurações > WhatsApp)." }, { status: 422 })
  const r = await listarModelos(canal.waba_id)
  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: 502 })
  return NextResponse.json({ ok: true, modelos: r.modelos.filter((m) => m.status === "APPROVED") })
}
