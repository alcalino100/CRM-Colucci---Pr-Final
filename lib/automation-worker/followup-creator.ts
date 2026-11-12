// =============================================================================
// followup-creator.ts — Criação de Jobs da Régua de Follow-up (D+1, D+2, D+3)
// =============================================================================

import { wsupabase } from "@/lib/whatsapp/server"
import { calculateScheduledAt, getLastHumanInteraction, createLog } from "@/lib/automation-services"
import { TEMPLATE_D1, TEMPLATE_D2, TEMPLATE_D3 } from "./constants"
import { leadTemIAAtiva } from "./ia-coordination"

/**
 * Cria jobs da esteira de Follow-up D+1 (24h), D+2 (48h) e D+3 (72h):
 * Garante progressão sequencial sem pular etapas, com teto de 30 msgs/linha/dia
 * e cancelamento automático se o cliente responder ou houver interação humana.
 */
export async function criarJobsFollowup(
  automation: any,
  results: { created: number },
  skipIA: Set<string> | null
): Promise<void> {
  const agora = Date.now()
  const cutoff24h = new Date(agora - 24 * 3600_000).toISOString()
  const cutoff48h = new Date(agora - 48 * 3600_000).toISOString()
  const scheduledAt = calculateScheduledAt(automation.wait_config)

  // -------------------------------------------------------------------------
  // PASSO 3: Identificar leads que precisam de D+3 (receberam D+2 há >= 24h sem resposta)
  // -------------------------------------------------------------------------
  const { data: d2Jobs } = await wsupabase
    .from("automation_jobs")
    .select("id, lead_id, sent_at, metadata")
    .eq("automation_id", automation.id)
    .in("status", ["sent", "delivered", "read"])
    .is("responded_at", null)
    .lte("sent_at", cutoff24h)
    .limit(100)

  for (const d2 of d2Jobs ?? []) {
    const meta = (d2.metadata ?? {}) as Record<string, unknown>
    if (meta.step !== 2 && meta.followup_stage !== "D+2") continue

    // Verifica se já existe D+3 para este lead
    const { count: jaTemD3 } = await wsupabase
      .from("automation_jobs")
      .select("id", { count: "exact", head: true })
      .eq("automation_id", automation.id)
      .eq("lead_id", d2.lead_id)
      .eq("metadata->>step" as never, "3" as never)

    if ((jaTemD3 ?? 0) > 0) continue

    // Verifica se houve interação humana recente após o envio do D+2
    const ultima = await getLastHumanInteraction(d2.lead_id)
    if (ultima.timestamp && d2.sent_at && new Date(ultima.timestamp).getTime() > new Date(d2.sent_at).getTime()) {
      continue
    }

    const { data: lead } = await wsupabase
      .from("leads")
      .select("id, nome, status, corretor_id, arquivado_em, fechado_em")
      .eq("id", d2.lead_id)
      .maybeSingle()

    if (!lead || lead.fechado_em || lead.arquivado_em || lead.status === "perdido") continue

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
        step: 3,
        followup_stage: "D+3",
        template_id: TEMPLATE_D3,
        previous_job_id: d2.id,
      },
    })

    if (!insErr) {
      results.created++
      await createLog({
        automation_id: automation.id,
        lead_id: lead.id,
        event_type: "job_created",
        event_title: `Follow-up D+3 (Breakup) agendado: ${lead.nome}`,
        event_description: `Lead sem resposta após D+2 — agendado D+3 (Fechamento Educado) para ${new Date(scheduledAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
        new_status: "scheduled",
        payload: { step: 3, scheduled_at: scheduledAt },
      })
    }
  }

  // -------------------------------------------------------------------------
  // PASSO 2: Identificar leads que precisam de D+2 (receberam D+1 há >= 24h sem resposta)
  // -------------------------------------------------------------------------
  const { data: d1Jobs } = await wsupabase
    .from("automation_jobs")
    .select("id, lead_id, sent_at, metadata")
    .eq("automation_id", automation.id)
    .in("status", ["sent", "delivered", "read"])
    .is("responded_at", null)
    .lte("sent_at", cutoff24h)
    .limit(100)

  for (const d1 of d1Jobs ?? []) {
    const meta = (d1.metadata ?? {}) as Record<string, unknown>
    if (meta.step && meta.step !== 1) continue

    // Verifica se já existe D+2 para este lead
    const { count: jaTemD2 } = await wsupabase
      .from("automation_jobs")
      .select("id", { count: "exact", head: true })
      .eq("automation_id", automation.id)
      .eq("lead_id", d1.lead_id)
      .eq("metadata->>step" as never, "2" as never)

    if ((jaTemD2 ?? 0) > 0) continue

    // Verifica se houve interação humana recente após o envio do D+1
    const ultima = await getLastHumanInteraction(d1.lead_id)
    if (ultima.timestamp && d1.sent_at && new Date(ultima.timestamp).getTime() > new Date(d1.sent_at).getTime()) {
      continue
    }

    const { data: lead } = await wsupabase
      .from("leads")
      .select("id, nome, status, corretor_id, arquivado_em, fechado_em")
      .eq("id", d1.lead_id)
      .maybeSingle()

    if (!lead || lead.fechado_em || lead.arquivado_em || lead.status === "perdido") continue

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
        step: 2,
        followup_stage: "D+2",
        template_id: TEMPLATE_D2,
        previous_job_id: d1.id,
      },
    })

    if (!insErr) {
      results.created++
      await createLog({
        automation_id: automation.id,
        lead_id: lead.id,
        event_type: "job_created",
        event_title: `Follow-up D+2 agendado: ${lead.nome}`,
        event_description: `Lead sem resposta após D+1 — agendado D+2 (Novas Opções) para ${new Date(scheduledAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
        new_status: "scheduled",
        payload: { step: 2, scheduled_at: scheduledAt },
      })
    }
  }

  // -------------------------------------------------------------------------
  // PASSO 1: Identificar leads que precisam de D+1 (>= 24h de silêncio sem resposta)
  // Combina leads que vieram da automação-mãe E leads parados no funil
  // -------------------------------------------------------------------------
  const parentId: string | undefined = automation.trigger_config?.parent_automation_id
  let parentLeadIds: string[] = []
  if (parentId) {
    const { data: pj } = await wsupabase
      .from("automation_jobs")
      .select("lead_id")
      .eq("automation_id", parentId)
      .in("status", ["sent", "delivered", "read"])
      .is("responded_at", null)
      .lte("sent_at", cutoff24h)
      .limit(100)
    parentLeadIds = (pj ?? []).map((p) => p.lead_id)
  }

  // Leads gerais em atendimento/follow-up sem movimentação há >= 24h
  const { data: leadsParados } = await wsupabase
    .from("leads")
    .select("id")
    .in("status", ["novo", "em_atendimento", "em_followup", "atendimento_ia", "em_automacao"])
    .is("arquivado_em", null)
    .is("fechado_em", null)
    .lte("atualizado_em", cutoff24h)
    .order("atualizado_em", { ascending: true })
    .limit(100)

  const candidatorIds = Array.from(
    new Set([...parentLeadIds, ...(leadsParados ?? []).map((l) => l.id)])
  )

  for (const leadId of candidatorIds) {
    // Pula se já existir qualquer job desta automação de follow-up para o lead
    const { count: jaTemAlgumJob } = await wsupabase
      .from("automation_jobs")
      .select("id", { count: "exact", head: true })
      .eq("automation_id", automation.id)
      .eq("lead_id", leadId)

    if ((jaTemAlgumJob ?? 0) > 0) continue

    const { data: lead } = await wsupabase
      .from("leads")
      .select("id, nome, status, origem, corretor_id, arquivado_em, fechado_em, telefone")
      .eq("id", leadId)
      .maybeSingle()

    if (!lead || lead.fechado_em || lead.arquivado_em || lead.status === "perdido") continue
    if (!lead.telefone || lead.telefone.replace(/\D/g, "").length < 10) continue

    // Verifica se houve interação humana recente nas últimas 24h
    const ultima = await getLastHumanInteraction(lead.id)
    if (ultima.timestamp && new Date(ultima.timestamp).getTime() > agora - 24 * 3600_000) {
      continue
    }

    // Semáforo IA: pula se conversa IA estiver ativa
    if (leadTemIAAtiva(skipIA, lead)) {
      continue
    }

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
        step: 1,
        followup_stage: "D+1",
        template_id: TEMPLATE_D1,
      },
    })

    if (!insErr) {
      results.created++
      await wsupabase
        .from("leads")
        .update({ status: "em_followup" })
        .eq("id", lead.id)
        .in("status", ["novo", "em_atendimento"])

      await createLog({
        automation_id: automation.id,
        lead_id: lead.id,
        event_type: "job_created",
        event_title: `Follow-up D+1 agendado: ${lead.nome}`,
        event_description: `Lead sem resposta há mais de 24h — agendado D+1 (Continuidade) para ${new Date(scheduledAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
        new_status: "scheduled",
        payload: { step: 1, scheduled_at: scheduledAt },
      })
    }
  }

  // -------------------------------------------------------------------------
  // PASSO 4: Encerramento de leads que concluíram D+3 sem retorno após 48h
  // -------------------------------------------------------------------------
  const { data: d3Encerrar } = await wsupabase
    .from("automation_jobs")
    .select("id, lead_id, sent_at")
    .eq("automation_id", automation.id)
    .eq("metadata->>step" as never, "3" as never)
    .in("status", ["sent", "delivered", "read"])
    .is("responded_at", null)
    .lte("sent_at", cutoff48h)
    .limit(50)

  for (const fin of d3Encerrar ?? []) {
    try {
      const { data: leadAtual } = await wsupabase
        .from("leads")
        .select("id, observacoes, status")
        .eq("id", fin.lead_id)
        .maybeSingle()

      if (leadAtual && leadAtual.status === "em_followup") {
        const obs = `${leadAtual.observacoes ?? ""}\n[Follow-up] Régua completa D+1, D+2 e D+3 finalizada sem retorno do cliente.`.trim()
        await wsupabase
          .from("leads")
          .update({ status: "frio", observacoes: obs })
          .eq("id", fin.lead_id)

        await createLog({
          automation_id: automation.id,
          lead_id: fin.lead_id,
          event_type: "followup_regua_concluida",
          event_title: "Régua D+1, D+2, D+3 concluída sem resposta",
          event_description: "Lead recebeu todos os 3 follow-ups sem interação e foi movido para Frio.",
        })
      }
    } catch {
      /* best-effort */
    }
  }
}
