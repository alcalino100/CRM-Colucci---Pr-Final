// =============================================================================
// automation-services.ts — Serviços centrais de automação
// Camada de envio WhatsApp, interação humana, renderização, avaliação de regras
// =============================================================================

import { wsupabase } from "@/lib/whatsapp/server"
import { onlyDigits } from "@/lib/whatsapp/server"
import type {
  Automation,
  AutomationCondition,
  AutomationConditionGroup,
  AutomationJob,
  AutomationJobStatus,
  AutomationLog,
  AutomationMessageTemplate,
  AutomationCancellationRules,
  AutomationWaitConfig,
} from "./automation-types"

// ---------- Variáveis dinâmicas ----------

interface VariableContext {
  lead?: { nome?: string; telefone?: string; cidade?: string; origem?: string } | null
  corretor?: { nome?: string } | null
  imobiliaria?: string
  empreendimento?: string
  linkAtendimento?: string
}

export function renderMessage(template: string, ctx: VariableContext): string {
  const now = new Date()
  const primeiroNome = (ctx.lead?.nome ?? "").split(" ")[0] || "Lead"
  const vars: Record<string, string> = {
    nome_lead: ctx.lead?.nome ?? "",
    primeiro_nome: primeiroNome,
    nome_corretor: ctx.corretor?.nome ?? "",
    nome_imobiliaria: ctx.imobiliaria ?? "Colucci Imóveis",
    cidade_lead: ctx.lead?.cidade ?? "",
    empreendimento_interesse: ctx.empreendimento ?? "",
    origem_lead: ctx.lead?.origem ?? "",
    telefone_lead: ctx.lead?.telefone ?? "",
    link_atendimento: ctx.linkAtendimento ?? "",
    data_atual: now.toLocaleDateString("pt-BR"),
    hora_atual: now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  }
  let result = template
  for (const [key, val] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, val)
  }
  return result
}

// ---------- Envio WhatsApp desacoplado ----------

export interface SendResult {
  success: boolean
  provider_message_id?: string
  provider_status?: string
  raw_response?: Record<string, unknown>
  error_code?: string
  error_message?: string
}

