// =============================================================================
// contencao-creator.ts — Criação de Jobs do Plano de Contenção IA
// =============================================================================

import { wsupabase } from "@/lib/whatsapp/server"
import { calculateScheduledAt, getLastHumanInteraction, createLog } from "@/lib/automation-services"
import { TEMPLATE_CONTENCAO_IA } from "./constants"

/**
 * PLANO DE CONTENÇÃO IA: Resgate de leads parados em atendimento_ia para Follow-up
 */
export async function criarJobsContencaoIA(
  automation: any,
  results: { created: number }
): Promise<void> {
  const agora = Date.now()
  const scheduledAt = calculateScheduledAt(automation.wait_config)

  // 1. Busca leads com status 'atendimento_ia' que não estejam fechados ou arquivados
  const { data: leadsIA } = await wsupabase
    .from("leads")
    .select("id, nome, status, telefone, corretor_id, arquivado_em, fechado_em, atualizado_em")
    .eq("status", "atendimento_ia")
    .is("arquivado_em", null)
    .is("fechado_em", null)
    .order("atualizado_em", { ascending: true, nullsFirst: true })
    .limit(200)

  if (!leadsIA || leadsIA.length === 0) return

  for (const lead of leadsIA) {
    if (!lead.telefone || lead.telefone.replace(/\D/g, "").length < 10) continue

    // Evita duplicidade se já houver qualquer job desta automação de contenção
    const { count: jaTemJob } = await wsupabase
      .from("automation_jobs")
      .select("id", { count: "exact", head: true })
      .eq("automation_id", automation.id)
      .eq("lead_id", lead.id)

    if ((jaTemJob ?? 0) > 0) continue

    // Verifica se houve interação humana recente nas últimas 24h
    const ultimaHumana = await getLastHumanInteraction(lead.id)
    if (ultimaHumana.timestamp && new Date(ultimaHumana.timestamp).getTime() > agora - 24 * 3600_000) {
      continue
    }

    // Busca última mensagem de WhatsApp trocada com o lead
    const telDigits = lead.telefone.replace(/\D/g, "")
    const conds = [`lead_id.eq.${lead.id}`]
    if (telDigits) {
      conds.push(`telefone.ilike.%${telDigits.slice(-8)}%`)
    }

    const { data: ultimasMsgs } = await wsupabase
      .from("whatsapp_mensagens")
      .select("de_mim, criado_em, corpo")
      .or(conds.join(","))
      .order("criado_em", { ascending: false })
      .limit(1)

    const ultimaMsg = ultimasMsgs?.[0]

    if (ultimaMsg) {
      // Se a última mensagem partiu do LEAD (de_mim === false), o lead está esperando resposta!
      // NÃO enviamos "Notei que você não respondeu mais...", pois seria desconexo e anti-profissional.
      if (!ultimaMsg.de_mim) {
        continue
      }
      // Se a última mensagem foi enviada há menos de 24 horas, ainda está dentro da janela de respiro
      const tempoMsg = new Date(ultimaMsg.criado_em).getTime()
      if (agora - tempoMsg < 24 * 3600_000) {
        continue
      }
    } else {
      // Se não há mensagens gravadas, checa se atualizado_em tem menos de 24 horas
      const tempoLead = new Date(lead.atualizado_em || 0).getTime()
      if (tempoLead && agora - tempoLead < 24 * 3600_000) {
        continue
      }
    }

    // Cria o job de contenção e resgate para a fila
    const { error: insErr } = await wsupabase.from("automation_jobs").insert({
      automation_id: automation.id,
      lead_id: lead.id,
      assigned_agent_id: lead.corretor_id || null,
      supervisor_user_id: automation.supervisor_user_id,
      status: "scheduled",
      scheduled_at: scheduledAt,
      eligible_at: new Date().toISOString(),
      max_attempts: 1,
      metadata: {
        tipo: "contencao_ia",
        followup_stage: "contencao_ia",
        template_id: TEMPLATE_CONTENCAO_IA,
        motivo: "Lead parado em Atendimento IA sem resposta há +24h",
      },
    })

    if (!insErr) {
      results.created++
      await createLog({
        automation_id: automation.id,
        lead_id: lead.id,
        event_type: "job_created",
        event_title: `Contenção IA agendada: ${lead.nome}`,
        event_description: `Lead sem resposta em Atendimento IA há +24h — agendado resgate para Follow-up em ${new Date(scheduledAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
        new_status: "scheduled",
        payload: { tipo: "contencao_ia", scheduled_at: scheduledAt },
      })
    }
  }
}
