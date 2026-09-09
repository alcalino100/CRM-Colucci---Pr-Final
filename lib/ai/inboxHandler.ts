import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"
import { generateAIResponse } from "./generateResponse"
import { normalizePhone } from "@/lib/labels"
import { sendWhatsAppText } from "@/lib/whatsapp/server"
import { getBoundInstances, getRules, dentroDoHorario, leadAptoParaResposta, regrasParaPrompt, sleep, type AgentRules } from "./rules"

function db(){ return createClient(SUPABASE_URL, SUPABASE_KEY) }
const normalize = (v: string) => (v || "").toLowerCase().trim()

// Resolve a IA que responde numa instância. REGRA DE OURO: a instância precisa estar
// vinculada a um agente (config.testInstance ou whitelistInstances) E o agente precisa
// estar ATIVO (is_active) com regras habilitadas (rules.enable). Sem isso, não responde NUNCA.
async function agenteParaInstancia(instanceName: string | undefined): Promise<any | null> {
  if (!instanceName) return null
  const { data: agentes, error } = await db().from("ai_agents").select("id,name,is_active,config,wait_time_ms,message_cap,response_mode")
  if (error || !agentes?.length) return null
  const ativos = (agentes as any[]).filter((a) => a.is_active && getRules(a.config).enable)
  return ativos.find((a) => getBoundInstances(a.config).includes(instanceName)) || null
}

// Acha o lead cujo telefone bate com o contato (mesmo corretor da instância quando possível).
async function acharLeadVinculado(telefone: string | undefined, instanceName: string | undefined): Promise<any | null> {
  if (!telefone) return null
  const { data: candidatos } = await db().from("leads").select("id, telefone, origem, status, corretor_id, referencias")
  const instancia = instanceName
    ? (await db().from("whatsapp_instancias").select("corretor_id").eq("instance_name", instanceName).maybeSingle()).data
    : null
  const corretorId = (instancia as any)?.corretor_id ?? null
  return (candidatos ?? [])
    .filter((l: any) => !corretorId || !l.corretor_id || l.corretor_id === corretorId)
    .find((l: any) => normalizePhone(l.telefone) === normalizePhone(telefone)) ?? null
}

// Resumo da conversa IA gravado nas OBSERVAÇÕES do lead (mantém trilha da primeira
// linha/ações). Chamado quando a conversa pausa (limite, inatividade, virada manual).
async function registrarResumoConversa(convId: string, leadId: string | undefined, motivo: string): Promise<void> {
  if (!convId || !leadId) return
  try {
    const { data: history } = await db().from("messages_ia").select("role,content").eq("conversation_id", convId).order("created_at", { ascending: true }).limit(30)
    if (!history?.length) return
    const trecho = history.slice(0, 14).map((m: any) => `${m.role === "ai" ? "IA" : "Lead"}: ${String(m.content).slice(0, 160)}`).join(" | ")
    const linha = `[Atendimento IA] ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} — ${motivo}. ${trecho}`
    const { data: lead } = await db().from("leads").select("observacoes").eq("id", leadId).maybeSingle()
    const obs = (lead?.observacoes ?? "").trim()
    await db().from("leads").update({ observacoes: (obs ? `${obs}\n${linha}` : linha).slice(0, 6000) }).eq("id", leadId)
  } catch { /* best-effort */ }
}

// Move o lead na pipeline conforme a conversa (novo → em_atendimento) quando o lead
// responde e a conversa é assumida (IA ou manual). Guarda de ranking: só muda de novo.
async function moverLeadPipeline(leadId: string, para: string): Promise<void> {
  try {
    await db().from("leads").update({ status: para, atualizado_em: new Date().toISOString() }).eq("id", leadId).eq("status", "novo")
  } catch { /* best-effort */ }
}