export async function sendAutomationMessage(opts: {
  phone: string
  connection_id: string
  message_content: string
  automation_id: string
  job_id: string
  idempotency_key: string
}): Promise<SendResult> {
  try {
    const { data: conn } = await wsupabase
      .from("whatsapp_instancias")
      .select("instance_name")
      .eq("id", opts.connection_id)
      .maybeSingle()

    if (!conn?.instance_name) {
      return { success: false, error_code: "CONNECTION_NOT_FOUND", error_message: "Instância WhatsApp não encontrada." }
    }

    const phone = onlyDigits(opts.phone)
    if (!phone || phone.length < 10) {
      return { success: false, error_code: "INVALID_PHONE", error_message: "Telefone inválido." }
    }

    const url = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "")
    const key = process.env.EVOLUTION_API_KEY_2 || process.env.EVOLUTION_API_KEY || ""
    if (!url || !key) {
      return { success: false, error_code: "EVOLUTION_NOT_CONFIGURED", error_message: "Evolution API não configurada." }
    }

    const res = await fetch(`${url}/message/sendText/${encodeURIComponent(conn.instance_name)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify({ number: phone, text: opts.message_content }),
    })

    const raw = await res.json().catch(() => ({}))

    if (!res.ok) {
      return {
        success: false,
        error_code: `HTTP_${res.status}`,
        error_message: raw?.message ?? raw?.response?.message ?? `HTTP ${res.status}`,
        raw_response: raw,
      }
    }

    // Evolution retorna key "key" com "id" = provider_message_id
    const providerMsgId = raw?.key?.id ?? raw?.id ?? null
    return {
      success: true,
      provider_message_id: providerMsgId,
      provider_status: raw?.key?.remoteJid ? "sent" : "unknown",
      raw_response: raw,
    }
  } catch (err) {
    const cause = (err as Error)?.message ?? "UNKNOWN"
    return { success: false, error_code: "EXCEPTION", error_message: cause }
  }
}

// ---------- Última interação humana ----------

export async function getLastHumanInteraction(leadId: string): Promise<{ timestamp: string | null; actor?: string; event?: string }> {
  // Busca na tabela de logs de automação por eventos de interação humana
  const { data: logs } = await wsupabase
    .from("automation_logs")
    .select("created_at, actor_type, actor_user_id, event_type, payload")
    .eq("lead_id", leadId)
    .eq("actor_type", "user")
    .order("created_at", { ascending: false })
    .limit(1)

  // Busca também na auditoria por ações recentes no lead
  const { data: audits } = await wsupabase
    .from("auditoria")
    .select("criado_em, usuario_nome, tipo")
    .eq("lead_id", leadId)
    .order("criado_em", { ascending: false })
    .limit(1)

  // Busca por mensagens no whatsapp (se existir tabela de conversas)
  // Nota: integração futura — por enquanto usa auditoria como fonte

  const lastLog = logs?.[0]
  const lastAudit = audits?.[0]

  const logTime = lastLog?.created_at ? new Date(lastLog.created_at).getTime() : 0
  const auditTime = lastAudit?.criado_em ? new Date(lastAudit.criado_em).getTime() : 0

  if (logTime >= auditTime && lastLog) {
    return { timestamp: lastLog.created_at, actor: lastLog.actor_user_id ?? undefined, event: lastLog.event_type }
  }
  if (lastAudit) {
    return { timestamp: lastAudit.criado_em, actor: lastAudit.usuario_nome, event: lastAudit.tipo }
  }
  return { timestamp: null }
}

// ---------- Avaliação de condições ----------

export async function evaluateConditions(
  leadId: string,
  conditions: AutomationConditionGroup,
  _automationId: string,
): Promise<{ eligible: boolean; failed_rules: string[] }> {
  const { data: lead } = await wsupabase
    .from("leads")
    .select("id, nome, telefone, temperatura, status, origem, corretor_id, criado_em, gestor_responsavel, arquivado_em, fechado_em")
    .eq("id", leadId)
    .maybeSingle()

  if (!lead) return { eligible: false, failed_rules: ["Lead não encontrado"] }

  // Lead automation settings
  const { data: las } = await wsupabase
    .from("lead_automation_settings")
    .select("automation_paused, do_not_contact")
    .eq("lead_id", leadId)
    .maybeSingle()

  const failed: string[] = []

  for (const rule of conditions.rules) {
    const pass = evaluateRule(lead, rule, las)
    if (!pass) failed.push(`${rule.field} ${rule.operator} ${rule.value}`)
  }

  const eligible = conditions.mode === "and" ? failed.length === 0 : failed.length < conditions.rules.length
  return { eligible, failed_rules: failed }
}

function evaluateRule(
  lead: Record<string, unknown>,
  rule: AutomationCondition,
  las: Record<string, unknown> | null,
): boolean {
  const val = rule.value
  switch (rule.field) {
    case "tag_origem":
    case "origem":
      return rule.operator === "equals" ? lead.origem === val : lead.origem !== val
    case "status":
      return rule.operator === "equals" ? lead.status === val : lead.status !== val
    case "temperatura":
      return rule.operator === "equals" ? lead.temperatura === val : lead.temperatura !== val
    case "has_valid_phone": {
      const phone = onlyDigits(String(lead.telefone ?? ""))
      return rule.operator === "equals" ? (phone.length >= 10) === val : phone.length < 10
    }
    case "is_not_converted":
      return rule.operator === "equals" ? !lead.fechado_em === Boolean(val) : Boolean(lead.fechado_em) !== Boolean(val)
    case "is_not_lost":
      return rule.operator === "equals" ? lead.status !== "perdido" === Boolean(val) : lead.status === "perdido"
    case "is_not_archived":
      return rule.operator === "equals" ? !lead.arquivado_em === Boolean(val) : Boolean(lead.arquivado_em) !== Boolean(val)
    case "automation_not_blocked":
      return las ? !las.automation_paused === Boolean(val) && !las.do_not_contact === Boolean(val) : true
    case "not_recently_automated":
      return true // validado no worker via job history
    case "last_human_interaction_minutes": {
      // Deferido — validado pelo worker via getLastHumanInteraction
      return true
    }
    default:
      return true
  }
}

// ---------- Cancelamento de jobs ----------

export async function cancelJob(
  jobId: string,
  reason: string,
  cancelledBy: "system" | "user" = "system",
  actorUserId?: string,
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString()
  const { data: job, error: fetchErr } = await wsupabase
    .from("automation_jobs")
    .select("id, status, lead_id, automation_id")
    .eq("id", jobId)
    .maybeSingle()

  if (fetchErr || !job) return { ok: false, error: "Job não encontrado." }

  const terminalStatuses: AutomationJobStatus[] = ["sent", "delivered", "read", "responded", "cancelled_human", "cancelled_condition", "cancelled_manual"]
  if (terminalStatuses.includes(job.status as AutomationJobStatus)) {
    return { ok: false, error: `Job já está em status final: ${job.status}` }
  }

  const newStatus: AutomationJobStatus = cancelledBy === "user" ? "cancelled_manual" : "cancelled_human"

  const { error } = await wsupabase
    .from("automation_jobs")
    .update({ status: newStatus, cancelled_at: now, cancellation_reason: reason })
    .eq("id", jobId)

  if (error) return { ok: false, error: error.message }

  await createLog({
    automation_id: job.automation_id,
    job_id: job.id,
    lead_id: job.lead_id,
    event_type: "job_cancelled",
    event_title: "Job cancelado",
    event_description: reason,
    previous_status: job.status as AutomationJobStatus,
    new_status: newStatus,
    actor_type: cancelledBy,
    actor_user_id: actorUserId,
  })

  return { ok: true }
}

// ---------- Criação de log ----------

export async function createLog(input: {
  automation_id?: string | null
  job_id?: string | null
  lead_id?: string | null
  event_type: string
  event_title: string
  event_description?: string
  previous_status?: AutomationJobStatus | null
  new_status?: AutomationJobStatus | null
  actor_type?: string
  actor_user_id?: string | null
  related_user_id?: string | null
  payload?: Record<string, unknown>
}): Promise<void> {
  try {
    await wsupabase.from("automation_logs").insert({
      automation_id: input.automation_id ?? null,
      job_id: input.job_id ?? null,
      lead_id: input.lead_id ?? null,
      event_type: input.event_type,
      event_title: input.event_title,
      event_description: input.event_description ?? null,
      previous_status: input.previous_status ?? null,
      new_status: input.new_status ?? null,
      actor_type: input.actor_type ?? "system",
      actor_user_id: input.actor_user_id ?? null,
      related_user_id: input.related_user_id ?? null,
      payload: input.payload ?? {},
    })
  } catch {
    // log é best-effort
  }
}

// ---------- Verificação de horário permitido ----------

export function isWithinAllowedSchedule(waitConfig: AutomationWaitConfig): boolean {
  const tz = waitConfig.timezone ?? "America/Sao_Paulo"
  const now = new Date()
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  })
  const parts = formatter.formatToParts(now)
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? ""
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10)
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10)

  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const currentDay = dayMap[weekdayStr] ?? 0
  const allowedDays = waitConfig.allowed_days ?? [1, 2, 3, 4, 5]
  if (!allowedDays.includes(currentDay)) return false

  const currentTime = hour * 60 + minute
  const [startH, startM] = (waitConfig.allowed_start_hour ?? "08:00").split(":").map(Number)
  const [endH, endM] = (waitConfig.allowed_end_hour ?? "18:00").split(":").map(Number)
  const startTime = (startH ?? 0) * 60 + (startM ?? 0)
  const endTime = (endH ?? 0) * 60 + (endM ?? 0)

  return currentTime >= startTime && currentTime <= endTime
}

// ---------- Cálculo do scheduled_at ----------

export function calculateScheduledAt(waitConfig: AutomationWaitConfig): string {
  const tz = waitConfig.timezone ?? "America/Sao_Paulo"
  const now = new Date()
  const amount = waitConfig.amount ?? 10
  const unit = waitConfig.unit ?? "minutes"

  // Obter hora atual no timezone configurado
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  })
  const parts = formatter.formatToParts(now)
  const currentHour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10)
  const currentMinute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10)
  const currentTimeMinutes = currentHour * 60 + currentMinute

  const [startH, startM] = (waitConfig.allowed_start_hour ?? "08:00").split(":").map(Number)
  const [endH, endM] = (waitConfig.allowed_end_hour ?? "18:00").split(":").map(Number)
  const startTimeMinutes = (startH ?? 8) * 60 + (startM ?? 0)
  const endTimeMinutes = (endH ?? 18) * 60 + (endM ?? 0)

  const ms = unit === "minutes" ? amount * 60000 : unit === "hours" ? amount * 3600000 : amount * 86400000

  let scheduled: Date

  if (currentTimeMinutes >= startTimeMinutes && currentTimeMinutes <= endTimeMinutes) {
    // Dentro do horário permitido → agendar para hoje (now + wait)
    scheduled = new Date(now.getTime() + ms)
  } else if (currentTimeMinutes > endTimeMinutes) {
    // Depois do horário → amanhã no início do horário permitido
    scheduled = new Date(now)
    scheduled.setDate(scheduled.getDate() + 1)
    scheduled.setHours(startH ?? 8, startM ?? 0, 0, 0)
    scheduled = new Date(scheduled.getTime() + ms)
  } else {
    // Antes do horário → hoje no início do horário permitido
    scheduled = new Date(now)
    scheduled.setHours(startH ?? 8, startM ?? 0, 0, 0)
    scheduled = new Date(scheduled.getTime() + ms)
  }

  return scheduled.toISOString()
}

// ---------- Idempotência: verificar se já existe job ativo ----------

export async function hasActiveJob(leadId: string, automationId: string): Promise<boolean> {
  const { count } = await wsupabase
    .from("automation_jobs")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId)
    .eq("automation_id", automationId)
    .not("status", "in", "(cancelled_human,cancelled_condition,cancelled_manual)")

  return (count ?? 0) > 0
}

// ---------- Buscar automações ativas ----------

export async function getActiveAutomations(): Promise<Automation[]> {
  const { data } = await wsupabase
    .from("automations")
    .select("*")
    .eq("status", "active")
    .is("deleted_at", null)
    .order("priority", { ascending: false })

  return (data ?? []) as Automation[]
}

// ---------- Buscar jobs agendados para processar ----------

export async function getJobsToProcess(): Promise<AutomationJob[]> {
  const now = new Date()
  const nowIso = now.toISOString()

  // Buscar jobs cujo scheduled_at já chegou (case tradicional)
  const { data: readyJobs } = await wsupabase
    .from("automation_jobs")
    .select("*")
    .in("status", ["scheduled", "pending_validation", "retrying"])
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(50)

  // Buscar jobs agendados para hoje (scheduled_at no futuro mas ainda hoje) — processar imediatamente
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(now)
  todayEnd.setHours(23, 59, 59, 999)

  const { data: todayJobs } = await wsupabase
    .from("automation_jobs")
    .select("*")
    .in("status", ["scheduled"])
    .gt("scheduled_at", nowIso)
    .lte("scheduled_at", todayEnd.toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(50)

  // Combinar e deduplicar por id
  const allJobs = [...(readyJobs ?? [])]
  const seenIds = new Set(allJobs.map((j) => j.id))
  for (const job of todayJobs ?? []) {
    if (!seenIds.has(job.id)) {
      allJobs.push(job)
      seenIds.add(job.id)
    }
  }

  return allJobs as AutomationJob[]
}

// ---------- Lock transacional ----------

export async function acquireLock(jobId: string, workerId: string): Promise<boolean> {
  const now = new Date().toISOString()
  const { data: job } = await wsupabase
    .from("automation_jobs")
    .select("locked_at, locked_by")
    .eq("id", jobId)
    .maybeSingle()

  if (job?.locked_at) {
    const lockAge = Date.now() - new Date(job.locked_at).getTime()
    if (lockAge < 120000) return false // lock válido por 2 min
  }

  const { error } = await wsupabase
    .from("automation_jobs")
    .update({ locked_at: now, locked_by: workerId })
    .eq("id", jobId)
    .is("locked_by", null)

  return !error
}

export async function releaseLock(jobId: string): Promise<void> {
  await wsupabase
    .from("automation_jobs")
    .update({ locked_at: null, locked_by: null })
    .eq("id", jobId)
}
