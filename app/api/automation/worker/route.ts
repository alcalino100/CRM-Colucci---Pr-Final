// =============================================================================
// POST /api/automation/worker — Worker de processamento de automações
// Execute via Vercel Cron (POST) ou chamada manual
// =============================================================================

import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"
import { getActiveAutomations, createLog } from "@/lib/automation-services"

// Re-exporta constantes e limites públicos do worker para compatibilidade com testes e rotas
export {
  TEMPLATE_D1,
  TEMPLATE_D2,
  TEMPLATE_D3,
  TEMPLATE_CONTENCAO_IA,
  AUTOMATION_CONTENCAO_IA_ID,
  MAX_ENVIOS_LINHA_DIA,
} from "@/lib/automation-worker/constants"

import {
  AUTOMATION_CONTENCAO_IA_ID,
  type RejectionBreakdown,
  type WorkerResults,
} from "@/lib/automation-worker/constants"

import {
  liberarConversasIAInativas,
  coordenarComIA,
  leadsComIAAtiva,
  tagsDeFollowUp,
} from "@/lib/automation-worker/ia-coordination"
import { executarAutoCura } from "@/lib/automation-worker/auto-cure"
import { avaliarECriarJobsReativacao } from "@/lib/automation-worker/reativacao-creator"
import { criarJobsFollowup } from "@/lib/automation-worker/followup-creator"
import { criarJobsContencaoIA } from "@/lib/automation-worker/contencao-creator"
import { despacharJobsAgendados } from "@/lib/automation-worker/job-dispatcher"

// O worker faz várias consultas + envios; Projeto Pro: 300s (conta-gotas + retries cabem).
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function runWorker() {
  const runStart = Date.now()
  try {
    // 0. Auto-pausa conversas IA inativas há mais de 1h (destrava o semáforo de leads parados)
    await liberarConversasIAInativas()

    const automations = await getActiveAutomations()

    // 0-B. Auto-cura: restaura jobs presos e configs zeradas
    await executarAutoCura()

    const results: WorkerResults = {
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
      ia_in_conversa: 0,
    }
    const rejectionDetails: { lead_id: string; lead_nome: string; reason: string }[] = []

    // Marca do workspace para {{nome_imobiliaria}} (white-label: nunca fixa no código).
    let nomeImobiliaria = "nossa imobiliária"
    try {
      const { data: ws } = await wsupabase
        .from("workspace_settings")
        .select("brand_name")
        .eq("id", "main")
        .maybeSingle()
      const nb = String((ws as { brand_name?: unknown } | null)?.brand_name ?? "").trim()
      if (nb) nomeImobiliaria = nb
    } catch {
      /* fallback neutro */
    }

    // Separação de automações por tipo
    const automacoesContencao = automations.filter(
      (a) => a.trigger_type === "atendimento_ia_stalled" || a.id === AUTOMATION_CONTENCAO_IA_ID
    )
    const automacoesFollowup = automations.filter((a) => a.trigger_type === "no_response_followup")
    const automacoesNormais = automations.filter(
      (a) =>
        a.trigger_type !== "no_response_followup" &&
        a.trigger_type !== "atendimento_ia_stalled" &&
        a.id !== AUTOMATION_CONTENCAO_IA_ID
    )

    // Semáforo IA x Automação
    const skipIA = (await coordenarComIA()) ? await leadsComIAAtiva() : null
    const tagsFollowUp = await tagsDeFollowUp()

    // FASE 1: Avaliar leads elegíveis e criar jobs de reativação
    for (const automation of automacoesNormais) {
      await avaliarECriarJobsReativacao(
        automation,
        results,
        rejections,
        rejectionDetails,
        skipIA,
        tagsFollowUp
      )
    }

    // FASE 1-B: Criar jobs de follow-up (D+1, D+2, D+3)
    for (const automation of automacoesFollowup) {
      await criarJobsFollowup(automation, results, skipIA, tagsFollowUp)
    }

    await createLog({
      automation_id: null,
      event_type: "lead_evaluated",
      event_title: "FASE 1-B follow-up concluída",
      event_description: `Automações follow-up: ${automacoesFollowup.length} | Jobs follow-up criados nesta run`,
      payload: { followup_automations: automacoesFollowup.map((a) => a.id) },
    })

    // FASE 1-C: Criar jobs de contenção IA
    for (const automation of automacoesContencao) {
      await criarJobsContencaoIA(automation, results)
    }

    if (automacoesContencao.length > 0) {
      await createLog({
        automation_id: null,
        event_type: "lead_evaluated",
        event_title: "FASE 1-C contenção IA concluída",
        event_description: `Automações contenção IA: ${automacoesContencao.length} | Jobs de contenção avaliados nesta run`,
        payload: { contencao_automations: automacoesContencao.map((a) => a.id) },
      })
    }

    // FASE 2: Processar jobs agendados com teto anti-ban e pacing
    await despacharJobsAgendados(automations, results, nomeImobiliaria, tagsFollowUp)

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

    return NextResponse.json({
      ok: true,
      results,
      rejections,
      rejection_details: rejectionDetails.slice(0, 50),
      duration_ms: durationMs,
    })
  } catch (err) {
    const durationMs = Date.now() - runStart
    await createLog({
      event_type: "lead_not_eligible",
      event_title: "Worker falhou com exceção",
      event_description: (err as Error)?.message ?? "Erro desconhecido",
      payload: { stack: (err as Error)?.stack?.slice(0, 500), duration_ms: durationMs },
    }).catch(() => {})
    return NextResponse.json(
      { ok: false, error: (err as Error)?.message ?? "Erro desconhecido" },
      { status: 500 }
    )
  }
}

// POST = disparo manual (botão "Executar Worker" no painel)
export async function POST() {
  return runWorker()
}

// GET autenticado pelo cron (Vercel Cron envia Authorization: Bearer CRON_SECRET) executa o worker.
// GET sem o segredo devolve status de saúde da esteira.
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

  const lastRun = (logsRes.data ?? []).find(
    (l) => l.event_type === "lead_evaluated" && l.event_title?.includes("resumo geral")
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
