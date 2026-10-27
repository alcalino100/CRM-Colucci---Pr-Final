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
import { getRules } from "@/lib/ai/rules"
import { normalizePhone } from "@/lib/labels"
import { getTagsCatalog } from "@/lib/ai/tags-catalog"

// O worker faz várias consultas + envios; sem isto cairia no limite padrão.
// Projeto Pro: 300s (conta-gotas + retries cabem).
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const WORKER_ID = `worker-${Date.now()}`

// ---- Coordenação IA x Automação ---------------------------------------------
// Quando um agente IA está respondendo um lead (conversa IA ativa), o worker NÃO
// cria follow-up/reativação para aquele lead — evita que automação e IA enviem para
// o mesmo contato ao mesmo tempo. O semáforo pode ser desligado por agente via
// regras.coordination.paraleloComAutomacao=true (default é coordenar).
async function leadsComIAAtiva(): Promise<Set<string>> {
  const { data } = await wsupabase
    .from("conversations_ia")
    .select("contact_id,external_id")
    .eq("ai_responding", true)
    .neq("channel", "test")
  const set = new Set<string>()
  for (const r of (data || []) as { contact_id?: string; external_id?: string }[]) {
    if (r.contact_id) set.add(String(r.contact_id))
    // Conversas orgânicas usam o telefone como chave — inclui variações com/sem 55.
    if (r.external_id) {
      const d = String(r.external_id).replace(/\D/g, "")
      if (!d) continue
      set.add(d)
      set.add(d.startsWith("55") ? d.slice(2) : `55${d}`)
    }
  }
  return set
}

// true = o lead tem conversa IA ativa (por id do lead ou por telefone).
function leadTemIAAtiva(skipIA: Set<string> | null, lead: { id: string; telefone?: string | null }): boolean {
  if (!skipIA) return false
  if (skipIA.has(lead.id)) return true
  const digits = String(lead.telefone || "").replace(/\D/g, "")
  if (digits && skipIA.has(digits)) return true
  const norm = normalizePhone(String(lead.telefone || ""))
  if (norm && skipIA.has(norm)) return true
  return false
}

// true = o worker deve respeitar o semáforo (pular leads com conversa IA ativa).
// Desliga apenas se NENHUM agente ativo (com regras habilitadas) coordena com a automação.
async function coordenarComIA(): Promise<boolean> {
  const { data: agentes } = await wsupabase.from("ai_agents").select("is_active,config")
  const ativos = (agentes || []).filter((a: { is_active?: boolean; config?: unknown }) => a.is_active && getRules(a.config).enable)
  if (!ativos.length) return false
  return !ativos.every((a: { config?: unknown }) => getRules(a.config).coordination.paraleloComAutomacao)
}

// Tags marcadas como "Follow-up" no catálogo: leads que as possuem entram na fila de
// follow-up independente da origem (além do padrão Tráfego Pago). Vazio = sem extensão.
async function tagsDeFollowUp(): Promise<Set<string>> {
  try {
    const catalog = await getTagsCatalog(false)
    return new Set(catalog.tags.filter((t) => t.followUp).map((t) => t.name))
  } catch {
    return new Set()
  }
}

// Tags do lead (referencias -> strings normalizadas)
function tagsDoLead(referencias: unknown): string[] {
  if (!Array.isArray(referencias)) return []
  const out: string[] = []
  for (const r of referencias) {
    const v = typeof r === "string" ? r : (r as any)?.ref ?? ""
    const s = String(v).trim().toLowerCase()
    if (s) out.push(s)
  }
  return out
}

// =============================================================================
// CADÊNCIA D+1, D+2, D+3 — Templates e Limites Anti-Ban
// =============================================================================
export const TEMPLATE_D1 = "a0000000-0000-0000-0000-000000000002" // Follow-up D+1 (24h)
export const TEMPLATE_D2 = "a0000000-0000-0000-0000-000000000003" // Follow-up D+2 (48h)
export const TEMPLATE_D3 = "a0000000-0000-0000-0000-000000000004" // Follow-up D+3 (72h)
export const MAX_ENVIOS_LINHA_DIA = 30 // Limite estrito anti-banimento (máximo 30 msgs/linha/dia)

