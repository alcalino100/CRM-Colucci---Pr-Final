"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { supabase } from "./supabase/client"
import type {
  Automation,
  AutomationGlobalSettings,
  AutomationJob,
  AutomationLog,
  AutomationMessageTemplate,
  LeadAutomationSettings,
} from "./automation-types"

interface AutomationStore {
  automations: Automation[]
  jobs: AutomationJob[]
  logs: AutomationLog[]
  templates: AutomationMessageTemplate[]
  globalSettings: AutomationGlobalSettings | null
  leadSettings: Record<string, LeadAutomationSettings>
  ready: boolean

  // CRUD automações
  loadAutomations: () => Promise<void>
  addAutomation: (a: Omit<Automation, "id" | "created_at" | "updated_at" | "deleted_at">) => Promise<{ ok: boolean; id?: string; error?: string }>
  updateAutomation: (id: string, patch: Partial<Automation>) => Promise<{ ok: boolean; error?: string }>
  deleteAutomation: (id: string) => Promise<{ ok: boolean; error?: string }>
  toggleAutomation: (id: string) => Promise<{ ok: boolean; error?: string }>

  // Templates
  loadTemplates: () => Promise<void>
  addTemplate: (t: Omit<AutomationMessageTemplate, "id" | "created_at" | "updated_at">) => Promise<{ ok: boolean; id?: string; error?: string }>
  updateTemplate: (id: string, patch: Partial<AutomationMessageTemplate>) => Promise<{ ok: boolean; error?: string }>

  // Jobs
  loadJobs: (filters?: JobFilters) => Promise<void>
  cancelJob: (jobId: string, reason: string) => Promise<{ ok: boolean; error?: string }>
  clearQueue: (reason?: string) => Promise<{ ok: boolean; cancelled?: number; error?: string }>
  rerunJob: (jobId: string) => Promise<{ ok: boolean; error?: string }>
  pauseLead: (leadId: string, reason: string) => Promise<{ ok: boolean; error?: string }>
  resumeLead: (leadId: string) => Promise<{ ok: boolean; error?: string }>
  blockLead: (leadId: string, reason: string) => Promise<{ ok: boolean; error?: string }>

  // Logs
  loadLogs: (filters?: LogFilters) => Promise<void>

  // Settings
  loadGlobalSettings: () => Promise<void>
  updateGlobalSettings: (patch: Partial<AutomationGlobalSettings>) => Promise<{ ok: boolean; error?: string }>

  // Lead settings
  loadLeadSettings: (leadId: string) => Promise<void>

  // Métricas
  loadDashboardMetrics: () => Promise<DashboardMetrics>
}

interface JobFilters {
  status?: string
  automation_id?: string
  lead_id?: string
  page?: number
  pageSize?: number
}

interface LogFilters {
  event_type?: string
  automation_id?: string
  lead_id?: string
  page?: number
  pageSize?: number
}

export interface DashboardMetrics {
  active_automations: number
  leads_analyzed_today: number
  leads_eligible_today: number
  messages_scheduled: number
  messages_sent_today: number
  messages_delivered: number
  messages_read: number
  leads_responded: number
  cancelled_by_human: number
  send_failures: number
  supervisions_applied: number
  response_rate: number
  cancel_rate: number
  failure_rate: number
}

const Ctx = createContext<AutomationStore | null>(null)

// ---------- Conversores ----------
function rowToAutomation(r: any): Automation {
  return {
    ...r,
    conditions: typeof r.conditions === "string" ? JSON.parse(r.conditions) : r.conditions,
    wait_config: typeof r.wait_config === "string" ? JSON.parse(r.wait_config) : r.wait_config,
    cancellation_rules: typeof r.cancellation_rules === "string" ? JSON.parse(r.cancellation_rules) : r.cancellation_rules,
    limits_config: typeof r.limits_config === "string" ? JSON.parse(r.limits_config) : r.limits_config,
    trigger_config: typeof r.trigger_config === "string" ? JSON.parse(r.trigger_config) : r.trigger_config,
  }
}

function rowToJob(r: any): AutomationJob {
  return {
    ...r,
    metadata: typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata,
    provider_response: typeof r.provider_response === "string" ? JSON.parse(r.provider_response) : r.provider_response,
  }
}

