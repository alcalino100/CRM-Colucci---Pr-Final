// =============================================================================
// POST /api/automation/worker — Worker de processamento de automações
// Execute via Vercel Cron (POST) ou chamada manual
// =============================================================================

import { NextResponse } from "next/server"
import {
  getActiveAutomations,
  getJobsToProcess,
  evaluateConditions,
  acquireLock,
  releaseLock,
  renderMessage,
  sendAutomationMessage,
  isWithinAllowedSchedule,
  calculateScheduledAt,
  hasActiveJob,
  getLastHumanInteraction,
  createLog,
  cancelJob,
} from "@/lib/automation-services"
import { wsupabase } from "@/lib/whatsapp/server"
import type { AutomationJob, AutomationJobStatus } from "@/lib/automation-types"

const WORKER_ID = `worker-${Date.now()}`

// POST = processamento do worker
export async function POST() {
  try {
    const automations = await getActiveAutomations()
    const results = { evaluated: 0, created: 0, processed: 0, sent: 0, failed: 0, cancelled: 0 }

    // FASE 1: Avaliar leads elegíveis e criar jobs
    for (const automation of automations) {
      const { data: leads } = await wsupabase
        .from("leads")
        .select("id, nome, telefone, temperatura, status, origem, corretor_id, criado_em, gestor_responsavel, arquivado_em, fechado_em")
        .eq("status", "novo")
        .eq("origem", "Tráfego Pago")
        .is("arquivado_em", null)
        .is("fechado_em", null)

      if (!leads) continue

      for (const lead of leads) {
        results.evaluated++

        // Verificar último envio recente (idempotência)
        if (await hasActiveJob(lead.id, automation.id)) continue

        // Avaliar condições
        const { eligible } = await evaluateConditions(lead.id, automation.conditions, automation.id)
        if (!eligible) continue

        // Verificar última interação humana
        const lastInteraction = await getLastHumanInteraction(lead.id)
        const waitMinutes = automation.wait_config.amount ?? 10
        if (lastInteraction.timestamp) {
          const diffMs = Date.now() - new Date(lastInteraction.timestamp).getTime()
          const diffMin = diffMs / 60000
          if (diffMin < waitMinutes) continue
        }

        // Verificar horário permitido
        if (!isWithinAllowedSchedule(automation.wait_config)) {
          // Agenda para próximo horário permitido
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
            results.created++
            await createLog({
              automation_id: automation.id,
              lead_id: lead.id,
              event_type: "lead_eligible",
              event_title: "Lead elegível — aguardando horário permitido",
              new_status: "blocked_hour",
            })
          }
          continue
        }

        // Criar job
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
          await createLog({
            automation_id: automation.id,
            lead_id: lead.id,
            event_type: "job_created",
            event_title: "Job criado na fila",
            new_status: "scheduled",
            payload: { scheduled_at: scheduledAt },
          })
        }
      }
    }

    // FASE 2: Processar jobs agendados
    const jobsToProcess = await getJobsToProcess()

    for (const job of jobsToProcess) {
      // Aplicar lock
      const locked = await acquireLock(job.id, WORKER_ID)
      if (!locked) continue

      try {
        // Atualizar status
        await wsupabase.from("automation_jobs").update({ status: "processing", processing_started_at: new Date().toISOString() }).eq("id", job.id)

        // Revalidar condições
        const automation = automations.find((a) => a.id === job.automation_id)
        if (!automation) {
          await cancelJob(job.id, "Automação não encontrada", "system")
          results.cancelled++
          continue
        }

        // Revalidar lead
        const { data: lead } = await wsupabase
          .from("leads")
          .select("id, nome, telefone, temperatura, status, origem, corretor_id, criado_em, gestor_responsavel, arquivado_em, fechado_em")
          .eq("id", job.lead_id)
          .maybeSingle()

        if (!lead || lead.status !== "novo" || lead.origem !== "Tráfego Pago" || lead.fechado_em || lead.arquivado_em) {
          await cancelJob(job.id, "Lead não atende mais às condições", "system")
          results.cancelled++
          continue
        }

        // Verificar se tem interação humana desde o agendamento
        const lastInteraction = await getLastHumanInteraction(job.lead_id)
        if (lastInteraction.timestamp && job.scheduled_at) {
          const interactionTime = new Date(lastInteraction.timestamp).getTime()
          const scheduledTime = new Date(job.scheduled_at).getTime()
          if (interactionTime > scheduledTime) {
            await cancelJob(job.id, `Interação humana detectada (${lastInteraction.event ?? "ação do corretor"})`, "system")
            results.cancelled++
            continue
          }
        }

        // Verificar horário novamente
        if (!isWithinAllowedSchedule(automation.wait_config)) {
          await wsupabase.from("automation_jobs").update({ status: "blocked_hour" }).eq("id", job.id)
          await releaseLock(job.id)
          continue
        }

        // Buscar template
        if (!automation.message_template_id) {
          await cancelJob(job.id, "Template de mensagem não configurado", "system")
          results.cancelled++
          continue
        }

        const { data: template } = await wsupabase
          .from("automation_message_templates")
          .select("*")
          .eq("id", automation.message_template_id)
          .maybeSingle()

        if (!template) {
          await cancelJob(job.id, "Template de mensagem não encontrado", "system")
          results.cancelled++
          continue
        }

        // Buscar dados do corretor
        let corretorNome = ""
        if (lead.corretor_id) {
          const { data: corretor } = await wsupabase.from("usuarios").select("nome").eq("id", lead.corretor_id).maybeSingle()
          corretorNome = corretor?.nome ?? ""
        }

        // Renderizar mensagem
        const rendered = renderMessage(template.content, {
          lead: { nome: lead.nome, telefone: lead.telefone, origem: lead.origem },
          corretor: { nome: corretorNome },
          imobiliaria: "Colucci Imóveis",
        })

        // Buscar instância WhatsApp (padrão: primeira disponível ou do gestor)
        const connectionId = automation.whatsapp_connection_id
        if (!connectionId) {
          await cancelJob(job.id, "Conexão WhatsApp não configurada", "system")
          results.cancelled++
          continue
        }

        // Verificar limite diário
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        const { count: todayCount } = await wsupabase
          .from("automation_jobs")
          .select("id", { count: "exact", head: true })
          .eq("automation_id", job.automation_id)
          .gte("sent_at", todayStart.toISOString())
          .eq("status", "sent")

        const maxDaily = automation.limits_config.max_daily_sends ?? 50
        if ((todayCount ?? 0) >= maxDaily) {
          await wsupabase.from("automation_jobs").update({ status: "blocked_limit" }).eq("id", job.id)
          await releaseLock(job.id)
          continue
        }

        // Enviar mensagem
        const result = await sendAutomationMessage({
          phone: lead.telefone,
          connection_id: connectionId,
          message_content: rendered,
          automation_id: automation.id,
          job_id: job.id,
          idempotency_key: `${automation.id}-${job.lead_id}-${Date.now()}`,
        })

        if (result.success) {
          // Sucesso
          const updateData: Record<string, unknown> = {
            status: "sent",
            sent_at: new Date().toISOString(),
            message_content_rendered: rendered,
            provider_message_id: result.provider_message_id,
            provider_response: result.raw_response,
            attempts: (job.attempts ?? 0) + 1,
          }

          // Aplicar supervisão
          if (automation.supervision_enabled && automation.supervisor_user_id) {
            const { error: supErr } = await wsupabase
              .from("leads")
              .update({ gestor_responsavel: automation.supervisor_user_id })
              .eq("id", job.lead_id)

            if (supErr) {
              updateData.supervision_status = "failed"
              updateData.supervision_error = supErr.message
            } else {
              updateData.supervision_status = "applied"
              updateData.supervision_applied_at = new Date().toISOString()

              // Criar observação automática
              if (automation.create_automatic_note) {
                const noteText = (automation.automatic_note_template ?? "")
                  .replaceAll("{{nome_automacao}}", automation.name)
                  .replaceAll("{{data_atual}}", new Date().toLocaleDateString("pt-BR"))
                  .replaceAll("{{hora_atual}}", new Date().toLocaleTimeString("pt-BR"))
                  .replaceAll("{{nome_gestor}}", "Patricia")

                await wsupabase.from("auditoria").insert({
                  lead_id: job.lead_id,
                  lead_nome: lead.nome,
                  usuario_nome: "Sistema",
                  tipo: "edicao",
                  descricao: noteText,
                })
              }

              // Log de supervisão
              await createLog({
                automation_id: automation.id,
                job_id: job.id,
                lead_id: job.lead_id,
                event_type: "supervision_applied",
                event_title: "Supervisão aplicada",
                event_description: `Gestor assumiu supervisão do lead`,
                new_status: "supervision_applied",
              })
            }
          }

          // Atualizar contadores no lead_automation_settings
          await wsupabase.from("lead_automation_settings").upsert({
            lead_id: job.lead_id,
            last_automation_sent_at: new Date().toISOString(),
          }, { onConflict: "lead_id" })

          // Incrementar total_automation_messages_sent
          const { data: las } = await wsupabase.from("lead_automation_settings").select("total_automation_messages_sent").eq("lead_id", job.lead_id).maybeSingle()
          if (las) {
            await wsupabase.from("lead_automation_settings").update({ total_automation_messages_sent: (las.total_automation_messages_sent ?? 0) + 1 }).eq("lead_id", job.lead_id)
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
        } else {
          // Falha
          const attempts = (job.attempts ?? 0) + 1
          const maxAttempts = job.max_attempts ?? 3

          if (attempts < maxAttempts) {
            // Retry com backoff
            const retryInterval = automation.limits_config.min_interval_between_messages_minutes ?? 30
            const nextRetry = new Date(Date.now() + retryInterval * 60000).toISOString()
            await wsupabase.from("automation_jobs").update({
              status: "retrying",
              attempts,
              next_retry_at: nextRetry,
              failure_reason: result.error_message,
              failure_code: result.error_code,
            }).eq("id", job.id)

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
            await wsupabase.from("automation_jobs").update({
              status: "failed",
              failed_at: new Date().toISOString(),
              attempts,
              failure_reason: result.error_message,
              failure_code: result.error_code,
            }).eq("id", job.id)

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
      } finally {
        await releaseLock(job.id)
      }

      results.processed++
    }

    return NextResponse.json({ ok: true, results })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error)?.message ?? "Erro desconhecido" }, { status: 500 })
  }
}

// GET = status do worker
export async function GET() {
  const [automationsRes, jobsRes] = await Promise.all([
    wsupabase.from("automations").select("id, status").is("deleted_at", null),
    wsupabase.from("automation_jobs").select("status").in("status", ["scheduled", "processing", "retrying"]),
  ])
  return NextResponse.json({
    ok: true,
    active_automations: (automationsRes.data ?? []).filter((a) => a.status === "active").length,
    pending_jobs: (jobsRes.data ?? []).length,
    timestamp: new Date().toISOString(),
  })
}
