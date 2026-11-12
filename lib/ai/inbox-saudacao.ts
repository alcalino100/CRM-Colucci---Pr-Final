import { normalizePhone } from "@/lib/labels"
import { sendPresence, sendWhatsAppText } from "@/lib/whatsapp/server"
import {
  dentroDoHorario,
  getRules,
  leadAptoParaResposta,
  nomeApresentacao,
  regrasParaPrompt,
  type AgentRules,
} from "./rules"
import { generateAIResponse } from "./generateResponse"
import {
  db,
  MANUAL_PIPELINE_INSTANCES,
  chaveConversa,
  moverLeadPipeline,
  normalize,
} from "./inbox-common"
import { agenteParaInstancia, agenteParaNumeroTeste } from "./inbox-resolution"

// Saudação proativa CTWA: clique no anúncio sem texto + lead novo + agente
// apto → a IA cumprimenta na hora (speed-to-lead real) em vez de silêncio.
// Nunca em instância 100% manual; nunca sem lead novo; nunca 2x.
export async function saudarLeadCTWA({
  telefone,
  leadId,
  instanceName,
}: {
  telefone: string
  leadId?: string
  instanceName?: string
}): Promise<void> {
  try {
    if (!telefone || MANUAL_PIPELINE_INSTANCES.has(instanceName || "")) return
    let agente = await agenteParaInstancia(instanceName)
    if (!agente) agente = await agenteParaNumeroTeste(telefone)
    if (!agente) return
    const AI_ID = agente.id as string
    const rules: AgentRules = getRules(agente.config, agente)
    const isTestNumber = (rules.target.numeroTeste || []).some(
      (n) => normalizePhone(String(n || "")) === normalizePhone(telefone)
    )
    if (!isTestNumber && !dentroDoHorario(rules)) return
    if (rules.channels.length && !rules.channels.includes("whatsapp")) return
    let lead: { id: string; nome?: string; status?: string; origem?: string; corretor_id?: string } | null = null
    if (leadId) {
      const { data: l } = await db()
        .from("leads")
        .select("id,nome,status,origem,corretor_id")
        .eq("id", leadId)
        .maybeSingle()
      lead = l as { id: string; nome?: string; status?: string; origem?: string; corretor_id?: string } | null
    }
    if (!lead || lead.status !== "novo") return
    if (!isTestNumber && !leadAptoParaResposta(rules, lead)) return
    if (rules.target.statusBloqueados.map(normalize).includes("novo")) return
    const key = chaveConversa(lead.id, telefone)
    const { data: existing } = await db()
      .from("conversations_ia")
      .select("id")
      .eq("ai_id", AI_ID)
      .eq("contact_id", key)
      .maybeSingle()
    if (existing?.id) {
      const { count } = await db()
        .from("messages_ia")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", existing.id)
      if ((count ?? 0) > 0) return
    }
    const nomeApre = nomeApresentacao(agente.name)
    const primeiroNome = String(lead.nome || "").split(" ")[0] || ""
    let saudacao = String(rules.style.saudacaoDefault || "")
      .replace("{nome_ia}", nomeApre)
      .replace("{nome_lead}", primeiroNome)
      .trim()
    if (!saudacao) {
      try {
        const { message } = await generateAIResponse({
          aiId: AI_ID,
          userMessage: `[sistema] Um lead novo${primeiroNome ? ` chamado ${primeiroNome}` : ""} chegou pelo anúncio e ainda não escreveu nada. Cumprimente com 1 pergunta para iniciar a qualificação.`,
          conversationHistory: [],
          regrasSuplementares: regrasParaPrompt(rules, nomeApre),
        })
        saudacao = String(message || "").trim()
      } catch {
        /* sem saudação, sem envio */
      }
    }
    if (!saudacao) return
    let convId: string
    if (existing?.id) {
      convId = existing.id
    } else {
      const agora = new Date().toISOString()
      const { data: created, error } = await db()
        .from("conversations_ia")
        .insert({
          id: `conv_${Date.now()}`,
          ai_id: AI_ID,
          contact_id: key,
          channel: "whatsapp",
          external_id: telefone,
          status: "active",
          ai_responding: true,
          last_message_at: agora,
        })
        .select("id")
        .single()
      if (error || !created) return
      convId = (created as { id: string }).id
    }
    if (instanceName) await sendPresence(instanceName, telefone).catch(() => {})
    await db().from("messages_ia").insert({
      id: `msg_${Date.now()}`,
      conversation_id: convId,
      role: "ai",
      content: saudacao,
    })
    if (!instanceName) return
    const envRes = await sendWhatsAppText(instanceName, telefone, saudacao)
    if (envRes.ok) {
      try {
        await db().from("whatsapp_mensagens").insert({
          instance_name: instanceName,
          telefone,
          corpo: saudacao,
          lead_id: lead.id,
          de_mim: true,
          veio_de_anuncio: true,
          mensagem_id: envRes.keyId ?? null,
        })
      } catch {
        /* vitrine best-effort */
      }
    }
    try {
      await db().from("automation_logs").insert({
        lead_id: lead.id,
        event_type: envRes.ok ? "ia_saudacao_ctwa" : "ia_envio_falhou",
        event_title: envRes.ok ? "IA saudou lead novo (CTWA)" : "Falha na saudação CTWA",
        event_description: envRes.ok
          ? `Primeiro toque via ${instanceName}.`
          : `Falha ao enviar saudação via ${instanceName}: ${envRes.erro}`,
        actor_type: "ia",
      })
    } catch {
      /* best-effort */
    }
    await moverLeadPipeline(lead.id, "em_atendimento")
  } catch {
    /* nunca derruba o webhook */
  }
}
