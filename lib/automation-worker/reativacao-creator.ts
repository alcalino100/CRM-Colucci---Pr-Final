// =============================================================================
// reativacao-creator.ts — Avaliação e Criação de Jobs de Reativação de Leads
// =============================================================================

import { wsupabase } from "@/lib/whatsapp/server"
import {
  evaluateConditions,
  isWithinAllowedSchedule,
  calculateScheduledAt,
  hasActiveJob,
  getLastHumanInteraction,
  createLog,
} from "@/lib/automation-services"
import type { RejectionBreakdown, WorkerResults } from "./constants"
import { leadTemIAAtiva, tagsDoLead } from "./ia-coordination"

/**
 * Roleta determinística por lead: quando a automação lista N conexões em
 * trigger_config.connection_ids, cada lead usa SEMPRE a mesma linha (hash do id).
 */
export function escolherConexaoAutomacao(automation: any, lead: { id: string }): string | null {
  const lista = automation?.trigger_config?.connection_ids
  if (Array.isArray(lista) && lista.length > 1 && lead?.id) {
    const s = String(lead.id)
    let h = 0
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
    return lista[h % lista.length] ?? null
  }
  return automation?.whatsapp_connection_id ?? null
}

export async function avaliarECriarJobsReativacao(
  automation: any,
  results: WorkerResults,
  rejections: RejectionBreakdown,
  rejectionDetails: { lead_id: string; lead_nome: string; reason: string }[],
  skipIA: Set<string> | null,
  tagsFollowUp: Set<string>
): Promise<void> {
  const META_MINIMA_LINHA = 20
  const LIMITE_AVALIACAO = 600
  const TAM_PAGINA = 150

  const listaConexoes: string[] =
    Array.isArray(automation?.trigger_config?.connection_ids) &&
    automation.trigger_config.connection_ids.length > 1
      ? (automation.trigger_config.connection_ids as string[])
      : automation?.whatsapp_connection_id
      ? [automation.whatsapp_connection_id as string]
      : []

  const projetado = new Map<string, number>(listaConexoes.map((c) => [c, 0]))

  try {
    const fmtD = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    const [aB, mB, dB] = fmtD.format(new Date()).split("-").map(Number)
    const iniDia = new Date(Date.UTC(aB, mB - 1, dB, 3, 0, 0)).toISOString()
    const fimDia = new Date(Date.UTC(aB, mB - 1, dB + 1, 3, 0, 0)).toISOString()

    const { data: envHoje } = await wsupabase
      .from("automation_jobs")
      .select("metadata")
      .eq("automation_id", automation.id)
      .gte("sent_at", iniDia)
      .in("status", ["sent", "delivered", "read", "responded"])
      .limit(5000)

    for (const j of (envHoje ?? []) as { metadata?: Record<string, unknown> }[]) {
      const c = String(j.metadata?.["connection_id"] ?? automation.whatsapp_connection_id ?? "")
      if (c && projetado.has(c)) projetado.set(c, (projetado.get(c) ?? 0) + 1)
    }

    const { data: agHoje } = await wsupabase
      .from("automation_jobs")
      .select("lead_id")
      .eq("automation_id", automation.id)
      .in("status", ["scheduled", "retrying", "blocked_hour"])
      .lt("scheduled_at", fimDia)
      .limit(5000)

    for (const j of (agHoje ?? []) as { lead_id: string }[]) {
      const c = escolherConexaoAutomacao(automation, { id: j.lead_id })
      if (c && projetado.has(c)) projetado.set(c, (projetado.get(c) ?? 0) + 1)
    }
  } catch {
    /* projeção best-effort */
  }

  const metaBatida = () =>
    listaConexoes.length === 0 || listaConexoes.every((c) => (projetado.get(c) ?? 0) >= META_MINIMA_LINHA)

  let avaliadosFase = 0
  let pagina = 0

  while (true) {
    const { data: leadsPag, error: leadsErrPag } = await wsupabase
      .from("leads")
      .select(
        "id, nome, telefone, temperatura, status, origem, corretor_id, criado_em, gestor_responsavel, arquivado_em, fechado_em, referencias"
      )
      .in("status", ["em_atendimento", "em_automacao"])
      .is("arquivado_em", null)
      .is("fechado_em", null)
      .order("atualizado_em", { ascending: true, nullsFirst: false })
      .range(pagina * TAM_PAGINA, pagina * TAM_PAGINA + TAM_PAGINA - 1)

    if (leadsErrPag) {
      await createLog({
        automation_id: automation.id,
        event_type: "lead_not_eligible",
        event_title: "Erro ao buscar leads",
        event_description: leadsErrPag.message ?? "erro desconhecido",
      })
      break
    }

    if (!leadsPag || leadsPag.length === 0) {
      if (pagina === 0) {
        rejections.no_leads_found++
        await createLog({
          automation_id: automation.id,
          event_type: "lead_not_eligible",
          event_title: "Nenhum lead encontrado",
          event_description: "Nenhum lead com status=em_atendimento/em_automacao, não arquivado, não fechado",
        })
      }
      break
    }

    for (const lead of leadsPag) {
      results.evaluated++

      // Elegibilidade por origem OU tag de follow-up
      const temTagFollowUp =
        tagsFollowUp.size > 0 && tagsDoLead(lead.referencias).some((t) => tagsFollowUp.has(t))
      if (lead.origem !== "Tráfego Pago" && !temTagFollowUp) {
        continue
      }

      // 1. Verificar job ativo (idempotência)
      if (await hasActiveJob(lead.id, automation.id)) {
        rejections.has_active_job++
        rejectionDetails.push({ lead_id: lead.id, lead_nome: lead.nome, reason: "Job ativo já existe" })
        continue
      }

      // 1-b. Semáforo IA x Automação
      if (leadTemIAAtiva(skipIA, lead)) {
        rejections.ia_in_conversa++
        rejectionDetails.push({
          lead_id: lead.id,
          lead_nome: lead.nome,
          reason: "Conversa IA ativa (coordenado)",
        })
        await createLog({
          automation_id: automation.id,
          lead_id: lead.id,
          event_type: "lead_not_eligible",
          event_title: "Lead não elegível (IA ativa)",
          event_description: `${lead.nome} possui conversa IA ativa — automação coordenada com a IA`,
        })
        continue
      }

      // 2. Avaliar condições da automação
      const { eligible, failed_rules } = await evaluateConditions(
        lead.id,
        automation.conditions,
        automation.id
      )
      if (!eligible) {
        rejections.conditions_not_met++
        const reason = `Condições não atendidas: ${failed_rules.join(", ")}`
        rejectionDetails.push({ lead_id: lead.id, lead_nome: lead.nome, reason })
        await createLog({
          automation_id: automation.id,
          lead_id: lead.id,
          event_type: "lead_not_eligible",
          event_title: "Lead não elegível",
          event_description: reason,
          payload: { failed_rules, lead_nome: lead.nome },
        })
        continue
      }

      // 3. Verificar última interação humana
      const lastInteraction = await getLastHumanInteraction(lead.id)
      const waitMinutes = automation.wait_config.amount ?? 10
      if (lastInteraction.timestamp) {
        const diffMs = Date.now() - new Date(lastInteraction.timestamp).getTime()
        const diffMin = diffMs / 60000
        if (diffMin < waitMinutes) {
          rejections.human_interaction_recent++
          const reason = `Interação humana recente (${Math.round(diffMin)}min < ${waitMinutes}min required)`
          rejectionDetails.push({ lead_id: lead.id, lead_nome: lead.nome, reason })
          await createLog({
            automation_id: automation.id,
            lead_id: lead.id,
            event_type: "lead_not_eligible",
            event_title: "Interação humana recente",
            event_description: reason,
            payload: {
              last_interaction: lastInteraction.timestamp,
              wait_minutes: waitMinutes,
              diff_minutes: Math.round(diffMin),
            },
          })
          continue
        }
      }

      // 4. Verificar horário permitido
      if (!isWithinAllowedSchedule(automation.wait_config)) {
        const scheduledAt = calculateScheduledAt(automation.wait_config)
        const { error } = await wsupabase.from("automation_jobs").insert({
          automation_id: automation.id,
          lead_id: lead.id,
          status: "blocked_hour",
          scheduled_at: scheduledAt,
          last_human_interaction_at: lastInteraction.timestamp,
          eligible_at: new Date().toISOString(),
        })
        if (!error) {
          results.blocked_hour++
          results.created++
          await createLog({
            automation_id: automation.id,
            lead_id: lead.id,
            event_type: "lead_eligible",
            event_title: "Lead elegível — aguardando horário permitido",
            event_description: `Agendado para ${new Date(scheduledAt).toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            })}`,
            new_status: "blocked_hour",
            payload: { scheduled_at: scheduledAt },
          })
        } else {
          rejections.insert_error++
        }
        continue
      }

      // 5. Criar job
      const scheduledAt = calculateScheduledAt(automation.wait_config)
      const { error } = await wsupabase.from("automation_jobs").insert({
        automation_id: automation.id,
        lead_id: lead.id,
        assigned_agent_id: lead.corretor_id || null,
        supervisor_user_id: automation.supervisor_user_id,
        status: "scheduled",
        scheduled_at: scheduledAt,
        last_human_interaction_at: lastInteraction.timestamp,
        eligible_at: new Date().toISOString(),
        max_attempts: automation.limits_config.max_sends_per_lead ?? 3,
      })

      if (!error) {
        results.created++
        const linhaJob = escolherConexaoAutomacao(automation, lead)
        if (linhaJob && projetado.has(linhaJob)) {
          projetado.set(linhaJob, (projetado.get(linhaJob) ?? 0) + 1)
        }
        await createLog({
          automation_id: automation.id,
          lead_id: lead.id,
          event_type: "job_created",
          event_title: "Job criado na fila",
          event_description: `Lead: ${lead.nome} | Agendado: ${new Date(scheduledAt).toLocaleString(
            "pt-BR",
            { timeZone: "America/Sao_Paulo" }
          )}`,
          new_status: "scheduled",
          payload: { scheduled_at: scheduledAt, lead_nome: lead.nome },
        })
      } else if (
        String(error.message || "").includes("duplicate") ||
        String((error as { code?: string }).code || "") === "23505"
      ) {
        rejections.has_active_job++
      } else {
        rejections.insert_error++
        rejectionDetails.push({
          lead_id: lead.id,
          lead_nome: lead.nome,
          reason: `Erro ao criar job: ${error.message}`,
        })
        await createLog({
          automation_id: automation.id,
          lead_id: lead.id,
          event_type: "lead_not_eligible",
          event_title: "Erro ao criar job",
          event_description: error.message,
        })
      }
    }

    avaliadosFase += leadsPag.length
    if (leadsPag.length < TAM_PAGINA) break
    if (avaliadosFase >= LIMITE_AVALIACAO) break
    if (metaBatida()) break
    pagina++
  }

  // Shortfall log
  if (!metaBatida() && listaConexoes.length > 0) {
    await createLog({
      automation_id: automation.id,
      event_type: "fila_minima_shortfall",
      event_title: `Fila mínima não atingida (${META_MINIMA_LINHA}/linha)`,
      event_description: `Projetado hoje: ${listaConexoes
        .map((c) => `${c.slice(0, 8)}=${projetado.get(c) ?? 0}`)
        .join(", ")} | avaliados: ${avaliadosFase} | rejeições: IA=${
        rejections.ia_in_conversa
      } cond=${rejections.conditions_not_met} jobAtivo=${rejections.has_active_job} humanaRecente=${
        rejections.human_interaction_recent
      }`,
      payload: { projetado: Object.fromEntries(projetado), avaliados: avaliadosFase, meta: META_MINIMA_LINHA },
    })
  }

  // Log de resumo da automação
  await createLog({
    automation_id: automation.id,
    event_type: "lead_evaluated",
    event_title: `Automação "${automation.name}" — resumo da execução`,
    event_description: `Avaliados: ${results.evaluated} | Jobs criados: ${results.created} | Bloqueados (horário): ${results.blocked_hour}`,
    payload: { rejections },
  })
}
