import { NextResponse } from "next/server"
import { onlyDigits, sendWhatsAppText } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Envia uma mensagem de texto pelo WhatsApp de um corretor (usado pelo Chat do gestor).
// A mensagem enviada só aparece na conversa quando o webhook da Evolution confirma o
// envio (evento fromMe) — evita duplicar a linha no banco.
export async function POST(request: Request) {
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
  return NextResponse.json({ ok: true })
}
