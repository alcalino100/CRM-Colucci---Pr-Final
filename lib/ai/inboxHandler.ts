import { normalizePhone } from "@/lib/labels"
import {
  dentroDoHorario,
  getBoundInstances,
  getRules,
  leadAptoParaResposta,
  nomeApresentacao,
  regrasParaPrompt,
  sleep,
  type AgentRules,
} from "./rules"
import { generateAIResponse } from "./generateResponse"
import { logger } from "@/lib/logger"
import {
  db,
  MANUAL_PIPELINE_INSTANCES,
  chaveConversa,
  juntarRajada,
  logIaDiagnostico,
  moverLeadPipeline,
  normalize,
  registrarResumoConversa,
} from "./inbox-common"
import {
  agenteParaInstancia,
  agenteParaNumeroTeste,
  isNumeroTesteIA,
  acharLeadVinculado,
} from "./inbox-resolution"
import { responderConversaIa, dispararRespostaIA } from "./inbox-responder"
import { saudarLeadCTWA } from "./inbox-saudacao"
import { pausarIaMensagemManual } from "./inbox-pause"

// Re-exports para manter compatibilidade com todos os importadores existentes
export {
  chaveConversa,
  juntarRajada,
  agenteParaInstancia,
  agenteParaNumeroTeste,
  isNumeroTesteIA,
  dispararRespostaIA,
  saudarLeadCTWA,
  pausarIaMensagemManual,
}

// Janela de debounce: rajadas (textos + áudios + fotos seguidos) viram 1 resposta.
// Também dá o atraso humano natural (~2,5s + processamento). Tem que caber no
// orçamento da função (Vercel maxDuration) — 5s estourava junto com mídia+Claude.
const DEBOUNCE_MS = 2500

