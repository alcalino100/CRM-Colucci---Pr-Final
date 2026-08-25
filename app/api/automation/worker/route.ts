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

// O worker faz várias consultas + envios; sem isto cairia no limite padrão de 10s do Hobby
// e poderia ser morto no meio de um envio. 60s é o teto do Hobby.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const WORKER_ID = `worker-${Date.now()}`

// Cria jobs de follow-up: pega os leads que receberam a mensagem da automação-mãe e não
// responderam há mais de N horas, e agenda um novo envio (a fase de processamento cuida do
// disparo). Garante no máximo 1 follow-up por lead e só para leads ainda elegíveis.
// A automação de follow-up é identificada por trigger_type = "no_response_followup" e traz
// em trigger_config: { parent_automation_id, no_response_hours }.
async function criarJobsFollowup(automation: any, results: { created: number }): Promise<void> {
  const cfg = automation.trigger_config ?? {}
  const parentId: string | undefined = cfg.parent_automation_id
  const horas: number = cfg.no_response_hours ?? 24
  if (!parentId) {
    await createLog({
      automation_id: automation.id,
      event_type: "lead_not_eligible",
      event_title: "Follow-up sem automação-mãe configurada",
      event_description: "trigger_config.parent_automation_id ausente.",
    })
    return
  }

  const cutoff = new Date(Date.now() - horas * 3600_000).toISOString()

  // Jobs da automação-mãe: enviados, sem resposta, antigos o suficiente.
  const { data: parentJobs } = await wsupabase
    .from("automation_jobs")
    .select("lead_id, sent_at")
    .eq("automation_id", parentId)
    .in("status", ["sent", "delivered", "read"])
    .is("responded_at", null)
    .lte("sent_at", cutoff)

  for (const pj of parentJobs ?? []) {
    // Máximo 1 follow-up por lead: pula se já existir qualquer job de follow-up para ele.
    const { count } = await wsupabase
      .from("automation_jobs")
      .select("id", { count: "exact", head: true })
      .eq("automation_id", automation.id)
      .eq("lead_id", pj.lead_id)
    if ((count ?? 0) > 0) continue

    // Guarda mínima (targeting do follow-up): lead ainda novo, de tráfego pago, não fechado/arquivado.
    const { data: lead } = await wsupabase
      .from("leads")
      .select("id, nome, status, origem, corretor_id, arquivado_em, fechado_em")
      .eq("id", pj.lead_id)
      .maybeSingle()
    if (!lead || lead.status !== "novo" || lead.origem !== "Tráfego Pago" || lead.fechado_em || lead.arquivado_em) continue

    // Honra as MESMAS condições em dados da automação (telefone válido, não-perdido,
    // não-bloqueado, etc.) — mesmo motor usado pela reativação. Assim o follow-up herda
    // todas as guardas configuradas na regra, e não só as fixas acima.
    const { eligible } = await evaluateConditions(lead.id, automation.conditions, automation.id)
    if (!eligible) continue

    const scheduledAt = calculateScheduledAt(automation.wait_config)
    const { error } = await wsupabase.from("automation_jobs").insert({
      automation_id: automation.id,
      lead_id: lead.id,
      assigned_agent_id: lead.corretor_id || null,
      supervisor_user_id: automation.supervisor_user_id,
      status: "scheduled",
      scheduled_at: scheduledAt,
      eligible_at: new Date().toISOString(),
      max_attempts: automation.limits_config?.max_sends_per_lead ?? 1,
    })
    if (!error) {
      results.created++
      await createLog({
        automation_id: automation.id,
        job_id: null,
        lead_id: lead.id,
        event_type: "job_created",
        event_title: "Follow-up agendado",
        event_description: `Lead ${lead.nome} sem resposta há ${horas}h — follow-up agendado para ${new Date(scheduledAt).toLocaleString("pt-BR")}.`,
        new_status: "scheduled",
        payload: { parent_automation_id: parentId, scheduled_at: scheduledAt },
      })
    }
  }
}

interface RejectionBreakdown {
  has_active_job: number
  conditions_not_met: number
  human_interaction_recent: number
  no_leads_found: number
  insert_error: number
}

