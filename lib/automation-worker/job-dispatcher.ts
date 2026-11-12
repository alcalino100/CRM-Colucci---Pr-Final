// =============================================================================
// job-dispatcher.ts — Despachante de Envios com Controle Anti-Ban e Pacing
// =============================================================================

import { logger } from "@/lib/logger"
import { wsupabase } from "@/lib/whatsapp/server"
import {
  acquireLock,
  releaseLock,
  renderMessage,
  sendAutomationMessage,
  isWithinAllowedSchedule,
  getLastHumanInteraction,
  createLog,
  cancelJob,
  getJobsToProcess,
} from "@/lib/automation-services"
import type { AutomationJobStatus } from "@/lib/automation-types"
import {
  TEMPLATE_CONTENCAO_IA,
  AUTOMATION_CONTENCAO_IA_ID,
  MAX_ENVIOS_LINHA_DIA,
  MAX_ENVIOS_POR_RODADA,
  type WorkerResults,
} from "./constants"
import { escolherConexaoAutomacao } from "./reativacao-creator"
import { tagsDoLead } from "./ia-coordination"
import {
  filtrarJobsComInstanciasConectadas,
  aplicarSupervisaoGestor,
  contarEnviosHojePorLinha,
} from "./dispatcher-helpers"

const WORKER_ID = `worker-${Date.now()}`

