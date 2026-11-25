import { NextResponse } from "next/server"
import { onlyDigits, sendWhatsAppText, wsupabase } from "@/lib/whatsapp/server"
import { ehCanalOficial, phoneNumberIdDoCanal } from "@/lib/whatsapp-oficial/config"
import { enviarTextoOficial } from "@/lib/whatsapp-oficial/client"
import { dentroDaJanela, MSG_JANELA_EXPIRADA } from "@/lib/whatsapp-oficial/janela"
import { registrarEnvioOficial } from "@/lib/whatsapp-oficial/envio"
import { registrarEnvioManual } from "@/lib/whatsapp-webhook/registrar-envio"
import { exigirSessao, negarAcesso } from "@/lib/auth/sessao"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Envia uma mensagem de texto pelo WhatsApp de um corretor (usado pelo Chat do gestor).
// A mensagem é gravada aqui mesmo (pelo id devolvido pela Evolution); se o eco fromMe do
// webhook chegar depois, o id repetido é ignorado — sem duplicar a linha.
export async function POST(request: Request) {
  const auth = exigirSessao(request)
  if (!auth.ok) return negarAcesso(auth)

  let body: { instanceName?: string; telefone?: string; texto?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, erro: "Dados inválidos." }, { status: 400 })
  }

  const instanceName = body.instanceName?.trim()
  const telefone = onlyDigits(body.telefone ?? "")
  const texto = body.texto?.trim()

  if (!instanceName || !telefone || !texto) {
    return NextResponse.json({ ok: false, erro: "instanceName, telefone e texto são obrigatórios." }, { status: 400 })
  }

  // Canal da API oficial (Meta): texto livre só dentro da janela de 24h da última mensagem do cliente.
  if (ehCanalOficial(instanceName)) {
    const { data: ultima } = await wsupabase
      .from("whatsapp_mensagens")
      .select("criado_em")
      .eq("instance_name", instanceName)
      .eq("telefone", telefone)
      .eq("de_mim", false)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!dentroDaJanela(ultima?.criado_em)) return NextResponse.json({ ok: false, codigo: "JANELA_EXPIRADA", erro: MSG_JANELA_EXPIRADA }, { status: 409 })
    const r = await enviarTextoOficial(phoneNumberIdDoCanal(instanceName), telefone, texto)
    if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: 502 })
    await registrarEnvioOficial({ instanceName, telefone, texto, wamid: r.wamid })
    return NextResponse.json({ ok: true })
  }

  const res = await sendWhatsAppText(instanceName, telefone, texto)
  if (!res.ok) return NextResponse.json({ ok: false, erro: res.erro }, { status: 502 })
  await registrarEnvioManual({ instanceName, telefone, texto, keyId: res.keyId })
  return NextResponse.json({ ok: true })
}