// Núcleo do worker — chamado pelo botão manual (POST) e pelo cron (GET autenticado).
async function runWorker() {
  const runStart = Date.now()
  try {
    const automations = await getActiveAutomations()
    const results = {
      evaluated: 0,
      created: 0,
      processed: 0,
      sent: 0,
      failed: 0,
      cancelled: 0,
      blocked_hour: 0,
    }
    const rejections: RejectionBreakdown = {
      has_active_job: 0,
      conditions_not_met: 0,
      human_interaction_recent: 0,
      no_leads_found: 0,
      insert_error: 0,
    }
    const rejectionDetails: { lead_id: string; lead_nome: string; reason: string }[] = []

    // Follow-up tem gatilho próprio (jobs sem resposta), não o pool bruto de leads.
    const automacoesNormais = automations.filter((a) => a.trigger_type !== "no_response_followup")
    const automacoesFollowup = automations.filter((a) => a.trigger_type === "no_response_followup")

    // FASE 1: Avaliar leads elegíveis e criar jobs
    for (const automation of automacoesNormais) {
      const { data: leads, error: leadsErr } = await wsupabase
        .from("leads")
        .select("id, nome, telefone, temperatura, status, origem, corretor_id, criado_em, gestor_responsavel, arquivado_em, fechado_em")
        .eq("status", "novo")
        .eq("origem", "Tráfego Pago")
        .is("arquivado_em", null)
        .is("fechado_em", null)

      if (leadsErr) {
        await createLog({
          automation_id: automation.id,
          event_type: "lead_not_eligible",
          event_title: "Erro ao buscar leads",
          event_description: leadsErr.message,
        })
        continue
      }

      if (!leads || leads.length === 0) {
        rejections.no_leads_found++
        await createLog({
          automation_id: automation.id,
          event_type: "lead_not_eligible",
          event_title: "Nenhum lead encontrado",
          event_description: "Nenhum lead com status=novo, origem=Tráfego Pago, não arquivado, não fechado",
        })
        continue
      }

      for (const lead of leads) {
        results.evaluated++

        // 1. Verificar job ativo (idempotência)
        if (await hasActiveJob(lead.id, automation.id)) {
          rejections.has_active_job++
          rejectionDetails.push({ lead_id: lead.id, lead_nome: lead.nome, reason: "Job ativo já existe" })
          continue
        }

        // 2. Avaliar condições da automação
        const { eligible, failed_rules } = await evaluateConditions(lead.id, automation.conditions, automation.id)
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
              payload: { last_interaction: lastInteraction.timestamp, wait_minutes: waitMinutes, diff_minutes: Math.round(diffMin) },
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
              event_description: `Agendado para ${new Date(scheduledAt).toLocaleString("pt-BR")}`,
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
          await createLog({
            automation_id: automation.id,
            lead_id: lead.id,
            event_type: "job_created",
            event_title: "Job criado na fila",
            event_description: `Lead: ${lead.nome} | Agendado: ${new Date(scheduledAt).toLocaleString("pt-BR")}`,
            new_status: "scheduled",
            payload: { scheduled_at: scheduledAt, lead_nome: lead.nome },
          })
        } else {
          rejections.insert_error++
          rejectionDetails.push({ lead_id: lead.id, lead_nome: lead.nome, reason: `Erro ao criar job: ${error.message}` })
          await createLog({
            automation_id: automation.id,
            lead_id: lead.id,
            event_type: "lead_not_eligible",
            event_title: "Erro ao criar job",
            event_description: error.message,
          })
        }
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

    // FASE 1-B: Criar jobs de follow-up (leads sem resposta da automação-mãe)
    for (const automation of automacoesFollowup) {
      await criarJobsFollowup(automation, results)
    }

    // FASE 2: Processar jobs agendados
    const jobsToProcess = await getJobsToProcess()

    for (const job of jobsToProcess) {
      const locked = await acquireLock(job.id, WORKER_ID)
      if (!locked) continue

      try {
        await wsupabase.from("automation_jobs").update({ status: "processing", processing_started_at: new Date().toISOString() }).eq("id", job.id)

        const automation = automations.find((a) => a.id === job.automation_id)
        if (!automation) {
          await cancelJob(job.id, "Automação não encontrada", "system")
          results.cancelled++
          continue
        }

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

        if (!isWithinAllowedSchedule(automation.wait_config)) {
          await wsupabase.from("automation_jobs").update({ status: "blocked_hour" }).eq("id", job.id)
          await releaseLock(job.id)
          continue
        }

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

        let corretorNome = ""
        if (lead.corretor_id) {
          const { data: corretor } = await wsupabase.from("usuarios").select("nome").eq("id", lead.corretor_id).maybeSingle()
          corretorNome = corretor?.nome ?? ""
        }

        const rendered = renderMessage(template.content, {
          lead: { nome: lead.nome, telefone: lead.telefone, origem: lead.origem },
          corretor: { nome: corretorNome },
          imobiliaria: "Colucci Imóveis",
        })

        const connectionId = automation.whatsapp_connection_id
        if (!connectionId) {
          await cancelJob(job.id, "Conexão WhatsApp não configurada", "system")
          results.cancelled++
          continue
        }

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
          }

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

          await wsupabase.from("lead_automation_settings").upsert({
            lead_id: job.lead_id,
            last_automation_sent_at: new Date().toISOString(),
          }, { onConflict: "lead_id" })

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
          const attempts = (job.attempts ?? 0) + 1
          const maxAttempts = job.max_attempts ?? 3

          if (attempts < maxAttempts) {
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

    const durationMs = Date.now() - runStart

    // Log de resumo geral da execução
    await createLog({
      event_type: "lead_evaluated",
      event_title: "Worker executado — resumo geral",
      event_description: [
        `Avaliados: ${results.evaluated}`,
        `Jobs criados: ${results.created}`,
        `Bloqueados (horário): ${results.blocked_hour}`,
        `Processados: ${results.processed}`,
        `Enviados: ${results.sent}`,
        `Falhas: ${results.failed}`,
        `Cancelados: ${results.cancelled}`,
        `Rejeições — Job ativo: ${rejections.has_active_job}`,
        `Rejeições — Condições: ${rejections.conditions_not_met}`,
        `Rejeições — Interação recente: ${rejections.human_interaction_recent}`,
        `Rejeições — Erro insert: ${rejections.insert_error}`,
        `Duração: ${durationMs}ms`,
      ].join(" | "),
      payload: { results, rejections, duration_ms: durationMs },
    })

    return NextResponse.json({ ok: true, results, rejections, rejection_details: rejectionDetails.slice(0, 50), duration_ms: durationMs })
  } catch (err) {
    const durationMs = Date.now() - runStart
    await createLog({
      event_type: "lead_not_eligible",
      event_title: "Worker falhou com exceção",
      event_description: (err as Error)?.message ?? "Erro desconhecido",
      payload: { stack: (err as Error)?.stack?.slice(0, 500), duration_ms: durationMs },
    }).catch(() => {})
    return NextResponse.json({ ok: false, error: (err as Error)?.message ?? "Erro desconhecido" }, { status: 500 })
  }
}

// POST = disparo manual (botão "Executar Worker" no painel)
export async function POST() {
  return runWorker()
}

// GET autenticado pelo cron (Vercel Cron envia Authorization: Bearer CRON_SECRET) executa o
// worker — é o que torna a automação autônoma. GET sem o segredo devolve só o status (usado
// pelo painel). As automações pausadas continuam sendo ignoradas pelo worker.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const url = new URL(req.url)
  const auth = req.headers.get("authorization")
  const qs = url.searchParams.get("secret")
  const ehCron = !!secret && (auth === `Bearer ${secret}` || qs === secret)
  if (ehCron) return runWorker()

  const [automationsRes, jobsRes, logsRes] = await Promise.all([
    wsupabase.from("automations").select("id, name, status").is("deleted_at", null),
    wsupabase.from("automation_jobs").select("status").in("status", ["scheduled", "processing", "retrying"]),
    wsupabase
      .from("automation_logs")
      .select("id, automation_id, lead_id, event_type, event_title, event_description, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(30),
  ])

  const automations = automationsRes.data ?? []
  const activeCount = automations.filter((a) => a.status === "active").length
  const pausedCount = automations.filter((a) => a.status === "paused").length

  // Último resumo do worker (último log tipo "lead_evaluated" com "resumo geral")
  const lastRun = (logsRes.data ?? []).find(
    (l) => l.event_type === "lead_evaluated" && l.event_title?.includes("resumo geral"),
  )

  return NextResponse.json({
    ok: true,
    active_automations: activeCount,
    paused_automations: pausedCount,
    pending_jobs: (jobsRes.data ?? []).length,
    last_run: lastRun
      ? {
          timestamp: lastRun.created_at,
          description: lastRun.event_description,
          payload: lastRun.payload,
        }
      : null,
    recent_logs: (logsRes.data ?? []).map((l) => ({
      id: l.id,
      automation_id: l.automation_id,
      lead_id: l.lead_id,
      event_type: l.event_type,
      event_title: l.event_title,
      event_description: l.event_description,
      created_at: l.created_at,
    })),
    timestamp: new Date().toISOString(),
  })
}
