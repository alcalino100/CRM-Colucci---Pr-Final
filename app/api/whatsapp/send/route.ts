import { NextResponse } from "next/server"
import { onlyDigits, sendWhatsAppText } from "@/lib/whatsapp/server"
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

  const res = await sendWhatsAppText(instanceName, telefone, texto)
  if (!res.ok) return NextResponse.json({ ok: false, erro: res.erro }, { status: 502 })
  await registrarEnvioManual({ instanceName, telefone, texto, keyId: res.keyId })
  return NextResponse.json({ ok: true })
}