// Auto-pausa conversas IA inativas há mais de 1 hora para liberar o semáforo de follow-up
async function liberarConversasIAInativas(): Promise<number> {
  try {
    const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { data: presas } = await wsupabase
      .from("conversations_ia")
      .select("id")
      .eq("ai_responding", true)
      .neq("channel", "test")
      .lt("last_message_at", umaHoraAtras)
      .limit(300)

    if (!presas || presas.length === 0) return 0
    const ids = presas.map((c) => c.id)
    for (let i = 0; i < ids.length; i += 100) {
      await wsupabase.from("conversations_ia").update({ ai_responding: false }).in("id", ids.slice(i, i + 100))
    }
    await createLog({
      automation_id: null,
      event_type: "ia_inativa_auto_pausa",
      event_title: `Auto-pausa IA: ${ids.length} conversas liberadas para follow-up`,
      event_description: `Conversas sem resposta do lead há mais de 1h tiveram ai_responding desmarcado para permitir a régua D+1, D+2 e D+3.`,
    })
    return ids.length
  } catch {
    return 0
  }
}

// Cria jobs da esteira de Follow-up D+1 (24h), D+2 (48h) e D+3 (72h):
// Garante progressão sequencial sem pular etapas, com teto de 30 msgs/linha/dia
// e cancelamento automático se o cliente responder ou houver interação humana.
async function criarJobsFollowup(automation: any, results: { created: number }, skipIA: Set<string> | null): Promise<void> {
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
    if (ultima.timestamp && new Date(ultima.timestamp).getTime() > new Date(d2.sent_at).getTime()) {
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
    if (ultima.timestamp && new Date(ultima.timestamp).getTime() > new Date(d1.sent_at).getTime()) {
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

interface RejectionBreakdown {
  has_active_job: number
  conditions_not_met: number
  human_interaction_recent: number
  no_leads_found: number
  insert_error: number
  ia_in_conversa: number
}

// Núcleo do worker — chamado pelo botão manual (POST) e pelo cron (GET autenticado).
// Roleta fixa por lead: quando a automação lista N conexões em
// trigger_config.connection_ids, cada lead usa SEMPRE a mesma (hash do id) —
// o lead reconhece o número e a carga divide ~50/50. Sem a lista, usa a
// conexão única de sempre (zero impacto para as demais automações).
function escolherConexaoAutomacao(automation: any, lead: { id: string }): string | null {
  const lista = automation?.trigger_config?.connection_ids
  if (Array.isArray(lista) && lista.length > 1 && lead?.id) {
    const s = String(lead.id)
    let h = 0
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
    return lista[h % lista.length] ?? null
  }
  return automation?.whatsapp_connection_id ?? null
}

export async function runWorker() {
  const runStart = Date.now()
  try {
    // 0. Auto-pausa conversas IA inativas há mais de 1h (destrava o semáforo de leads parados)
    await liberarConversasIAInativas()

    const automations = await getActiveAutomations()
    // Auto-cura: jobs presos em "processing" (rodada morta no meio) voltam à
    // fila se travados há +30min. Sem isso acumulam para sempre e a fila morre.
    // + Restauração de configs zeradas (conexão/apelido de follow-up): valores
    //   corretos conhecidos; tudo registrado em log para auditoria.
    try {
      const limite = new Date(Date.now() - 30 * 60000).toISOString()
      const { data: presos } = await wsupabase.from("automation_jobs").select("id").eq("status", "processing").lt("processing_started_at", limite).limit(500)
      const ids = ((presos ?? []) as { id: string }[]).map((j) => j.id)
      if (ids.length) {
        for (let i = 0; i < ids.length; i += 100) {
          await wsupabase.from("automation_jobs").update({ status: "scheduled" }).in("id", ids.slice(i, i + 100))
        }
        await createLog({
          automation_id: null,
          event_type: "worker_presos_liberados",
          event_title: `Jobs presos liberados (${ids.length})`,
          event_description: "Voltaram para scheduled; saem nas próximas rodadas.",
        })
      }
      // Conexão zerada fora do app? Restaura para a instância da IA (Patricia).
      const { data: autosCfg } = await wsupabase.from("automations").select("id,name,whatsapp_connection_id,trigger_type,trigger_config").is("deleted_at", null)
      const { data: instsCfg } = await wsupabase.from("whatsapp_instancias").select("id,instance_name")
      const patri = ((instsCfg ?? []) as { id: string; instance_name: string }[]).find((x) => x.instance_name.toLowerCase().startsWith("patricia"))
      const mae = ((autosCfg ?? []) as { id: string; trigger_type: string }[]).find((a) => a.trigger_type === "lead_inactive")
      for (const a of ((autosCfg ?? []) as { id: string; name: string; whatsapp_connection_id: string | null; trigger_type: string; trigger_config: Record<string, unknown> | null }[])) {
        const patch: Record<string, unknown> = {}
        if (!a.whatsapp_connection_id && patri) patch.whatsapp_connection_id = patri.id
        if (a.trigger_type === "no_response_followup") {
          const cfg = a.trigger_config ?? {}
          if (!cfg.parent_automation_id && mae) {
            patch.trigger_config = { ...cfg, parent_automation_id: mae.id, no_response_hours: (cfg.no_response_hours as number | undefined) ?? 24 }
          }
        }
        if (Object.keys(patch).length > 0) {
          await wsupabase.from("automations").update(patch).eq("id", a.id)
          await createLog({
            automation_id: a.id,
            event_type: "worker_config_restaurada",
            event_title: `Config restaurada sozinha: ${a.name}`,
            event_description: `Campos zerados fora do app foram recompostos (${Object.keys(patch).join(", ")}).`,
          })
        }
      }
    } catch { /* auto-cura nunca derruba a rodada */ }

    const results = {
      evaluated: 0,
      created: 0,
      processed: 0,
      sent: 0,
      failed: 0,
      cancelled: 0,
      blocked_hour: 0,
    }
    // Conta-gotas anti-ban: maxDuration Pro (300s) comporta ~10 envios com
    // 15-25s entre eles + avaliação; o teto diário segue valendo.
    const MAX_ENVIOS_POR_RODADA = 10
    let enviadosNestaRodada = 0
    const rejections: RejectionBreakdown = {
      has_active_job: 0,
      conditions_not_met: 0,
      human_interaction_recent: 0,
      no_leads_found: 0,
      insert_error: 0,
      ia_in_conversa: 0,
    }
    const rejectionDetails: { lead_id: string; lead_nome: string; reason: string }[] = []

    // Marca do workspace para {{nome_imobiliaria}} (white-label: nunca fixa no código).
    let nomeImobiliaria = "nossa imobiliária"
    try {
      const { data: ws } = await wsupabase.from("workspace_settings").select("brand_name").eq("id", "main").maybeSingle()
      const nb = String((ws as { brand_name?: unknown } | null)?.brand_name ?? "").trim()
      if (nb) nomeImobiliaria = nb
    } catch { /* fallback neutro */ }

    // Follow-up tem gatilho próprio (jobs sem resposta), não o pool bruto de leads.
    const automacoesNormais = automations.filter((a) => a.trigger_type !== "no_response_followup")
    const automacoesFollowup = automations.filter((a) => a.trigger_type === "no_response_followup")

    // Semáforo IA x Automação: se alguma IA ativa coordena com a automação, pula leads
    // com conversa IA ativa (ai_responding=true) tanto na reativação quanto no follow-up.
    const skipIA = (await coordenarComIA()) ? await leadsComIAAtiva() : null
    const tagsFollowUp = await tagsDeFollowUp()

    // FASE 1: Avaliar leads elegíveis e criar jobs
    for (const automation of automacoesNormais) {
      // FILA MÍNIMA (20/linha/dia, teto 25): projeta o dia por conexão
      // (enviados + agendados p/ hoje) e aprofunda a avaliação (páginas de 150,
      // até 600) até cada linha projetar o mínimo — havendo elegíveis.
      // Guardas de elegibilidade continuam soberanas; aqui só se busca fundo.
      const META_MINIMA_LINHA = 20
      const LIMITE_AVALIACAO = 600
      const TAM_PAGINA = 150
      const listaConexoes = Array.isArray(automation?.trigger_config?.connection_ids) && automation.trigger_config.connection_ids.length > 1
        ? (automation.trigger_config.connection_ids as string[])
        : automation?.whatsapp_connection_id ? [automation.whatsapp_connection_id as string] : []
      const projetado = new Map<string, number>(listaConexoes.map((c) => [c, 0]))
      try {
        const fmtD = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
        const [aB, mB, dB] = fmtD.format(new Date()).split("-").map(Number)
        const iniDia = new Date(Date.UTC(aB, mB - 1, dB, 3, 0, 0)).toISOString()
        const fimDia = new Date(Date.UTC(aB, mB - 1, dB + 1, 3, 0, 0)).toISOString()
        const { data: envHoje } = await wsupabase.from("automation_jobs")
          .select("metadata").eq("automation_id", automation.id)
          .gte("sent_at", iniDia).in("status", ["sent", "delivered", "read", "responded"]).limit(5000)
        for (const j of (envHoje ?? []) as { metadata?: Record<string, unknown> }[]) {
          const c = String(j.metadata?.["connection_id"] ?? automation.whatsapp_connection_id ?? "")
          if (c && projetado.has(c)) projetado.set(c, (projetado.get(c) ?? 0) + 1)
        }
        const { data: agHoje } = await wsupabase.from("automation_jobs")
          .select("lead_id").eq("automation_id", automation.id)
          .in("status", ["scheduled", "retrying", "blocked_hour"]).lt("scheduled_at", fimDia).limit(5000)
        for (const j of (agHoje ?? []) as { lead_id: string }[]) {
          const c = escolherConexaoAutomacao(automation, { id: j.lead_id })
          if (c && projetado.has(c)) projetado.set(c, (projetado.get(c) ?? 0) + 1)
        }
      } catch { /* projeção best-effort: sem ela, avalia 1 página como antes */ }
      const metaBatida = () => listaConexoes.length === 0 || listaConexoes.every((c) => (projetado.get(c) ?? 0) >= META_MINIMA_LINHA)
      let avaliadosFase = 0
      let pagina = 0
      // Teto por rodada: avaliar tudo (700+ leads × N queries) estoura os 300s.
      // Mais antigos primeiro = fila justa; o resto entra nas próximas rodadas (30min).
      let leads: any[] | null = null
      let leadsErr: { message?: string } | null = null
      // eslint-disable-next-line no-constant-condition
      while (true) {
      const { data: leadsPag, error: leadsErrPag } = await wsupabase
        .from("leads")
        .select("id, nome, telefone, temperatura, status, origem, corretor_id, criado_em, gestor_responsavel, arquivado_em, fechado_em, referencias")
        .in("status", ["em_atendimento", "em_automacao"])
        .is("arquivado_em", null)
        .is("fechado_em", null)
        .order("atualizado_em", { ascending: true, nullsFirst: false })
        .range(pagina * TAM_PAGINA, pagina * TAM_PAGINA + TAM_PAGINA - 1)
      leads = leadsPag
      leadsErr = leadsErrPag
      if (leadsErr) {
        await createLog({
          automation_id: automation.id,
          event_type: "lead_not_eligible",
          event_title: "Erro ao buscar leads",
          event_description: leadsErr.message ?? "erro desconhecido",
        })
        break
      }
      if (!leads || leads.length === 0) {
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

      for (const lead of leads) {
        results.evaluated++

        // Elegibilidade por origem OU tag de follow-up: origem Tráfego Pago é o padrão;
        // tags marcadas como "Follow-up" no catálogo estendem o público para outras origens.
        const temTagFollowUp = tagsFollowUp.size > 0 && tagsDoLead(lead.referencias).some((t) => tagsFollowUp.has(t))
        if (lead.origem !== "Tráfego Pago" && !temTagFollowUp) {
          continue
        }

        // 1. Verificar job ativo (idempotência)
        if (await hasActiveJob(lead.id, automation.id)) {
          rejections.has_active_job++
          rejectionDetails.push({ lead_id: lead.id, lead_nome: lead.nome, reason: "Job ativo já existe" })
          continue
        }

        // 1-b. Semáforo IA x Automação: lead com conversa IA ativa é atendido pela IA, não pela automação.
        if (leadTemIAAtiva(skipIA, lead)) {
          rejections.ia_in_conversa++
          rejectionDetails.push({ lead_id: lead.id, lead_nome: lead.nome, reason: "Conversa IA ativa (coordenado)" })
          await createLog({
            automation_id: automation.id,
            lead_id: lead.id,
            event_type: "lead_not_eligible",
            event_title: "Lead não elegível (IA ativa)",
            event_description: `${lead.nome} possui conversa IA ativa — automação coordenada com a IA (desative em Regras → PARALELO para enviar também)`,
          })
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
              event_description: `Agendado para ${new Date(scheduledAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
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
          if (linhaJob && projetado.has(linhaJob)) projetado.set(linhaJob, (projetado.get(linhaJob) ?? 0) + 1)
          await createLog({
            automation_id: automation.id,
            lead_id: lead.id,
            event_type: "job_created",
            event_title: "Job criado na fila",
            event_description: `Lead: ${lead.nome} | Agendado: ${new Date(scheduledAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
            new_status: "scheduled",
            payload: { scheduled_at: scheduledAt, lead_nome: lead.nome },
          })
        } else if (String(error.message || "").includes("duplicate") || String((error as { code?: string }).code || "") === "23505") {
          // Corrida entre rodadas simultâneas: outra rodada criou primeiro
          // (índice único parcial). Não é erro — conta como job ativo.
          rejections.has_active_job++
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
      } // fim dos leads da página
      avaliadosFase += leads.length
      if (leads.length < TAM_PAGINA) break // esgotou o pool
      if (avaliadosFase >= LIMITE_AVALIACAO) break // teto de segurança da rodada
      if (metaBatida()) break // fila mínima atingida nas linhas
      pagina++
      } // fim da paginação (fila mínima)
      // Shortfall: nem com busca funda bateu o mínimo — registra p/ o dashboard.
      if (!metaBatida() && listaConexoes.length > 0) {
        await createLog({
          automation_id: automation.id,
          event_type: "fila_minima_shortfall",
          event_title: `Fila mínima não atingida (${META_MINIMA_LINHA}/linha)`,
          event_description: `Projetado hoje: ${listaConexoes.map((c) => `${c.slice(0, 8)}=${projetado.get(c) ?? 0}`).join(", ")} | avaliados: ${avaliadosFase} | rejeições: IA=${rejections.ia_in_conversa} cond=${rejections.conditions_not_met} jobAtivo=${rejections.has_active_job} humanaRecente=${rejections.human_interaction_recent}`,
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

    // FASE 1-B: Criar jobs de follow-up (leads sem resposta da automação-mãe)
    for (const automation of automacoesFollowup) {
      await criarJobsFollowup(automation, results, skipIA)
    }

    await createLog({
      automation_id: null,
      event_type: "lead_evaluated",
      event_title: "FASE 1-B follow-up concluída",
      event_description: `Automações follow-up: ${automacoesFollowup.length} | Jobs follow-up criados nesta run`,
      payload: { followup_automations: automacoesFollowup.map((a) => a.id) },
    })

    // FASE 2: Processar jobs agendados
    const semConexaoAvisada = new Set<string>()
    let jobsToProcess = await getJobsToProcess()

    // Contingência queda WhatsApp: automação cuja instância está DESCONECTADA
    // não envia nesta rodada — os jobs seguem scheduled (retoma de onde parou).
    // Sem isso, cada rodada queimava tentativas no vazio até falhar tudo.
    try {
      const { data: insts } = await wsupabase.from("whatsapp_instancias").select("id,instance_name")
      const nomePorId = new Map(((insts ?? []) as { id: string; instance_name: string }[]).map((i) => [i.id, i.instance_name]))
      const saude = new Map<string, boolean>()
      const checar = async (instanceName: string): Promise<boolean> => {
        try {
          const { evolutionConfig } = await import("@/lib/whatsapp/server")
          const cfg = evolutionConfig()
          if (!cfg.ok) return false
          const res = await fetch(`${cfg.url}/instance/connectionState/${encodeURIComponent(instanceName)}`, {
            headers: { apikey: cfg.key },
            signal: AbortSignal.timeout(8000),
          })
          if (!res.ok) return false
          const j = await res.json().catch(() => null)
          return (j as { instance?: { state?: string } } | null)?.instance?.state === "open"
        } catch {
          return false
        }
      }
      const antes = jobsToProcess.length
      const idsBloqueados = new Set<string>()
      for (const job of jobsToProcess) {
        const automation = automations.find((a) => a.id === job.automation_id)
        const inst = automation?.whatsapp_connection_id ? nomePorId.get(automation.whatsapp_connection_id) : undefined
        if (!inst) continue
        if (!saude.has(inst)) saude.set(inst, await checar(inst))
        if (!saude.get(inst)) idsBloqueados.add(job.id)
      }
      if (idsBloqueados.size > 0) {
        jobsToProcess = jobsToProcess.filter((j) => !idsBloqueados.has(j.id))
        await createLog({
          automation_id: null,
          event_type: "worker_instancia_morta",
          event_title: "Instância desconectada — envios pausados",
          event_description: `Sem envio nesta rodada: instância(s) fora do ar. ${idsBloqueados.size} job(s) mantidos em fila (de ${antes}). Retoma sozinho ao reconectar.`,
        })
      } else if (antes > 0) {
        // Retomada: havia backlog e está tudo conectado — registra a volta.
        const { data: rec } = await wsupabase.from("automation_logs").select("id").eq("event_type", "worker_instancia_morta").gte("created_at", new Date(Date.now() - 48 * 3600000).toISOString()).limit(1)
        if ((rec ?? []).length > 0) {
          await createLog({
            automation_id: null,
            event_type: "worker_instancia_volto",
            event_title: "Instância reconectada — retomando fila",
            event_description: `Conexão OK. ${antes} job(s) na fila serão processados nas próximas rodadas (respeitando teto e espaçamento).`,
          })
        }
      }
    } catch { /* contingência nunca derruba a rodada */ }

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
          .select("id, nome, telefone, temperatura, status, origem, corretor_id, criado_em, gestor_responsavel, arquivado_em, fechado_em, referencias")
          .eq("id", job.lead_id)
          .maybeSingle()

        if (!lead) {
          await cancelJob(job.id, "Lead não encontrado", "system")
          results.cancelled++
          continue
        }

        // Automações normais exigem em_atendimento/em_automacao; follow-up aceita em_atendimento/em_automacao/em_followup
        // (em_automacao incluído: é onde a mãe estaciona o lead após a msg1)
        const isFollowup = automation.trigger_type === "no_response_followup"
        const validStatuses = isFollowup ? ["em_atendimento", "em_automacao", "em_followup"] : ["em_atendimento", "em_automacao"]
        const temTagFollowUp = tagsFollowUp.size > 0 && tagsDoLead(lead.referencias).some((t) => tagsFollowUp.has(t))
        if (!validStatuses.includes(lead.status) || (lead.origem !== "Tráfego Pago" && !temTagFollowUp) || lead.fechado_em || lead.arquivado_em) {
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

        // Suporta template dinâmico por etapa da régua (D+1, D+2, D+3) ou o template padrão da regra
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
          const { data: corretor } = await wsupabase.from("usuarios").select("nome").eq("id", lead.corretor_id).maybeSingle()
          corretorNome = corretor?.nome ?? ""
        }

        const rendered = renderMessage(template.content, {
          lead: { nome: lead.nome, telefone: lead.telefone, origem: lead.origem },
          corretor: { nome: corretorNome },
          imobiliaria: nomeImobiliaria,
        })

        // Teto de segurança anti-banimento: MÁXIMO 30 msgs/linha/dia (em horário de Brasília)
        const fmtDia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
        const [anoB, mesB, diaB] = fmtDia.format(new Date()).split("-").map(Number)
        const todayStart = new Date(Date.UTC(anoB, mesB - 1, diaB, 3, 0, 0))

        const listaConexoes: string[] =
          Array.isArray(automation?.trigger_config?.connection_ids) && automation.trigger_config.connection_ids.length > 0
            ? (automation.trigger_config.connection_ids as string[])
            : automation?.whatsapp_connection_id ? [automation.whatsapp_connection_id as string] : []

        const countEnviosHojeLinha = async (cId: string): Promise<number> => {
          const { count } = await wsupabase
            .from("automation_jobs")
            .select("id", { count: "exact", head: true })
            .gte("sent_at", todayStart.toISOString())
            .in("status", ["sent", "delivered", "read", "responded"])
            .eq("metadata->>connection_id" as never, cId as never)
          return count ?? 0
        }

        let connectionId: string | null = null

        // 1. Tenta a conexão preferencial do lead (para manter o mesmo número na conversa)
        const pref = escolherConexaoAutomacao(automation, lead)
        if (pref) {
          const enviosPref = await countEnviosHojeLinha(pref)
          if (enviosPref < MAX_ENVIOS_LINHA_DIA) {
            connectionId = pref
          }
        }

        // 2. Se a preferencial já atingiu 30, tenta a linha secundária com cota disponível
        if (!connectionId && listaConexoes.length > 0) {
          for (const c of listaConexoes) {
            const enviosC = await countEnviosHojeLinha(c)
            if (enviosC < MAX_ENVIOS_LINHA_DIA) {
              connectionId = c
              break
            }
          }
        }

        if (!connectionId) {
          // Todas as linhas disponíveis atingiram o teto estrito anti-ban de 30 msgs/dia!
          // Mantém o job em 'scheduled' para envio seguro amanhã sem risco de banimento.
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
            // Carimba a conexão usada — alimenta o teto diário por número.
            metadata: { ...((job.metadata as Record<string, unknown> | null) ?? {}), connection_id: connectionId },
          }

          if (automation.supervision_enabled && automation.supervisor_user_id) {
            const isFollowupAutomation = automation.trigger_type === "no_response_followup"
            const supervisionUpdate: Record<string, unknown> = {
              gestor_responsavel: automation.supervisor_user_id,
            }
            // Follow-up: NÃO força status — lead permanece em_followup até responder.
            // Automação: NÃO puxa de volta — lead em estágio de máquina
            // (em_automacao/atendimento_ia/em_followup) fica onde está; só o dono é definido.
            // Sem isso a supervisão desfazia a movimentação do próprio envio.
            const estagioMaquina = ["em_automacao", "atendimento_ia", "em_followup"].includes(String((lead as { status?: unknown }).status ?? ""))
            if (!isFollowupAutomation && !estagioMaquina) {
              supervisionUpdate.status = "em_atendimento"
            }
            const { error: supErr } = await wsupabase
              .from("leads")
              .update(supervisionUpdate)
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
                  .replaceAll("{{data_atual}}", new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }))
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
          enviadosNestaRodada++
          // Respiro anti-ban humanizado entre envios (25 a 45 segundos simulando digitação real).
          await new Promise((r) => setTimeout(r, 25000 + Math.random() * 20000))

          // Ordem do fluxo: enviou a reativação → lead vai para Em Automação + tag.
          // (Só reativação lead_inactive; follow-up tem regra própria de etapa.)
          // Best-effort: nunca derruba a contabilização do envio.
          if (automation.trigger_type === "lead_inactive" && (lead as { status?: unknown }).status === "em_atendimento") {
            try {
              const { data: leadAtual } = await wsupabase.from("leads").select("observacoes,referencias").eq("id", job.lead_id).maybeSingle()
              const base = (leadAtual ?? {}) as { observacoes?: unknown; referencias?: unknown }
              const refs = Array.isArray(base.referencias) ? [...(base.referencias as { ref: string }[])] : []
              if (!refs.some((r) => String(typeof r === "string" ? r : (r as { ref?: unknown })?.ref ?? "").toLowerCase() === "automacao")) refs.push({ ref: "automacao" })
              const obsMove = `${String(base.observacoes ?? "").trim()}\n[Automação] Mensagem de reativação de base enviada — lead movido para "Em Automação" (frio). Se responder, a IA assume em "Atendimento IA".`.trim().slice(-6000)
              await wsupabase.from("leads").update({ status: "em_automacao", temperatura: "frio", observacoes: obsMove, referencias: refs, atualizado_em: new Date().toISOString() }).eq("id", job.lead_id).eq("status", "em_atendimento")
              await createLog({
                automation_id: automation.id,
                job_id: job.id,
                lead_id: job.lead_id,
                event_type: "lead_moved_automacao",
                event_title: "Lead movido para Em Automação",
                event_description: `${lead.nome} saiu de em_atendimento e entrou em "Em Automação" após o envio da reativação.`,
              })
            } catch { /* best-effort */ }
          }
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
      } catch (jobErr) {
        // Um job problemático NUNCA pode matar a rodada inteira (era assim que
        // jobs ficavam presos em "processing" e o resumo sumia). Volta para a
        // fila e registra — a rodada segue para os próximos.
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
        } catch { /* best-effort */ }
        results.failed++
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