export async function despacharJobsAgendados(
  automations: any[],
  results: WorkerResults,
  nomeImobiliaria: string,
  tagsFollowUp: Set<string>
): Promise<void> {
  const jobsBrutos = await getJobsToProcess()
  const jobsToProcess = await filtrarJobsComInstanciasConectadas(jobsBrutos, automations)
  let enviadosNestaRodada = 0

  for (const job of jobsToProcess) {
    const locked = await acquireLock(job.id, WORKER_ID)
    if (!locked) continue

    try {
      await wsupabase
        .from("automation_jobs")
        .update({ status: "processing", processing_started_at: new Date().toISOString() })
        .eq("id", job.id)

      const automation = automations.find((a) => a.id === job.automation_id)
      if (!automation) {
        await cancelJob(job.id, "Automação não encontrada", "system")
        results.cancelled++
        continue
      }

      const { data: lead } = await wsupabase
        .from("leads")
        .select(
          "id, nome, telefone, temperatura, status, origem, corretor_id, criado_em, gestor_responsavel, arquivado_em, fechado_em, referencias"
        )
        .eq("id", job.lead_id)
        .maybeSingle()

      if (!lead) {
        await cancelJob(job.id, "Lead não encontrado", "system")
        results.cancelled++
        continue
      }

      const isFollowup = automation.trigger_type === "no_response_followup"
      const isContencao =
        automation.trigger_type === "atendimento_ia_stalled" ||
        automation.id === AUTOMATION_CONTENCAO_IA_ID ||
        (job.metadata as Record<string, unknown> | null)?.["tipo"] === "contencao_ia" ||
        (job.metadata as Record<string, unknown> | null)?.["template_id"] === TEMPLATE_CONTENCAO_IA

      const validStatuses = isContencao
        ? ["atendimento_ia", "em_atendimento", "em_followup"]
        : isFollowup
        ? ["em_atendimento", "em_automacao", "em_followup"]
        : ["em_atendimento", "em_automacao"]

      const temTagFollowUp =
        tagsFollowUp.size > 0 && tagsDoLead(lead.referencias).some((t) => tagsFollowUp.has(t))
      const origemValida = isContencao || lead.origem === "Tráfego Pago" || temTagFollowUp

      if (
        !validStatuses.includes(lead.status) ||
        !origemValida ||
        lead.fechado_em ||
        lead.arquivado_em
      ) {
        await cancelJob(job.id, "Lead não atende mais às condições", "system")
        results.cancelled++
        continue
      }

      const lastInteraction = await getLastHumanInteraction(job.lead_id)
      if (lastInteraction.timestamp && job.scheduled_at) {
        const interactionTime = new Date(lastInteraction.timestamp).getTime()
        const scheduledTime = new Date(job.scheduled_at).getTime()
        if (interactionTime > scheduledTime) {
          await cancelJob(
            job.id,
            `Interação humana detectada (${lastInteraction.event ?? "ação do corretor"})`,
            "system"
          )
          results.cancelled++
          continue
        }
      }

      if (!isWithinAllowedSchedule(automation.wait_config)) {
        await wsupabase.from("automation_jobs").update({ status: "blocked_hour" }).eq("id", job.id)
        await releaseLock(job.id)
        continue
      }

      const targetTemplateId =
        ((job.metadata as Record<string, unknown> | null)?.["template_id"] as string | undefined) ||
        automation.message_template_id

      if (!targetTemplateId) {
        await cancelJob(job.id, "Template de mensagem não configurado", "system")
        results.cancelled++
        continue
      }

      const { data: template } = await wsupabase
        .from("automation_message_templates")
        .select("*")
        .eq("id", targetTemplateId)
        .maybeSingle()

      if (!template) {
        await cancelJob(job.id, `Template de mensagem ${targetTemplateId} não encontrado`, "system")
        results.cancelled++
        continue
      }

      let corretorNome = ""
      if (lead.corretor_id) {
        const { data: corretor } = await wsupabase
          .from("usuarios")
          .select("nome")
          .eq("id", lead.corretor_id)
          .maybeSingle()
        corretorNome = corretor?.nome ?? ""
      }

      const rendered = renderMessage(template.content, {
        lead: { nome: lead.nome, telefone: lead.telefone, origem: lead.origem ?? undefined },
        corretor: { nome: corretorNome },
        imobiliaria: nomeImobiliaria,
      })

      // Teto de segurança anti-banimento: MÁXIMO 30 msgs/linha/dia (em horário de Brasília)
      const fmtDia = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
      const [anoB, mesB, diaB] = fmtDia.format(new Date()).split("-").map(Number)
      const todayStartIso = new Date(Date.UTC(anoB, mesB - 1, diaB, 3, 0, 0)).toISOString()

      const listaConexoes: string[] =
        Array.isArray(automation?.trigger_config?.connection_ids) &&
        automation.trigger_config.connection_ids.length > 0
          ? (automation.trigger_config.connection_ids as string[])
          : automation?.whatsapp_connection_id
          ? [automation.whatsapp_connection_id as string]
          : []

      let connectionId: string | null = null

      // 1. Tenta a conexão preferencial do lead
      const pref = escolherConexaoAutomacao(automation, lead)
      if (pref) {
        const enviosPref = await contarEnviosHojePorLinha(pref, todayStartIso)
        if (enviosPref < MAX_ENVIOS_LINHA_DIA) {
          connectionId = pref
        }
      }

      // 2. Tenta linhas secundárias com cota disponível
      if (!connectionId && listaConexoes.length > 0) {
        for (const c of listaConexoes) {
          const enviosC = await contarEnviosHojePorLinha(c, todayStartIso)
          if (enviosC < MAX_ENVIOS_LINHA_DIA) {
            connectionId = c
            break
          }
        }
      }

      if (!connectionId) {
        await releaseLock(job.id)
        await createLog({
          automation_id: automation.id,
          job_id: job.id,
          event_type: "limite_linha_diario_atingido",
          event_title: `Teto de segurança anti-ban atingido (${MAX_ENVIOS_LINHA_DIA} msgs/linha)`,
          event_description: `Todas as linhas disponíveis atingiram o limite de ${MAX_ENVIOS_LINHA_DIA} mensagens hoje. Envio mantido na fila para amanhã a partir das 08:00.`,
        })
        continue
      }

      if (enviadosNestaRodada >= MAX_ENVIOS_POR_RODADA) {
        await releaseLock(job.id)
        continue
      }

      const result = await sendAutomationMessage({
        phone: lead.telefone,
        connection_id: connectionId,
        message_content: rendered,
        automation_id: automation.id,
        job_id: job.id,
        idempotency_key: `${automation.id}-${job.lead_id}-${Date.now()}`,
      })

      if (result.success) {
        const updateData: Record<string, unknown> = {
          status: "sent",
          sent_at: new Date().toISOString(),
          message_content_rendered: rendered,
          provider_message_id: result.provider_message_id,
          provider_response: result.raw_response,
          attempts: (job.attempts ?? 0) + 1,
          metadata: {
            ...((job.metadata as Record<string, unknown> | null) ?? {}),
            connection_id: connectionId,
          },
        }

        await aplicarSupervisaoGestor(automation, lead, job, isContencao, updateData)

        await wsupabase.from("lead_automation_settings").upsert(
          {
            lead_id: job.lead_id,
            last_automation_sent_at: new Date().toISOString(),
          },
          { onConflict: "lead_id" }
        )

        const { data: las } = await wsupabase
          .from("lead_automation_settings")
          .select("total_automation_messages_sent")
          .eq("lead_id", job.lead_id)
          .maybeSingle()
        if (las) {
          await wsupabase
            .from("lead_automation_settings")
            .update({
              total_automation_messages_sent: (las.total_automation_messages_sent ?? 0) + 1,
            })
            .eq("lead_id", job.lead_id)
        }

        await wsupabase.from("automation_jobs").update(updateData).eq("id", job.id)

        await createLog({
          automation_id: automation.id,
          job_id: job.id,
          lead_id: job.lead_id,
          event_type: "message_sent",
          event_title: "Mensagem enviada",
          event_description: rendered.slice(0, 200),
          previous_status: job.status as AutomationJobStatus,
          new_status: "sent",
          payload: { provider_message_id: result.provider_message_id },
        })

        results.sent++
        enviadosNestaRodada++

        // Respiro anti-ban humanizado entre envios (25 a 45 segundos simulando digitação real).
        await new Promise((r) => setTimeout(r, 25000 + Math.random() * 20000))

        // Reativação lead_inactive: move lead para Em Automação + tag
        if (
          automation.trigger_type === "lead_inactive" &&
          (lead as { status?: unknown }).status === "em_atendimento"
        ) {
          try {
            const { data: leadAtual } = await wsupabase
              .from("leads")
              .select("observacoes,referencias")
              .eq("id", job.lead_id)
              .maybeSingle()
            const base = (leadAtual ?? {}) as { observacoes?: unknown; referencias?: unknown }
            const refs = Array.isArray(base.referencias)
              ? [...(base.referencias as { ref: string }[])]
              : []
            if (
              !refs.some(
                (r) =>
                  String(typeof r === "string" ? r : (r as { ref?: unknown })?.ref ?? "").toLowerCase() ===
                  "automacao"
              )
            ) {
              refs.push({ ref: "automacao" })
            }
            const obsMove = `${String(base.observacoes ?? "").trim()}\n[Automação] Mensagem de reativação de base enviada — lead movido para "Em Automação" (frio). Se responder, a IA assume em "Atendimento IA".`
              .trim()
              .slice(-6000)
            await wsupabase
              .from("leads")
              .update({
                status: "em_automacao",
                temperatura: "frio",
                observacoes: obsMove,
                referencias: refs,
                atualizado_em: new Date().toISOString(),
              })
              .eq("id", job.lead_id)
              .eq("status", "em_atendimento")

            await createLog({
              automation_id: automation.id,
              job_id: job.id,
              lead_id: job.lead_id,
              event_type: "lead_moved_automacao",
              event_title: "Lead movido para Em Automação",
              event_description: `${lead.nome} saiu de em_atendimento e entrou em "Em Automação" após o envio da reativação.`,
            })
          } catch {
            /* best-effort */
          }
        }

        // Contenção IA: libera semáforo e transfere para Follow-up
        if (isContencao) {
          try {
            const telDigits = (lead.telefone || "").replace(/\D/g, "")
            const conds = [`contact_id.eq.${job.lead_id}`]
            if (telDigits) {
              conds.push(`external_id.eq.${telDigits}`)
              if (telDigits.startsWith("55")) conds.push(`external_id.eq.${telDigits.slice(2)}`)
              else conds.push(`external_id.eq.55${telDigits}`)
            }
            await wsupabase
              .from("conversations_ia")
              .update({ ai_responding: false })
              .or(conds.join(","))

            const { data: leadAtual } = await wsupabase
              .from("leads")
              .select("observacoes")
              .eq("id", job.lead_id)
              .maybeSingle()
            const baseObs = leadAtual?.observacoes ? `${leadAtual.observacoes}\n` : ""
            const obsResgate = `${baseObs}[Contenção IA] Mensagem de resgate enviada ("Notei que você não respondeu mais..."). Lead transferido de Atendimento IA para Follow-up.`.trim()

            await wsupabase
              .from("leads")
              .update({
                status: "em_followup",
                observacoes: obsResgate,
                atualizado_em: new Date().toISOString(),
              })
              .eq("id", job.lead_id)

            await createLog({
              automation_id: automation.id,
              job_id: job.id,
              lead_id: job.lead_id,
              event_type: "lead_resgatado_atendimento_ia",
              event_title: "Lead resgatado de Atendimento IA → Follow-up",
              event_description: `${lead.nome} recebeu mensagem de contenção e foi transferido de Atendimento IA para Follow-up.`,
              new_status: "sent",
              payload: { lead_novo_status: "em_followup" },
            })
          } catch (errContencao) {
            logger.error("Erro pós-envio contenção IA", { error: errContencao })
          }
        }
      } else {
        const attempts = (job.attempts ?? 0) + 1
        const maxAttempts = job.max_attempts ?? 3

        if (attempts < maxAttempts) {
          const retryInterval =
            automation.limits_config.min_interval_between_messages_minutes ?? 30
          const nextRetry = new Date(Date.now() + retryInterval * 60000).toISOString()
          await wsupabase
            .from("automation_jobs")
            .update({
              status: "retrying",
              attempts,
              next_retry_at: nextRetry,
              failure_reason: result.error_message,
              failure_code: result.error_code,
            })
            .eq("id", job.id)

          await createLog({
            automation_id: automation.id,
            job_id: job.id,
            lead_id: job.lead_id,
            event_type: "send_failed",
            event_title: `Falha no envio (tentativa ${attempts}/${maxAttempts})`,
            event_description: result.error_message,
            payload: { error_code: result.error_code, next_retry: nextRetry },
          })
        } else {
          await wsupabase
            .from("automation_jobs")
            .update({
              status: "failed",
              failed_at: new Date().toISOString(),
              attempts,
              failure_reason: result.error_message,
              failure_code: result.error_code,
            })
            .eq("id", job.id)

          await createLog({
            automation_id: automation.id,
            job_id: job.id,
            lead_id: job.lead_id,
            event_type: "send_failed",
            event_title: "Envio falhou definitivamente",
            event_description: result.error_message,
            previous_status: job.status as AutomationJobStatus,
            new_status: "failed",
            payload: { error_code: result.error_code, attempts },
          })
        }
        results.failed++
      }
    } catch (jobErr) {
      try {
        await wsupabase.from("automation_jobs").update({ status: "scheduled" }).eq("id", job.id)
        await createLog({
          automation_id: job.automation_id,
          job_id: job.id,
          lead_id: job.lead_id,
          event_type: "worker_job_error",
          event_title: "Job com erro — voltou para a fila",
          event_description: String((jobErr as Error)?.message ?? jobErr).slice(0, 300),
        })
      } catch {
        /* best-effort */
      }
      results.failed++
    } finally {
      await releaseLock(job.id)
    }

    results.processed++
  }
}
