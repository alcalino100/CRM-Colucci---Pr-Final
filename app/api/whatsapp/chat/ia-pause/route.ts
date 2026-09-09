import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Pausa ou retoma o atendimento automático da IA para um contato (por telefone/E164).
// A IA continua arquivando mensagens, mas só responde quando pausado=false.
// RETOMADA: além de liberar a conversa, dispara uma resposta IMEDIATA da IA para a
// última mensagem do lead (botão "Iniciar IA aqui" do Inbox).
export async function POST(request: Request) {
  let body: { telefone?: string; pausado?: boolean; instanceName?: string }
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
    return NextResponse.json({ ok: true, pausado })
  }

  const { error } = await wsupabase
    .from("conversations_ia")
    .update({ ai_responding: true })
    .eq("external_id", telefone)
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })

  // Dispara a resposta agora (não espera a próxima mensagem do lead).
  let aviso: string | null = null
  try {
    const { dispararRespostaIA } = await import("@/lib/ai/inboxHandler")
    const r = await dispararRespostaIA({ telefone, instanceName: body.instanceName })
    if (!r.ok) aviso = r.erro ?? "IA não respondeu agora."
  } catch (e: any) {
    aviso = String(e?.message ?? e)
  }

  return NextResponse.json({ ok: true, pausado, aviso })
}