// STOP automático: gestor/corretor enviou mensagem manualmente na instância. A conversa
// IA daquele contato é PAUSADA (ai_responding=false), leva o lead para em_atendimento e
// registra o resumo nas observações — o atendimento passa a ser manual.
export async function pausarIaMensagemManual({ telefone, instanceName, textoOutbound }: { telefone: string; instanceName?: string; textoOutbound?: string }): Promise<void> {
  try {
    const { data: agentes } = await db().from("ai_agents").select("id,name,config")
    const agente = (agentes ?? []).find((a: any) => getBoundInstances(a.config).includes(instanceName || ""))
    if (!telefone) return
    const lead = await acharLeadVinculado(telefone, instanceName)
    const key = lead?.id ?? telefone
    if (agente) {
      const { data: conv } = await db().from("conversations_ia").select("id,ai_responding").eq("ai_id", agente.id).eq("contact_id", key).maybeSingle()
      if (conv?.id) {
        // Eco da própria IA (o envio de uma resposta gera um evento fromMe na Evolution).
        // Se o texto que saiu é igual à última resposta da IA, NÃO é atendimento manual —
        // e não pode pausar a conversa nem mover o lead.
        if (textoOutbound) {
          try {
            const { data: ultima } = await db().from("messages_ia").select("content").eq("conversation_id", conv.id).eq("role", "ai").order("created_at", { ascending: false }).limit(1).maybeSingle()
            if (ultima && (ultima.content || "").trim() === (textoOutbound || "").trim()) return
          } catch { /* comparação é best-effort */ }
        }
        if (conv.ai_responding) await registrarResumoConversa(conv.id, lead?.id, "pausada — atendimento manual pelo corretor")
        await db().from("conversations_ia").update({ ai_responding: false }).eq("id", conv.id)
      }
    }
    if (lead) await moverLeadPipeline(lead.id, "em_atendimento")
    try {
      await db().from("automation_logs").insert({
        lead_id: lead?.id ?? null,
        event_type: "ia_pausada_mensagem_manual",
        event_title: "Atendimento manual iniciado — IA pausada",
        event_description: `Corretor enviou mensagem manual para ${telefone} (${instanceName || "instância"}). Conversa IA pausada e lead movido para em_atendimento.`,
        actor_type: "gestor",
      })
    } catch { /* best-effort */ }
  } catch { /* best-effort */ }
}

