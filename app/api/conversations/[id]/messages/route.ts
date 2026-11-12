import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"
import { CONVERSATIONS_IA_COLUMNS, MESSAGES_IA_COLUMNS } from "@/lib/supabase/projections"
import { generateAIResponse } from "@/lib/ai/generateResponse"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

function db() {
  return createClient(SUPABASE_URL, SUPABASE_KEY)
}

// Lista mensagens da conversa (usado por telas de auditoria/teste).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 })
    const { data, error } = await db()
      .from("messages_ia")
      .select("id,role,content,metadata,created_at,conversation_id")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true })
      .limit(100)
    if (error) throw error
    return NextResponse.json({ ok: true, messages: data ?? [] })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const t0 = Date.now()
  const { id } = await params
  const { message, aiId } = await req.json().catch(() => ({}))
  if (!message || !aiId) return NextResponse.json({ error: "message e aiId obrigatórios" }, { status: 400 })
  try {
    const { data: conv } = await db().from("conversations_ia").select(CONVERSATIONS_IA_COLUMNS).eq("id", id).single()
    if (!conv) return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
    // Lead vinculado (contact_id pode ser UUID de lead) para handoff completo.
    let leadIdEfetivo: string | undefined
    try {
      const cid = String((conv as { contact_id?: string }).contact_id || "")
      if (/^[0-9a-f-]{36}$/i.test(cid)) {
        const { data: l } = await db().from("leads").select("id").eq("id", cid).maybeSingle()
        if (l) leadIdEfetivo = (l as { id: string }).id
      }
    } catch { /* sem lead: handoff parcial */ }

const { data: historyDesc } = await db()
      .from("messages_ia")
      .select("role,content")
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(30)
    const history = [...(historyDesc || [])].reverse()

    const userMsg = await db()
      .from("messages_ia")
      .insert({ id: `msg_${Date.now()}`, conversation_id: id, role: "user", content: message })
      .select(MESSAGES_IA_COLUMNS)
      .single()
    try {
      await db()
        .from("conversations_ia")
        .update({ last_message_at: new Date().toISOString(), last_user_message_at: new Date().toISOString() })
        .eq("id", id)
    } catch {
      await db().from("conversations_ia").update({ last_message_at: new Date().toISOString() }).eq("id", id)
    }

    // Escalação real (mesmos triggers da produção).
    const { detectEscalation } = await import("@/lib/ai/escalationDetector")
    const esc = await detectEscalation(
      aiId,
      message,
      ((history || []) as { role: string; content: string }[]).map((m) => ({ role: m.role, content: m.content })),
      { maxMessages: 10 },
    )

    let aiMsg
    if (esc.shouldEscalate) {
      const { notificarEscalacao } = await import("@/lib/ai/handoffNotifications")
      await notificarEscalacao({
        conversationId: id,
        leadId: leadIdEfetivo,
        aiId,
        reason: esc.reason,
        triggerName: esc.triggerName,
        telefone: String((conv as { external_id?: string }).external_id || (conv as { contact_id?: string }).contact_id || "teste"),
        instanceName: undefined,
      })
      aiMsg = await db()
        .from("messages_ia")
        .insert({
          id: `msg_${Date.now() + 1}`,
          conversation_id: id,
          role: "ai",
          content: `🚨 ESCALADO: ${esc.reason}`,
          metadata: { escalated: true, trigger: esc.triggerName ?? null, severity: esc.severity },
        })
        .select(MESSAGES_IA_COLUMNS)
        .single()
    } else {
      const { message: aiResp, tokensUsed, model } = await generateAIResponse({
        aiId,
        userMessage: message,
        conversationHistory: ((history || []) as { role: string; content: string }[]).map((m) => ({ role: m.role, content: m.content })),
      })
      aiMsg = await db()
        .from("messages_ia")
        .insert({ id: `msg_${Date.now() + 1}`, conversation_id: id, role: "ai", content: aiResp, metadata: { tokensUsed, model } })
        .select(MESSAGES_IA_COLUMNS)
        .single()
    }

    return NextResponse.json({
      userMessage: userMsg.data,
      aiMessage: aiMsg.data,
      escalated: esc.shouldEscalate,
      escalationReason: esc.shouldEscalate ? esc.reason : null,
      severity: esc.severity,
      executionTimeMs: Date.now() - t0,
    })
  } catch (e: unknown) {
    logger.error("Erro na rota de mensagens da conversa", { error: e instanceof Error ? e.message : String(e) })
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
