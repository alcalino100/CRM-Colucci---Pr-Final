import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"
import { finalizarParaHumano } from "./qualificacao"

function db() {
  return createClient(SUPABASE_URL, SUPABASE_KEY)
}

export type HandoffParams = {
  conversationId: string
  leadId?: string
  aiId: string
  reason: string
  triggerName?: string
  telefone: string
  instanceName?: string
}

// Escalação concluída: pausa a IA, marca a conversa, move o lead para
// em_atendimento, registra o resumo nas observações e audita tudo.
// Defensivo: se as colunas novas (status/escalation_reason) ainda não existirem
// (migration pendente), cai para o essencial (ai_responding=false).
export async function notificarEscalacao(params: HandoffParams): Promise<void> {
  try {
    const full = await db()
      .from("conversations_ia")
      .update({ ai_responding: false, status: "escalated", escalation_reason: params.reason })
      .eq("id", params.conversationId)
    if (full.error) {
      const parcial = await db()
        .from("conversations_ia")
        .update({ ai_responding: false, status: "escalated" })
        .eq("id", params.conversationId)
      if (parcial.error) {
        await db().from("conversations_ia").update({ ai_responding: false }).eq("id", params.conversationId)
      }
    }

    if (params.leadId) {
      const { data: history } = await db()
        .from("messages_ia")
        .select("role,content")
        .eq("conversation_id", params.conversationId)
        .order("created_at", { ascending: true })
        .limit(10)

      const trecho = ((history ?? []) as { role: string; content: string }[])
        .slice(0, 5)
        .map((m) => `${m.role === "ia" || m.role === "assistant" ? "IA" : "Lead"}: ${String(m.content).slice(0, 60)}`)
        .join(" | ")

      const linha = `[ESCALAÇÃO] ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} — ${params.reason}. ${trecho}`

      const { data: lead } = await db().from("leads").select("observacoes").eq("id", params.leadId).maybeSingle()
      const obs = (((lead as { observacoes?: string } | null)?.observacoes) ?? "").trim()
      const novaObs = (obs ? `${obs}\n${linha}` : linha).slice(0, 6000)

      await db().from("leads").update({ observacoes: novaObs, status: "em_atendimento" }).eq("id", params.leadId)
    }

    try {
      await db().from("automation_logs").insert({
        lead_id: params.leadId || null,
        event_type: "ia_escalada",
        event_title: `Conversa escalada: ${params.triggerName || "manual"}`,
        event_description: params.reason,
        actor_type: "ia",
        payload: JSON.stringify({
          conversationId: params.conversationId,
          telefone: params.telefone,
          instanceName: params.instanceName,
        }).slice(0, 400),
      })
    } catch {
      /* log é best-effort */
    }

    // Handoff rico: resumo de qualificação + etapa Atendimento Humano + aviso.
    if (params.leadId) {
      await finalizarParaHumano({
        leadId: params.leadId,
        convId: params.conversationId,
        aiId: params.aiId,
        motivo: params.reason,
        triggerName: params.triggerName,
        telefone: params.telefone,
        instanceName: params.instanceName,
      })
    }

    // TODO: notificações reais por canal do trigger (whatsapp/slack/email).
    // Hoje a escalação já pausa a IA, move o lead e audita; o aviso ativo sai na Tarefa 3b.
  } catch (e) {
    console.error("[IA] erro notificarEscalacao", e)
  }
}