// Gera + registra + ENVIA a resposta da IA numa conversa já existente (com limite de
// mensagens, espera anti-robô, gravação no histórico, envio Evolution e auditoria).
// Usado pelo fluxo automático (handlePatriciaInbound) e pelo disparo manual ("Iniciar IA").
// O envio também joga a mensagem direto no Inbox (de_mim) para o gestor ver na hora,
// com deduplicação via key_id quando a Evolution ecoa o fromMe de volta.
async function responderConversaIa({ convId, AI_ID, agenteNome, rules, leadIdEfetivo, telefone, instanceName, userMessage, inserirUsuario, ignorarLimite }: {
  convId: string; AI_ID: string; agenteNome: string; rules: AgentRules;
  leadIdEfetivo?: string; telefone: string; instanceName?: string;
  userMessage: string; inserirUsuario: boolean; ignorarLimite: boolean;
}): Promise<{ ok: boolean; erro?: string }> {
  try {
    if (!ignorarLimite && rules.style.maxMessages > 0) {
      const { count } = await db().from("messages_ia").select("id", { count: "exact", head: true }).eq("conversation_id", convId).eq("role", "ai")
      if ((count ?? 0) >= rules.style.maxMessages) {
        await registrarResumoConversa(convId, leadIdEfetivo, `atingiu o limite de ${rules.style.maxMessages} mensagens da IA`)
        await db().from("conversations_ia").update({ ai_responding: false }).eq("id", convId)
        try {
          await db().from("automation_logs").insert({
            lead_id: leadIdEfetivo ?? null,
            event_type: "ia_limite_atingido",
            event_title: "Limite de mensagens da IA atingido",
            event_description: `Conversa ${convId} pausada após ${count} respostas da IA (máx. ${rules.style.maxMessages}).`,
            actor_type: "ia",
          })
        } catch { /* log é best-effort */ }
        return { ok: false, erro: "Limite de mensagens da IA atingido." }
      }
    }

    if (rules.style.waitMs > 0) await sleep(Math.min(rules.style.waitMs, 15000))

    const { data: history } = await db().from("messages_ia").select("role,content").eq("conversation_id", convId).order("created_at", { ascending: true }).limit(10)
    if (inserirUsuario) await db().from("messages_ia").insert({ id: `msg_${Date.now()}`, conversation_id: convId, role: "user", content: userMessage })

    const { message: aiResp } = await generateAIResponse({
      aiId: AI_ID,
      userMessage,
      conversationHistory: (history || []).map((m: any) => ({ role: m.role, content: m.content })),
      regrasSuplementares: regrasParaPrompt(rules, agenteNome || "assistente da Colucci Imóveis"),
    })
    await db().from("messages_ia").insert({ id: `msg_${Date.now() + 1}`, conversation_id: convId, role: "ai", content: aiResp })

    if (!instanceName) return { ok: false, erro: "Instância não informada." }
    const envRes = await sendWhatsAppText(instanceName, telefone, aiResp)

    // Reflete a resposta no Inbox imediatamente (o gestor vê na hora; o eco fromMe da
    // Evolution apenas confirma a entrega e NÃO duplica graças ao key_id).
    if (envRes.ok) {
      try {
        await db().from("whatsapp_mensagens").insert({
          instance_name: instanceName,
          telefone,
          nome_contato: null,
          corpo: aiResp,
          lead_id: leadIdEfetivo ?? null,
          de_mim: true,
          veio_de_anuncio: false,
          mensagem_id: envRes.keyId ?? null,
        })
      } catch { /* vitrine é best-effort */ }
    }

    try {
      await db().from("automation_logs").insert({
        lead_id: leadIdEfetivo || null,
        event_type: envRes.ok ? "ia_resposta_enviada" : "ia_envio_falhou",
        event_title: envRes.ok ? "IA respondeu no WhatsApp" : "Falha ao enviar resposta da IA",
        event_description: envRes.ok ? `IA respondeu via ${instanceName} para ${telefone}` : `Falha ao enviar resposta via WhatsApp para ${telefone}: ${envRes.erro}`,
        actor_type: "ia",
        payload: JSON.stringify({ ai_id: AI_ID, convId, instance: instanceName, key_id: envRes.keyId ?? null }).slice(0, 400),
      })
    } catch { /* log é best-effort */ }

    return envRes.ok ? { ok: true } : { ok: false, erro: envRes.erro }
  } catch (e: any) {
    console.error("[IA] erro responder", e)
    return { ok: false, erro: String(e?.message ?? e) }
  }
}

// Botão "Iniciar IA aqui"/"Retomar IA" do Inbox: reativa a conversa e dispara uma resposta
// IMEDIATA para a última mensagem do lead — diferente do fluxo automático, que só responde
// quando chega mensagem nova.
export async function dispararRespostaIA({ telefone, instanceName }: { telefone: string; instanceName?: string }): Promise<{ ok: boolean; erro?: string }> {
  try {
    const agente = await agenteParaInstancia(instanceName)
    if (!agente) return { ok: false, erro: "Nenhum agente IA ativo está vinculado a esta instância do WhatsApp." }
    const AI_ID = agente.id as string
    const rules = getRules(agente.config, agente)
    const lead = await acharLeadVinculado(telefone, instanceName)
    const key = lead?.id ?? telefone
    const { data: conv } = await db().from("conversations_ia").select("id,ai_responding").eq("ai_id", AI_ID).eq("contact_id", key).maybeSingle()
    if (!conv?.id) return { ok: false, erro: "Este contato ainda não tem conversa IA registrada. Quando chegar a próxima mensagem, a IA responderá sozinha." }
    if (!conv.ai_responding) await db().from("conversations_ia").update({ ai_responding: true }).eq("id", conv.id)
    const { data: ultima } = await db().from("messages_ia").select("content").eq("conversation_id", conv.id).eq("role", "user").order("created_at", { ascending: false }).limit(1).maybeSingle()
    if (!ultima?.content) return { ok: false, erro: "Essa conversa ainda não tem mensagem do lead para responder." }
    return await responderConversaIa({
      convId: conv.id, AI_ID, agenteNome: agente.name, rules,
      leadIdEfetivo: lead?.id, telefone, instanceName,
      userMessage: ultima.content, inserirUsuario: false, ignorarLimite: true,
    })
  } catch (e: any) {
    return { ok: false, erro: String(e?.message ?? e) }
  }
}

