import { normalizePhone } from "@/lib/labels"
import { sendPresence, sendWhatsAppText } from "@/lib/whatsapp/server"
import {
  getBoundInstances,
  getRules,
  nomeApresentacao,
  regrasParaPrompt,
  sleep,
  type AgentRules,
} from "./rules"
import { consultarDisponibilidade, agendarOuRemarcar } from "./agenda-tools"
import { generateAIResponse } from "./generateResponse"
import { logger } from "@/lib/logger"
import {
  db,
  MANUAL_PIPELINE_INSTANCES,
  chaveConversa,
  registrarAnalytics,
  registrarResumoConversa,
} from "./inbox-common"
import { agenteParaInstancia, acharLeadVinculado } from "./inbox-resolution"
import {
  AGENDA_TOOLS,
  suplementoAgendaHoje,
  HISTORICO_LIMITE,
  metasAtivasParaPrompt,
} from "./inbox-agenda-prompt"

export interface ResponderConversaIaParams {
  convId: string
  AI_ID: string
  agenteNome: string
  rules: AgentRules
  leadIdEfetivo?: string
  telefone: string
  instanceName?: string
  userMessage: string
  inserirUsuario: boolean
  ignorarLimite: boolean
}

// Gera + registra + ENVIA a resposta da IA numa conversa já existente (com limite de
// mensagens, espera anti-robô, gravação no histórico, envio Evolution e auditoria).
// Usado pelo fluxo automático (handlePatriciaInbound) e pelo disparo manual ("Iniciar IA").
// O envio também joga a mensagem direto no Inbox (de_mim) para o gestor ver na hora,
// com deduplicação via key_id quando a Evolution ecoa o fromMe de volta.
export async function responderConversaIa({
  convId,
  AI_ID,
  agenteNome,
  rules,
  leadIdEfetivo,
  telefone,
  instanceName,
  userMessage,
  inserirUsuario,
  ignorarLimite,
}: ResponderConversaIaParams): Promise<{ ok: boolean; erro?: string }> {
  const t0 = Date.now()
  // Mensagem vazia (sticker/reaction sem texto): não aciona ciclo de IA.
  if (!userMessage.trim()) return { ok: false, erro: "Mensagem vazia, nada a responder." }

  // TRAVA ANTI-VAZAMENTO: o agente só envia pela instância vinculada ou para
  // número de teste registrado. Vale para TODOS os caminhos (automático, manual,
  // futuros) — sem exceção silenciosa: bloqueia com erro + log visível.
  try {
    const { data: agRow } = await db()
      .from("ai_agents")
      .select("config,is_active")
      .eq("id", AI_ID)
      .maybeSingle()
    const ag = agRow as { config?: unknown; is_active?: boolean } | null
    const agRules = getRules(ag?.config)
    const agAtivo = !!ag?.is_active && agRules.enable
    const vinculado = !!instanceName && getBoundInstances(ag?.config).includes(instanceName)
    const ehTeste = (agRules.target.numeroTeste || []).some(
      (n) => normalizePhone(String(n || "")) === normalizePhone(telefone)
    )
    if (!agAtivo || (!vinculado && !ehTeste)) {
      try {
        await db().from("automation_logs").insert({
          lead_id: leadIdEfetivo ?? null,
          event_type: "ia_envio_bloqueado_instancia",
          event_title: "Envio bloqueado: fora da instância vinculada",
          event_description: `Agente ${AI_ID} tentou enviar para ${telefone} via "${instanceName ?? "?"}": ${!agAtivo ? "agente inativo/desabilitado" : "instância não vinculada e não é número de teste"}.`,
          actor_type: "ia",
        })
      } catch {
        /* log é best-effort */
      }
      return {
        ok: false,
        erro: "Agente sem vínculo com esta instância (e não é número de teste). Envio bloqueado.",
      }
    }
  } catch (e) {
    return {
      ok: false,
      erro: `Falha na trava de instância: ${e instanceof Error ? e.message : String(e)}`,
    }
  }

  try {
    // 0) Registra a msg do lead primeiro: vale para todos os desfechos (resposta,
    //    escalação ou limite) — o gatilho sempre fica no histórico.
    if (inserirUsuario) {
      await db().from("messages_ia").insert({
        id: `msg_${Date.now()}`,
        conversation_id: convId,
        role: "user",
        content: userMessage,
      })
      try {
        await db()
          .from("conversations_ia")
          .update({ last_user_message_at: new Date().toISOString() })
          .eq("id", convId)
      } catch {
        /* coluna pode não existir em bancos antigos */
      }
    }

    const { data: historyDesc } = await db()
      .from("messages_ia")
      .select("role,content")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: false })
      .limit(HISTORICO_LIMITE)

    // Últimas N em ordem cronológica (antes era: primeiras N — a IA "esquecia" tudo).
    const historyFull = [...((historyDesc || []) as { role: string; content: string }[])].reverse()
    const history = historyFull

    // 1) Escalação por triggers configurados (keyword/sentimento/max_turns). Se ativar,
    // NÃO gera resposta — pausa a IA, move o lead e audita (handoff para humano).
    try {
      const { detectEscalation } = await import("./escalationDetector")
      const esc = await detectEscalation(
        AI_ID,
        userMessage,
        (historyFull || []).map((m) => ({ role: m.role, content: m.content })),
        { maxMessages: rules.style.maxMessages > 0 ? rules.style.maxMessages : 10 }
      )
      if (esc.shouldEscalate) {
        const { notificarEscalacao } = await import("./handoffNotifications")
        await notificarEscalacao({
          conversationId: convId,
          leadId: leadIdEfetivo,
          aiId: AI_ID,
          reason: esc.reason,
          triggerName: esc.triggerName,
          telefone,
          instanceName,
        })
        await registrarAnalytics({
          convId,
          aiId: AI_ID,
          ms: Date.now() - t0,
          tokens: 0,
          modelo: "",
          semEscalacao: false,
        })
        return { ok: true, erro: `Escalação: ${esc.reason}` }
      }
    } catch (e) {
      logger.error("[IA] erro escalation check", {
        error: e instanceof Error ? e.message : String(e),
      })
    }

    // 2) Trava de limite (sem trigger configurado): pausa com motivo registrado.
    if (!ignorarLimite && rules.style.maxMessages > 0) {
      const { count } = await db()
        .from("messages_ia")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", convId)
        .eq("role", "ai")
      if ((count ?? 0) >= rules.style.maxMessages) {
        const motivo = `Limite de ${rules.style.maxMessages} respostas da IA atingido`
        await registrarResumoConversa(
          convId,
          leadIdEfetivo,
          `atingiu o limite de ${rules.style.maxMessages} mensagens da IA`
        )
        try {
          await db()
            .from("conversations_ia")
            .update({ ai_responding: false, status: "escalated", escalation_reason: motivo })
            .eq("id", convId)
        } catch {
          await db().from("conversations_ia").update({ ai_responding: false }).eq("id", convId)
        }
        try {
          await db().from("automation_logs").insert({
            lead_id: leadIdEfetivo ?? null,
            event_type: "ia_limite_atingido",
            event_title: "Limite de mensagens da IA atingido",
            event_description: `Conversa ${convId} pausada após ${count} respostas da IA (máx. ${rules.style.maxMessages}).`,
            actor_type: "ia",
          })
        } catch {
          /* log é best-effort */
        }
        if (leadIdEfetivo) {
          const { finalizarParaHumano } = await import("./qualificacao")
          await finalizarParaHumano({
            leadId: leadIdEfetivo,
            convId,
            aiId: AI_ID,
            motivo: motivo,
            telefone,
            instanceName,
          })
        }
        await registrarAnalytics({
          convId,
          aiId: AI_ID,
          ms: Date.now() - t0,
          tokens: 0,
          modelo: "",
          semEscalacao: false,
        })
        return { ok: false, erro: "Limite de mensagens da IA atingido." }
      }
    }

    if (rules.style.waitMs > 0) await sleep(Math.min(rules.style.waitMs, 15000))
    // Velocidade percebida: "digitando..." antes de gerar (best-effort).
    if (instanceName) await sendPresence(instanceName, telefone).catch(() => {})
    const metas = await metasAtivasParaPrompt(AI_ID)
    const partesSuplemento = [regrasParaPrompt(rules, nomeApresentacao(agenteNome)), metas]
    // Agenda (opt-in por agente): tools + instrução de consulta antes de propor.
    const usarAgenda = rules.coordination.agendarVisitas && !!leadIdEfetivo
    if (usarAgenda) partesSuplemento.push(suplementoAgendaHoje())
    const suplemento = partesSuplemento.filter(Boolean).join("\n\n")

    const onToolUseAgenda = async (name: string, input: Record<string, unknown>): Promise<string> => {
      if (name === "consultar_disponibilidade") {
        const dias = Math.min(Math.max(Number(input.dias ?? 5) || 5, 1), 10)
        const disp = await consultarDisponibilidade(dias)
        if (!disp.length) return "Sem horários livres nos próximos dias úteis."
        return disp.map((d) => `${d.dia}: ${d.livres.join(", ")}`).join("\n")
      }
      if (name === "agendar_reuniao") {
        const r = await agendarOuRemarcar({
          leadId: leadIdEfetivo as string,
          data: String(input.data ?? ""),
          horario: String(input.horario ?? ""),
        })
        return r.ok
          ? `Visita ${r.acao} para ${String(input.data)} às ${String(input.horario)}. Etapa atualizada para visita agendada.`
          : `Falha ao agendar: ${r.erro}`
      }
      return `Ferramenta desconhecida: ${name}`
    }

    const { message: aiResp, tokensUsed, model } = await generateAIResponse({
      aiId: AI_ID,
      userMessage,
      conversationHistory: (history || []).map((m) => ({ role: m.role, content: m.content })),
      regrasSuplementares: suplemento,
      ...(usarAgenda ? { tools: AGENDA_TOOLS, onToolUse: onToolUseAgenda } : {}),
    })

    await db().from("messages_ia").insert({
      id: `msg_${Date.now() + 1}`,
      conversation_id: convId,
      role: "ai",
      content: aiResp,
    })

    if (!instanceName) return { ok: false, erro: "Instância não informada." }
    const envRes = await sendWhatsAppText(instanceName, telefone, aiResp)

    // Degrau da pipeline: IA enviou = IA assumiu. Lead em novo/em_atendimento
    // vai para atendimento_ia (dono agora é a IA; gestor vê, corretor não).
    // Exceção: instâncias 100% manuais (ex.: Brayon) — nunca move sozinho.
    if (envRes.ok && leadIdEfetivo && !MANUAL_PIPELINE_INSTANCES.has(instanceName || "")) {
      try {
        const { data: movidos } = await db()
          .from("leads")
          .update({ status: "atendimento_ia", atualizado_em: new Date().toISOString() })
          .eq("id", leadIdEfetivo)
          .in("status", ["novo", "em_atendimento"])
          .select("id")
        if (((movidos ?? []) as unknown[]).length) {
          await db().from("automation_logs").insert({
            lead_id: leadIdEfetivo,
            event_type: "ia_assumiu_atendimento",
            event_title: "IA assumiu — foi para Atendimento IA",
            event_description: "Conversa assumida pela IA após resposta enviada.",
            actor_type: "ia",
          })
        }
      } catch {
        /* best-effort */
      }
    }

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
      } catch {
        /* vitrine é best-effort */
      }
    }

    try {
      await db().from("automation_logs").insert({
        lead_id: leadIdEfetivo || null,
        event_type: envRes.ok ? "ia_resposta_enviada" : "ia_envio_falhou",
        event_title: envRes.ok ? "IA respondeu no WhatsApp" : "Falha ao enviar resposta da IA",
        event_description: envRes.ok
          ? `IA respondeu via ${instanceName} para ${telefone}`
          : `Falha ao enviar resposta via WhatsApp para ${telefone}: ${envRes.erro}`,
        actor_type: "ia",
        payload: JSON.stringify({
          ai_id: AI_ID,
          convId,
          instance: instanceName,
          key_id: envRes.keyId ?? null,
        }).slice(0, 400),
      })
    } catch {
      /* log é best-effort */
    }

    // Espelho da conversa + handoff prometido: a cada resposta enviada, duplica o
    // turno nas observações do lead ([IA ...] Lead:/IA:) para controle total.
    // Se a IA prometeu consultor ("um consultor vai continuar"), move o lead para
    // Aguardando Atendimento + avisa o responsável. Sem isso a promessa vira
    // mentira e o lead apodrece na etapa.
    if (envRes.ok && leadIdEfetivo) {
      try {
        const { pareceHandoffHumano, finalizarParaHumano, espelharTurnoObs } = await import(
          "./qualificacao"
        )
        await espelharTurnoObs(leadIdEfetivo, userMessage, aiResp)
        if (pareceHandoffHumano(aiResp)) {
          await finalizarParaHumano({
            leadId: leadIdEfetivo,
            convId,
            aiId: AI_ID,
            motivo: "IA concluiu e transferiu para consultor",
            telefone,
            instanceName,
          })
        }
      } catch {
        /* espelho/handoff é best-effort */
      }
    }

    await registrarAnalytics({
      convId,
      aiId: AI_ID,
      ms: Date.now() - t0,
      tokens: tokensUsed ?? 0,
      modelo: model ?? "",
      semEscalacao: true,
    })
    return envRes.ok ? { ok: true } : { ok: false, erro: envRes.erro }
  } catch (e: unknown) {
    logger.error("[IA] erro responder conversa", {
      error: e instanceof Error ? e.message : String(e),
    })
    try {
      await db().from("automation_logs").insert({
        lead_id: leadIdEfetivo ?? null,
        event_type: "ia_geracao_falhou",
        event_title: "Falha na geração/resposta da IA",
        event_description: `Conversa ${convId} (${telefone}${instanceName ? ` via ${instanceName}` : ""}): ${String((e as Error)?.message ?? e).slice(0, 500)}`,
        actor_type: "ia",
      })
    } catch {
      /* log é best-effort */
    }
    return { ok: false, erro: String((e as Error)?.message ?? e) }
  }
}

