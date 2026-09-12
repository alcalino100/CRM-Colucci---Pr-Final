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
    // Handoff completo: a pausa manual transfere ao humano — resumo de qualificação,
    // etapa Atendimento Humano e aviso ao responsável (não só o flag).
    try {
      const digits = telefone.replace(/\D/g, "")
      const variantes = Array.from(new Set([digits, digits.startsWith("55") ? digits.slice(2) : `55${digits}`]))
      const { data: leads } = await wsupabase
        .from("leads")
        .select("id, telefone")
        .or(variantes.map((v) => `telefone.ilike.%${v}%`).join(","))
        .limit(10)
      const norm = (v: string) => {
        const d = (v || "").replace(/\D/g, "")
        return d.length > 11 && d.startsWith("55") ? d.slice(2) : d
      }
      const lead = (leads ?? []).find((l: { telefone: string }) => norm(l.telefone) === norm(telefone)) as { id: string } | undefined
      if (lead?.id) {
        const { data: conv } = await wsupabase
          .from("conversations_ia")
          .select("id,ai_id")
          .eq("external_id", telefone)
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle()
        if (conv?.id) {
          const { finalizarParaHumano } = await import("@/lib/ai/qualificacao")
          await finalizarParaHumano({
            leadId: lead.id,
            convId: (conv as { id: string }).id,
            aiId: (conv as { ai_id: string }).ai_id,
            motivo: "IA pausada manualmente no Inbox",
            telefone,
            instanceName: body.instanceName,
          })
        }
      }
    } catch { /* handoff é best-effort */ }
    try {
      await wsupabase.from("automation_logs").insert({
        event_type: "ia_pausa_manual",
        event_title: "IA pausada manualmente no Inbox",
        event_description: `Gestor pausou a IA para ${telefone} (${body.instanceName || "instância?"}). A IA segue arquivando, mas não responde.`,
        actor_type: "gestor",
      })
    } catch { /* log é best-effort */ }
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

  try {
    await wsupabase.from("automation_logs").insert({
      event_type: "ia_retomada_manual",
      event_title: "IA retomada manualmente no Inbox",
      event_description: aviso
        ? `Gestor retomou a IA para ${telefone} (${body.instanceName || "instância?"}), mas sem resposta imediata: ${aviso}`
        : `Gestor retomou a IA para ${telefone} (${body.instanceName || "instância?"}) com resposta imediata enviada.`,
      actor_type: "gestor",
    })
  } catch { /* log é best-effort */ }

  return NextResponse.json({ ok: true, pausado, aviso })
}