export async function handlePatriciaInbound({ telefone, texto, leadId, instanceName }: { telefone: string; texto: string; leadId?: string; instanceName?: string }){
  try{
    // 1) REGRA DE OURO: instância vinculada a IA ativa + regras habilitadas
    const agente = await agenteParaInstancia(instanceName)
    if(!agente) return
    const AI_ID = agente.id as string
    const rules: AgentRules = getRules(agente.config, agente)
    const isTestNumber = rules.target.numeroTeste.includes(telefone)

    // 2) QUANDO: se houve horário configurado e fora do expediente, não responde agora
    if (!isTestNumber && !dentroDoHorario(rules)) return

    // 3) ONDE: canal habilitado
    if (rules.channels.length && !rules.channels.includes("whatsapp")) return

    // 4) QUEM: só responde para lead apto (origem + tags) ou número de teste.
    //    Mensagem orgânica/pessoal sem vínculo com lead permitido → NÃO responde.
    let lead: any = null
    if (leadId) {
      const { data: l } = await db().from("leads").select("id,origem,status,referencias,corretor_id").eq("id", leadId).maybeSingle()
      lead = l
    } else if (!isTestNumber) {
      lead = await acharLeadVinculado(telefone, instanceName)
    }
    if (!isTestNumber && !leadAptoParaResposta(rules, lead)) return
    // Status bloqueados configurados (ex.: perdido/escalated) — nunca responde
    if (lead && rules.target.statusBloqueados.map(normalize).includes(normalize(String(lead.status || "")))) return

    const leadIdEfetivo = lead?.id ?? undefined

    // Pipeline: lead respondeu e se qualifica → sai de "novo" e entra em atendimento.
    if (lead) await moverLeadPipeline(lead.id, "em_atendimento")

    // 5) Busca ou cria conversa IA para este contato
    let convId: string
    const key = leadIdEfetivo || telefone
    const { data: existing } = await db().from("conversations_ia").select("id,ai_responding,last_message_at").eq("ai_id", AI_ID).eq("contact_id", key).maybeSingle()
    if(existing?.id) convId = existing.id
    else {
      const { data: created } = await db().from("conversations_ia").insert({ id:`conv_${Date.now()}`, ai_id: AI_ID, contact_id: key, channel:"whatsapp", external_id: telefone, status:"active", ai_responding:true }).select("id").single()
      convId = created!.id
    }

    // Atendimento pausado pelo gestor: IA não responde
    if(existing?.ai_responding === false) return

    // 5b) Auto-pausa por inatividade: lead não respondeu há X min → pausa e libera p/ automação
    if (rules.coordination.pausarPorInatividade && rules.coordination.tempoInatividadeMin > 0 && existing?.last_message_at) {
      const ultimaMsg = new Date(existing.last_message_at).getTime()
      if (Date.now() - ultimaMsg > rules.coordination.tempoInatividadeMin * 60_000) {
        await registrarResumoConversa(convId, leadIdEfetivo, "pausada por inatividade do lead")
        await db().from("conversations_ia").update({ ai_responding: false }).eq("id", convId)
        return
      }
    }

    // 5c) Modo sugestão: não envia — só registra a sugestão para aprovação humana
    if (rules.style.responseMode === "sugestao") {
      try {
        await db().from("automation_logs").insert({
          lead_id: leadIdEfetivo ?? null,
          event_type: "ia_sugestao_resposta",
          event_title: "IA sugeriu resposta (modo sugestão)",
          event_description: `Sugestão para ${telefone} via ${instanceName}: "${texto.slice(0,80)}"`,
          actor_type: "ia",
        })
      } catch { /* best-effort */ }
      return
    }

    // 5d) Gera, registra e envia (com espera anti-robô, limite de mensagens e auditoria)
    await responderConversaIa({
      convId, AI_ID, agenteNome: agente.name, rules,
      leadIdEfetivo, telefone, instanceName,
      userMessage: texto, inserirUsuario: true, ignorarLimite: false,
    })
  }catch(e){
    console.error("[IA] erro inbox", e)
  }
}