// Botão "Iniciar IA aqui"/"Retomar IA" do Inbox: reativa a conversa e dispara uma resposta
// IMEDIATA para a última mensagem do lead — diferente do fluxo automático, que só responde
// quando chega mensagem nova.
export async function dispararRespostaIA({
  telefone,
  instanceName,
}: {
  telefone: string
  instanceName?: string
}): Promise<{ ok: boolean; erro?: string }> {
  try {
    const agente = await agenteParaInstancia(instanceName)
    if (!agente) {
      return {
        ok: false,
        erro: "Nenhum agente IA ativo está vinculado a esta instância do WhatsApp.",
      }
    }
    const AI_ID = agente.id as string
    const rules = getRules(agente.config, agente)
    const lead = await acharLeadVinculado(telefone, instanceName)
    const key = chaveConversa(lead?.id, telefone)
    const { data: conv } = await db()
      .from("conversations_ia")
      .select("id,ai_responding")
      .eq("ai_id", AI_ID)
      .eq("contact_id", key)
      .maybeSingle()
    if (!conv?.id) {
      return {
        ok: false,
        erro: "Este contato ainda não tem conversa IA registrada. Quando chegar a próxima mensagem, a IA responderá sozinha.",
      }
    }
    if (!conv.ai_responding) {
      await db().from("conversations_ia").update({ ai_responding: true }).eq("id", conv.id)
    }
    const { data: ultima } = await db()
      .from("messages_ia")
      .select("content")
      .eq("conversation_id", conv.id)
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!ultima?.content) {
      return { ok: false, erro: "Essa conversa ainda não tem mensagem do lead para responder." }
    }
    return await responderConversaIa({
      convId: conv.id,
      AI_ID,
      agenteNome: agente.name,
      rules,
      leadIdEfetivo: lead?.id,
      telefone,
      instanceName,
      userMessage: ultima.content,
      inserirUsuario: false,
      ignorarLimite: true,
    })
  } catch (e: unknown) {
    return { ok: false, erro: String((e as Error)?.message ?? e) }
  }
}