export function AutomationProvider({ children }: { children: React.ReactNode }) {
  const [automations, setAutomations] = useState<Automation[]>([])
  const [jobs, setJobs] = useState<AutomationJob[]>([])
  const [logs, setLogs] = useState<AutomationLog[]>([])
  const [templates, setTemplates] = useState<AutomationMessageTemplate[]>([])
  const [globalSettings, setGlobalSettings] = useState<AutomationGlobalSettings | null>(null)
  const [leadSettings, setLeadSettings] = useState<Record<string, LeadAutomationSettings>>({})
  const [ready, setReady] = useState(false)

  // ---------- Load ----------
  const loadAutomations = useCallback(async () => {
    const { data } = await supabase
      .from("automations")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
    if (data) setAutomations(data.map(rowToAutomation))
  }, [])

  const loadTemplates = useCallback(async () => {
    const { data } = await supabase
      .from("automation_message_templates")
      .select("*")
      .order("created_at", { ascending: false })
    if (data) setTemplates(data)
  }, [])

  const loadGlobalSettings = useCallback(async () => {
    const { data } = await supabase
      .from("automation_global_settings")
      .select("*")
      .limit(1)
      .maybeSingle()
    if (data) setGlobalSettings(data)
  }, [])

  const loadJobs = useCallback(async (filters?: JobFilters) => {
    let q = supabase.from("automation_jobs").select("*").order("scheduled_at", { ascending: false })
    if (filters?.status) q = q.eq("status", filters.status)
    if (filters?.automation_id) q = q.eq("automation_id", filters.automation_id)
    if (filters?.lead_id) q = q.eq("lead_id", filters.lead_id)
    const from = (filters?.page ?? 0) * (filters?.pageSize ?? 50)
    q = q.range(from, from + (filters?.pageSize ?? 50) - 1)
    const { data } = await q
    if (data) setJobs(data.map(rowToJob))
  }, [])

  const loadLogs = useCallback(async (filters?: LogFilters) => {
    let q = supabase.from("automation_logs").select("*").order("created_at", { ascending: false })
    if (filters?.event_type) q = q.eq("event_type", filters.event_type)
    if (filters?.automation_id) q = q.eq("automation_id", filters.automation_id)
    if (filters?.lead_id) q = q.eq("lead_id", filters.lead_id)
    const from = (filters?.page ?? 0) * (filters?.pageSize ?? 100)
    q = q.range(from, from + (filters?.pageSize ?? 100) - 1)
    const { data } = await q
    if (data) setLogs(data)
  }, [])

  const loadLeadSettings = useCallback(async (leadId: string) => {
    const { data } = await supabase
      .from("lead_automation_settings")
      .select("*")
      .eq("lead_id", leadId)
      .maybeSingle()
    if (data) setLeadSettings((prev) => ({ ...prev, [leadId]: data }))
  }, [])

  // ---------- Métricas do dashboard ----------
  const loadDashboardMetrics = useCallback(async (): Promise<DashboardMetrics> => {
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const hojeISO = hoje.toISOString()

    const [automationsRes, jobsRes] = await Promise.all([
      supabase.from("automations").select("id", { count: "exact", head: true }).eq("status", "active").is("deleted_at", null),
      supabase.from("automation_jobs").select("status, created_at"),
    ])

    const allJobs = (jobsRes.data ?? []) as { status: string; created_at: string }[]
    const todayJobs = allJobs.filter((j) => new Date(j.created_at) >= hoje)

    const counts: Record<string, number> = {}
    for (const j of allJobs) counts[j.status] = (counts[j.status] || 0) + 1
    const todayCounts: Record<string, number> = {}
    for (const j of todayJobs) todayCounts[j.status] = (todayCounts[j.status] || 0) + 1

    const totalSent = (counts.sent ?? 0) + (counts.delivered ?? 0) + (counts.read ?? 0) + (counts.responded ?? 0)
    const responseRate = totalSent > 0 ? ((counts.responded ?? 0) / totalSent) * 100 : 0
    const cancelRate = allJobs.length > 0 ? ((counts.cancelled_human ?? 0) / allJobs.length) * 100 : 0
    const failureRate = allJobs.length > 0 ? ((counts.failed ?? 0) / allJobs.length) * 100 : 0

    return {
      active_automations: (automationsRes.count ?? 0),
      leads_analyzed_today: todayJobs.length,
      leads_eligible_today: (todayCounts.scheduled ?? 0) + (todayCounts.pending_validation ?? 0),
      messages_scheduled: (counts.scheduled ?? 0) + (counts.pending_validation ?? 0),
      messages_sent_today: (todayCounts.sent ?? 0),
      messages_delivered: (counts.delivered ?? 0),
      messages_read: (counts.read ?? 0),
      leads_responded: (counts.responded ?? 0),
      cancelled_by_human: (counts.cancelled_human ?? 0),
      send_failures: (counts.failed ?? 0),
      supervisions_applied: (counts.supervision_applied ?? 0),
      response_rate: Math.round(responseRate * 10) / 10,
      cancel_rate: Math.round(cancelRate * 10) / 10,
      failure_rate: Math.round(failureRate * 10) / 10,
    }
  }, [])

  // ---------- CRUD ----------
  const addAutomation: AutomationStore["addAutomation"] = async (a) => {
    const { data, error } = await supabase.from("automations").insert({
      name: a.name,
      slug: a.slug,
      description: a.description,
      category: a.category,
      status: a.status,
      priority: a.priority,
      trigger_type: a.trigger_type,
      trigger_config: a.trigger_config,
      conditions: a.conditions,
      wait_config: a.wait_config,
      cancellation_rules: a.cancellation_rules,
      message_template_id: a.message_template_id,
      whatsapp_connection_id: a.whatsapp_connection_id,
      supervision_enabled: a.supervision_enabled,
      supervisor_user_id: a.supervisor_user_id,
      keep_current_agent: a.keep_current_agent,
      create_automatic_note: a.create_automatic_note,
      automatic_note_template: a.automatic_note_template,
      limits_config: a.limits_config,
      is_test_mode: a.is_test_mode,
      is_simulation_mode: a.is_simulation_mode,
      created_by: a.created_by,
      updated_by: a.updated_by,
    }).select("id").maybeSingle()
    if (error) return { ok: false, error: error.message }
    await loadAutomations()
    return { ok: true, id: data?.id }
  }

  const updateAutomation: AutomationStore["updateAutomation"] = async (id, patch) => {
    const row: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) row[k] = v
    }
    const { error } = await supabase.from("automations").update(row).eq("id", id)
    if (error) return { ok: false, error: error.message }
    await loadAutomations()
    return { ok: true }
  }

  const deleteAutomation: AutomationStore["deleteAutomation"] = async (id) => {
    const { error } = await supabase.from("automations").update({ deleted_at: new Date().toISOString() }).eq("id", id)
    if (error) return { ok: false, error: error.message }
    await loadAutomations()
    return { ok: true }
  }

  const toggleAutomation: AutomationStore["toggleAutomation"] = async (id) => {
    const auto = automations.find((a) => a.id === id)
    if (!auto) return { ok: false, error: "Automação não encontrada." }
    const newStatus = auto.status === "active" ? "paused" : "active"
    return updateAutomation(id, { status: newStatus })
  }

  const addTemplate: AutomationStore["addTemplate"] = async (t) => {
    const { data, error } = await supabase.from("automation_message_templates").insert(t).select("id").maybeSingle()
    if (error) return { ok: false, error: error.message }
    await loadTemplates()
    return { ok: true, id: data?.id }
  }

  const updateTemplate: AutomationStore["updateTemplate"] = async (id, patch) => {
    const { error } = await supabase.from("automation_message_templates").update(patch).eq("id", id)
    if (error) return { ok: false, error: error.message }
    await loadTemplates()
    return { ok: true }
  }

  const cancelJobFn: AutomationStore["cancelJob"] = async (jobId, reason) => {
    const { error } = await supabase
      .from("automation_jobs")
      .update({ status: "cancelled_manual", cancelled_at: new Date().toISOString(), cancellation_reason: reason })
      .eq("id", jobId)
    if (error) return { ok: false, error: error.message }
    await loadJobs()
    return { ok: true }
  }

  const clearQueue: AutomationStore["clearQueue"] = async (reason = "Fila limpa manualmente pelo gestor") => {
    const terminalStatuses = ["sent", "delivered", "read", "responded", "cancelled_human", "cancelled_condition", "cancelled_manual"]
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from("automation_jobs")
      .update({ status: "cancelled_manual", cancelled_at: now, cancellation_reason: reason })
      .not("status", "in", `(${terminalStatuses.join(",")})`)
      .select("id")
    if (error) return { ok: false, error: error.message }
    await loadJobs()
    return { ok: true, cancelled: data?.length ?? 0 }
  }

  const rerunJob: AutomationStore["rerunJob"] = async (jobId) => {
    const { error } = await supabase
      .from("automation_jobs")
      .update({ status: "scheduled", scheduled_at: new Date().toISOString(), cancelled_at: null, cancellation_reason: null })
      .eq("id", jobId)
    if (error) return { ok: false, error: error.message }
    await loadJobs()
    return { ok: true }
  }

  const pauseLead: AutomationStore["pauseLead"] = async (leadId, reason) => {
    const { error } = await supabase.from("lead_automation_settings").upsert({
      lead_id: leadId,
      automation_paused: true,
      automation_paused_reason: reason,
      automation_paused_at: new Date().toISOString(),
    }, { onConflict: "lead_id" })
    if (error) return { ok: false, error: error.message }
    await loadLeadSettings(leadId)
    return { ok: true }
  }

  const resumeLead: AutomationStore["resumeLead"] = async (leadId) => {
    const { error } = await supabase.from("lead_automation_settings").upsert({
      lead_id: leadId,
      automation_paused: false,
      automation_paused_reason: null,
      automation_paused_at: null,
    }, { onConflict: "lead_id" })
    if (error) return { ok: false, error: error.message }
    await loadLeadSettings(leadId)
    return { ok: true }
  }

  const blockLead: AutomationStore["blockLead"] = async (leadId, reason) => {
    const { error } = await supabase.from("lead_automation_settings").upsert({
      lead_id: leadId,
      do_not_contact: true,
      do_not_contact_reason: reason,
    }, { onConflict: "lead_id" })
    if (error) return { ok: false, error: error.message }
    await loadLeadSettings(leadId)
    return { ok: true }
  }

  const updateGlobalSettings: AutomationStore["updateGlobalSettings"] = async (patch) => {
    if (!globalSettings) return { ok: false, error: "Configurações não carregadas." }
    const { error } = await supabase.from("automation_global_settings").update(patch).eq("id", globalSettings.id)
    if (error) return { ok: false, error: error.message }
    await loadGlobalSettings()
    return { ok: true }
  }

  // ---------- Init + Realtime ----------
  useEffect(() => {
    Promise.all([
      loadAutomations().catch(() => {}),
      loadTemplates().catch(() => {}),
      loadGlobalSettings().catch(() => {}),
      loadJobs().catch(() => {}),
      loadLogs().catch(() => {}),
    ]).finally(() => setReady(true))

    try {
      const channel = supabase
        .channel("automations-realtime")
        .on("postgres_changes", { event: "*", schema: "public", table: "automations" }, loadAutomations)
        .on("postgres_changes", { event: "*", schema: "public", table: "automation_jobs" }, () => loadJobs())
        .on("postgres_changes", { event: "*", schema: "public", table: "automation_logs" }, () => loadLogs())
        .subscribe()

      return () => { supabase.removeChannel(channel) }
    } catch {
      setReady(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Ctx.Provider value={{
      automations, jobs, logs, templates, globalSettings, leadSettings, ready,
      loadAutomations, addAutomation, updateAutomation, deleteAutomation, toggleAutomation,
      loadTemplates, addTemplate, updateTemplate,
      loadJobs, cancelJob: cancelJobFn, clearQueue, rerunJob, pauseLead, resumeLead, blockLead,
      loadLogs, loadGlobalSettings, updateGlobalSettings, loadLeadSettings,
      loadDashboardMetrics,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAutomation() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useAutomation deve ser usado dentro de AutomationProvider")
  return ctx
}