export async function handlePatriciaInbound({
  telefone,
  texto,
  leadId,
  instanceName,
  mensagemId,
}: {
  telefone: string
  texto: string
  leadId?: string
  instanceName?: string
  mensagemId?: string
}) {
  try {
    // 1) REGRA DE OURO: instância vinculada a IA ativa + regras habilitadas.
    //    Fallback de TESTE: se a instância não tem agente mas o remetente é número
    //    de teste registrado em algum agente ativo, esse agente assume (somente
    //    teste — lead real nunca entra por aqui). Tudo auditado abaixo.
    let agente = await agenteParaInstancia(instanceName)
    let viaFallbackTeste = false
    if (!agente) {
      agente = await agenteParaNumeroTeste(telefone)
      viaFallbackTeste = !!agente
    }
    if (!agente) return
    const AI_ID = agente.id as string
    const rules: AgentRules = getRules(agente.config, agente)
    // Match normalizado: "18991502791" bate com "5518991502791" e vice-versa.
    const isTestNumber = (rules.target.numeroTeste || []).some(
      (n) => normalizePhone(String(n || "")) === normalizePhone(telefone)
    )
    const emEstagioAutomacao = (st: unknown) =>
      ["em_automacao", "atendimento_ia", "em_followup"].includes(normalize(String(st ?? "")))
    if (viaFallbackTeste) {
      await logIaDiagnostico({
        telefone,
        instanceName,
        evento: "ia_teste_fora_da_instancia",
        titulo: "Teste atendido fora da instância vinculada",
        descricao: `Agente "${agente.name}" assumiu conversa na instância "${instanceName ?? "?"}" (vinculado a [${getBoundInstances(agente.config).join(", ") || "?"}]).`,
      })
    }

    // 2) QUANDO: se houve horário configurado e fora do expediente, não responde agora
    if (!isTestNumber && !dentroDoHorario(rules)) return

    // 3) ONDE: canal habilitado
    if (rules.channels.length && !rules.channels.includes("whatsapp")) {
      if (isTestNumber) {
        await logIaDiagnostico({
          telefone,
          instanceName,
          evento: "ia_teste_bloqueado",
          titulo: "Canal WhatsApp desabilitado — sem resposta",
          descricao: `Agente "${agente.name}" com canal WhatsApp desligado.`,
        })
      }
      return
    }

    // 4) QUEM: só responde para lead apto (origem + tags) ou número de teste.
    //    Mensagem orgânica/pessoal sem vínculo com lead permitido → NÃO responde.
    let lead: { id: string; origem?: string; status?: string; corretor_id?: string; referencias?: unknown } | null = null
    if (leadId) {
      const { data: l } = await db()
        .from("leads")
        .select("id,origem,status,referencias,corretor_id")
        .eq("id", leadId)
        .maybeSingle()
      lead = l as { id: string; origem?: string; status?: string; corretor_id?: string; referencias?: unknown } | null
    } else if (!isTestNumber) {
      lead = await acharLeadVinculado(telefone, instanceName)
    }
    if (!isTestNumber && !leadAptoParaResposta(rules, lead)) {
      if (lead && emEstagioAutomacao(lead.status)) {
        await logIaDiagnostico({
          telefone,
          instanceName,
          leadId: lead?.id,
          evento: "ia_teste_bloqueado",
          titulo: "Lead fora do alvo do agente — sem resposta",
          descricao: `Lead "${lead.id}" (origem ${String(lead.origem ?? "?")}, status ${String(lead.status ?? "?")}) não passou em origem/tags do agente "${agente.name}".`,
        })
      }
      return
    }
    // Status bloqueados configurados (ex.: perdido/escalated) — nunca responde
    if (
      lead &&
      rules.target.statusBloqueados.map(normalize).includes(normalize(String(lead.status || "")))
    ) {
      if (isTestNumber || emEstagioAutomacao(lead.status)) {
        await logIaDiagnostico({
          telefone,
          instanceName,
          leadId: lead?.id,
          evento: "ia_teste_bloqueado",
          titulo: "Status bloqueado — sem resposta",
          descricao: `Lead em "${String(lead.status)}" está em statusBloqueados do agente "${agente.name}".`,
        })
      }
      return
    }

    const leadIdEfetivo = lead?.id ?? undefined

    // Pipeline: lead respondeu e se qualifica → sai de "novo" e entra em atendimento.
    // Exceção: instâncias 100% manuais (ex.: Brayon) — nunca move sozinho.
    if (lead && !MANUAL_PIPELINE_INSTANCES.has(instanceName || "")) {
      await moverLeadPipeline(lead.id, "em_atendimento")
    }

    // 5) Busca ou cria conversa IA para este contato
    let convId: string
    const key = chaveConversa(leadIdEfetivo, telefone)
    const { data: existing } = await db()
      .from("conversations_ia")
      .select("id,ai_responding,last_message_at,last_user_message_at")
      .eq("ai_id", AI_ID)
      .eq("contact_id", key)
      .maybeSingle()
    if (existing?.id) convId = existing.id
    else {
      const base = {
        id: `conv_${Date.now()}`,
        ai_id: AI_ID,
        contact_id: key,
        channel: "whatsapp",
        external_id: telefone,
        status: "active",
        ai_responding: true,
      }
      const agora = new Date().toISOString()
      const tentativa = await db()
        .from("conversations_ia")
        .insert({ ...base, last_message_at: agora, last_user_message_at: agora })
        .select("id")
        .single()
      if (
        tentativa.error &&
        String(tentativa.error.message || "").includes("last_user_message_at")
      ) {
        const { data: created } = await db()
          .from("conversations_ia")
          .insert({ ...base, last_message_at: agora })
          .select("id")
          .single()
        convId = created!.id
      } else {
        if (tentativa.error) throw tentativa.error
        convId = tentativa.data!.id
      }
    }

    // Atendimento pausado pelo gestor/corretor (mensagem manual pausa a IA): não responde.
    // Visível no log para teste/automação — o "mudo" mais comum; resolve com "Retomar IA".
    if (existing?.ai_responding === false) {
      if (isTestNumber || emEstagioAutomacao(lead?.status)) {
        await logIaDiagnostico({
          telefone,
          instanceName,
          leadId: leadIdEfetivo,
          evento: "ia_teste_bloqueado",
          titulo: "IA pausada — sem resposta",
          descricao: `Conversa ${convId} com ai_responding=false (pausada por atendimento manual). Use "Retomar IA" no Inbox para a IA voltar a responder.`,
        })
      }
      return
    }

    // 5b) Auto-pausa por inatividade: conta a partir da última mensagem DO LEAD
    // (last_user_message_at) — não de qualquer evento da conversa. Sem essa ref
    // (conversas antigas), não pausa para não matar conversas válidas.
    if (
      rules.coordination.pausarPorInatividade &&
      rules.coordination.tempoInatividadeMin > 0 &&
      existing?.last_user_message_at
    ) {
      const ultimaMsg = new Date(existing.last_user_message_at).getTime()
      if (Date.now() - ultimaMsg > rules.coordination.tempoInatividadeMin * 60_000) {
        await registrarResumoConversa(convId, leadIdEfetivo, "pausada por inatividade do lead")
        await db().from("conversations_ia").update({ ai_responding: false }).eq("id", convId)
        if (isTestNumber || emEstagioAutomacao(lead?.status)) {
          await logIaDiagnostico({
            telefone,
            instanceName,
            leadId: leadIdEfetivo,
            evento: "ia_teste_bloqueado",
            titulo: "IA pausada por inatividade — sem resposta",
            descricao: `Conversa ${convId} pausada: lead há mais de ${rules.coordination.tempoInatividadeMin}min sem escrever.`,
          })
        }
        return
      }
    }

    // 5c) Modo sugestão: gera a resposta mas NÃO envia — registra o texto completo
    // para aprovação humana no Inbox ([Enviar] [Descartar]).
    if (rules.style.responseMode === "sugestao") {
      try {
        const { data: histSug } = await db()
          .from("messages_ia")
          .select("role,content")
          .eq("conversation_id", convId)
          .order("created_at", { ascending: true })
          .limit(10)
        const { message: sugestao } = await generateAIResponse({
          aiId: AI_ID,
          userMessage: texto,
          conversationHistory: ((histSug || []) as { role: string; content: string }[]).map(
            (m) => ({ role: m.role, content: m.content })
          ),
          regrasSuplementares: regrasParaPrompt(rules, nomeApresentacao(agente.name)),
        })
        await db().from("automation_logs").insert({
          lead_id: leadIdEfetivo ?? null,
          event_type: "ia_sugestao_resposta",
          event_title: "IA sugeriu resposta (modo sugestão)",
          event_description: `Sugestão para ${telefone} via ${instanceName}: "${sugestao.slice(0, 80)}"`,
          actor_type: "ia",
          payload: JSON.stringify({ convId, telefone, instance: instanceName, sugestao }).slice(
            0,
            2000
          ),
        })
      } catch {
        /* best-effort */
      }
      return
    }

    // 5d) Debounce + rajada (só no fluxo automático com mensagem identificada):
    // espera a sequência, e se chegar mensagem mais nova, esta instância sai —
    // a mais nova assume e junta TUDO num bloco único (uma resposta só).
    let textoEfetivo = texto
    if (mensagemId && instanceName) {
      await sleep(DEBOUNCE_MS)
      const buscarUltima = async () =>
        (
          await db()
            .from("whatsapp_mensagens")
            .select("mensagem_id,criado_em")
            .eq("instance_name", instanceName)
            .eq("telefone", telefone)
            .eq("de_mim", false)
            .order("criado_em", { ascending: false })
            .limit(1)
        ).data?.[0] as { mensagem_id: string; criado_em: string } | undefined

      // refTs = momento REAL da mensagem no WhatsApp (criado_em gravado), NÃO o
      // horário em que o webhook terminou de processar a mídia. Sem isso, a espera
      // da própria invocação (download+transcrição ~6s) tornava o gate inócuo e os
      // dois handlers seguiam em paralelo, duplicando o ciclo.
      let refPropriaMs: number | undefined
      try {
        const res = await db()
          .from("whatsapp_mensagens")
          .select("criado_em")
          .eq("instance_name", instanceName)
          .eq("telefone", telefone)
          .eq("mensagem_id", mensagemId)
          .maybeSingle()
        refPropriaMs = res?.data?.criado_em ? new Date(res.data.criado_em).getTime() : undefined
      } catch {
        /* sem a própria → fallback abaixo */
      }
      const refTs = refPropriaMs ?? Date.now() - 9000
      const u1 = await buscarUltima().catch(() => undefined)
      if (u1 && u1.mensagem_id !== mensagemId && new Date(u1.criado_em).getTime() > refTs) return
      await sleep(400)
      const u2 = await buscarUltima().catch(() => undefined)
      if (u2 && u2.mensagem_id !== mensagemId && new Date(u2.criado_em).getTime() > refTs) return
      try {
        const { data: ultimaIA } = await db()
          .from("messages_ia")
          .select("created_at")
          .eq("conversation_id", convId)
          .eq("role", "ai")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        const desde =
          (ultimaIA as { created_at?: string } | null)?.created_at ??
          new Date(Date.now() - 60000).toISOString()
        const { data: rajada } = await db()
          .from("whatsapp_mensagens")
          .select("corpo,criado_em")
          .eq("instance_name", instanceName)
          .eq("telefone", telefone)
          .eq("de_mim", false)
          .gt("criado_em", desde)
          .order("criado_em", { ascending: true })
          .limit(10)
        const bloco = juntarRajada(((rajada ?? []) as { corpo: string }[]).map((r) => r.corpo))
        if (bloco) textoEfetivo = bloco
        else {
          // Rajada vazia (ex.: áudio que não transcreveu e sem legenda): sem
          // texto não há o que responder — mas registra, nunca silêncio total.
          try {
            await db().from("automation_logs").insert({
              lead_id: leadIdEfetivo ?? null,
              event_type: "ia_ciclo_rejeitado",
              event_title: "Ciclo IA sem resposta",
              event_description: `Conversa ${convId} (${telefone}): nada aproveitável na rajada (mídia sem transcrição/legenda?).`,
              actor_type: "ia",
            })
          } catch {
            /* log é best-effort */
          }
          return
        }
      } catch (e) {
        logger.error("[IA] erro rajada, segue com texto único", {
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }

    // 5e) Gera, registra e envia (com espera anti-robô, limite de mensagens e auditoria)
    const resultado = await responderConversaIa({
      convId,
      AI_ID,
      agenteNome: agente.name,
      rules,
      leadIdEfetivo,
      telefone,
      instanceName,
      userMessage: textoEfetivo,
      inserirUsuario: true,
      ignorarLimite: false,
    })
    try {
      await db().from("automation_logs").insert({
        lead_id: leadIdEfetivo ?? null,
        event_type: resultado?.ok ? "ia_ciclo_finalizado" : "ia_ciclo_rejeitado",
        event_title: resultado?.ok ? "Ciclo IA concluído" : "Ciclo IA sem resposta",
        event_description: `Conversa ${convId} (${telefone}): ${resultado?.ok ? "resposta enviada" : resultado?.erro || "sem resposta"}. Entrada: ${textoEfetivo.slice(0, 80)}`,
        actor_type: "ia",
      })
    } catch {
      /* log é best-effort */
    }
  } catch (e) {
    logger.error("[IA] erro inbox handler inbound", {
      error: e instanceof Error ? e.message : String(e),
    })
    try {
      await db().from("automation_logs").insert({
        event_type: "ia_erro_fluxo",
        event_title: "Erro no fluxo de conversa IA",
        event_description: `Handle inbound (${telefone}${instanceName ? ` via ${instanceName}` : ""}): ${String(e instanceof Error ? e.message : e).slice(0, 500)}`,
        actor_type: "ia",
      })
    } catch {
      /* log é best-effort */
    }
  }
}
