import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Pausa ou retoma o atendimento automático da IA para um contato (por telefone/E164).
// A IA continua arquivando mensagens, mas só responde quando pausado=false.
export async function POST(request: Request) {
  let body: { telefone?: string; pausado?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, erro: "Dados inválidos." }, { status: 400 })
  }
  const telefone = String(body.telefone ?? "").replace(/\D/g, "")
  if (!telefone) return NextResponse.json({ ok: false, erro: "telefone é obrigatório." }, { status: 400 })
  const pausado = !!body.pausado

  if (pausado) {
    const { error } = await wsupabase
      .from("conversations_ia")
      .update({ ai_responding: false })
      .eq("external_id", telefone)
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  } else {
    const { error } = await wsupabase
      .from("conversations_ia")
      .update({ ai_responding: true })
      .eq("external_id", telefone)
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, pausado })
}