// =============================================================================
// followup-creator.ts — Criação de Jobs da Régua de Follow-up (D+1, D+2, D+3)
// =============================================================================

import { wsupabase } from "@/lib/whatsapp/server"
import { calculateScheduledAt, getLastHumanInteraction, createLog } from "@/lib/automation-services"
import {
  TEMPLATE_D1,
  TEMPLATE_D2,
  TEMPLATE_D3,
  TAM_PAGINA_FOLLOWUP,
  LIMITE_VARREDURA_FOLLOWUP,
  MAX_TENTATIVAS_FOLLOWUP,
} from "./constants"
import { leadTemIAAtiva, tagsDoLead } from "./ia-coordination"
import {
  STATUS_FOLLOWUP_VALIDOS,
  STATUS_MOVER_PARA_FOLLOWUP,
  etapaDoJob,
  folgaDaFila,
  leadElegivelParaFollowup,
  leadPrecisaDaEtapa,
  leadPrecisaDeD1,
  type JobResumo,
} from "./followup-selection"

const TEMPLATE_POR_ETAPA: Record<1 | 2 | 3, string> = {
  1: TEMPLATE_D1,
  2: TEMPLATE_D2,
  3: TEMPLATE_D3,
}

const ROTULO_ETAPA: Record<1 | 2 | 3, string> = {
  1: "D+1 (Continuidade)",
  2: "D+2 (Novas Opções)",
  3: "D+3 (Fechamento Educado)",
}

const STATUS_JOB_ABERTO = ["scheduled", "retrying", "blocked_hour", "pending_validation", "processing"]
const STATUS_JOB_ENVIADO = ["sent", "delivered", "read"]

type JobEnviado = { id: string; lead_id: string; sent_at: string | null; metadata: Record<string, unknown> | null }

type LeadRow = {
  id: string
  nome: string
  status: string
  origem: string | null
  telefone: string | null
  corretor_id: string | null
  arquivado_em: string | null
  fechado_em: string | null
  referencias: unknown
}

const LEAD_COLUNAS = "id, nome, status, origem, telefone, corretor_id, arquivado_em, fechado_em, referencias"

function dataBR(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
}

function emLotes<T>(lista: T[], tamanho: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < lista.length; i += tamanho) out.push(lista.slice(i, i + tamanho))
  return out
}

/** Histórico de jobs desta automação por lead — uma consulta por lote, não uma por lead. */
async function jobsPorLead(automationId: string, leadIds: string[]): Promise<Map<string, JobResumo[]>> {
  const mapa = new Map<string, JobResumo[]>()
  for (const lote of emLotes(Array.from(new Set(leadIds)), TAM_PAGINA_FOLLOWUP)) {
    const { data } = await wsupabase
      .from("automation_jobs")
      .select("lead_id, status, failure_code, failure_reason, metadata")
      .eq("automation_id", automationId)
      .in("lead_id", lote)
    for (const j of (data ?? []) as (JobResumo & { lead_id: string })[]) {
      const lista = mapa.get(j.lead_id) ?? []
      lista.push(j)
      mapa.set(j.lead_id, lista)
    }
  }
  return mapa
}

async function leadsPorId(ids: string[]): Promise<Map<string, LeadRow>> {
  const mapa = new Map<string, LeadRow>()
  for (const lote of emLotes(Array.from(new Set(ids)), TAM_PAGINA_FOLLOWUP)) {
    const { data } = await wsupabase.from("leads").select(LEAD_COLUNAS).in("id", lote)
    for (const l of (data ?? []) as LeadRow[]) mapa.set(l.id, l)
  }
  return mapa
}

/**
 * Entrada na régua: o lead sai de Em Automação / Em Atendimento / Novo e passa a "Em Follow-up".
 * Daí valem as regras de saída que já existem: D+3 sem retorno → Frio; parado 7 dias → Perdido.
 * Reinicia atualizado_em para a contagem dos 7 dias começar na entrada (nada é perdido de surpresa).
 */
async function moverParaFollowup(automationId: string, lead: LeadRow): Promise<void> {
  if (!(STATUS_MOVER_PARA_FOLLOWUP as readonly string[]).includes(lead.status)) return
  const { data } = await wsupabase
    .from("leads")
    .update({ status: "em_followup", atualizado_em: new Date().toISOString() })
    .eq("id", lead.id)
    .eq("status", lead.status)
    .select("id")
  if ((data ?? []).length > 0 && lead.status === "em_automacao") {
    await createLog({
      automation_id: automationId,
      lead_id: lead.id,
      event_type: "lead_moved_followup",
      event_title: `Lead saiu de Em Automação para Em Follow-up: ${lead.nome}`,
      event_description: "Entrou na régua D+1, D+2, D+3. Sem retorno ao final, segue para Frio.",
    })
  }
}

async function inserirJobFollowup(
  automation: any,
  lead: LeadRow,
  etapa: 1 | 2 | 3,
  scheduledAt: string,
  jobAnteriorId?: string
): Promise<boolean> {
  const metadata: Record<string, unknown> = {
    step: etapa,
    followup_stage: `D+${etapa}`,
    template_id: TEMPLATE_POR_ETAPA[etapa],
  }
  if (jobAnteriorId) metadata.previous_job_id = jobAnteriorId

  const { error } = await wsupabase.from("automation_jobs").insert({
    automation_id: automation.id,
    lead_id: lead.id,
    assigned_agent_id: lead.corretor_id || null,
    supervisor_user_id: automation.supervisor_user_id,
    status: "scheduled",
    scheduled_at: scheduledAt,
    eligible_at: new Date().toISOString(),
    max_attempts: MAX_TENTATIVAS_FOLLOWUP,
    metadata,
  })
  // 23505 = já existe job ativo para o lead (índice único): normal em reavaliação, ignora.
  if (error) return false

  await createLog({
    automation_id: automation.id,
    lead_id: lead.id,
    event_type: "job_created",
    event_title: `Follow-up ${ROTULO_ETAPA[etapa]} agendado: ${lead.nome}`,
    event_description:
      etapa === 1
        ? `Lead sem resposta há mais de 24h — agendado ${ROTULO_ETAPA[etapa]} para ${dataBR(scheduledAt)}`
        : `Lead sem resposta após D+${etapa - 1} — agendado ${ROTULO_ETAPA[etapa]} para ${dataBR(scheduledAt)}`,
    new_status: "scheduled",
    payload: { step: etapa, scheduled_at: scheduledAt },
  })
  return true
}

/**
 * D+2 e D+3: percorre os envios da etapa anterior (do mais antigo para o mais novo), em
 * páginas, e separa quem ainda não tem a etapa seguinte. Antes olhava só os 100 primeiros e
 * esses mesmos 100 (já tratados) ocupavam a lista para sempre, travando todo o resto.
 */
async function criarEtapaSeguinte(
  automation: any,
  etapa: 2 | 3,
  cutoffIso: string,
  scheduledAt: string,
  limite: number,
  tagsFollowUp: Set<string>
): Promise<number> {
  if (limite <= 0) return 0
  const etapaAnterior = etapa - 1
  const candidatos: { job: JobEnviado; lead: LeadRow }[] = []
  const vistos = new Set<string>()
  let offset = 0

  while (candidatos.length < limite && offset < LIMITE_VARREDURA_FOLLOWUP) {
    const { data: pagina } = await wsupabase
      .from("automation_jobs")
      .select("id, lead_id, sent_at, metadata")
      .eq("automation_id", automation.id)
      .in("status", STATUS_JOB_ENVIADO)
      .is("responded_at", null)
      .lte("sent_at", cutoffIso)
      .order("sent_at", { ascending: true })
      .range(offset, offset + TAM_PAGINA_FOLLOWUP - 1)

    const linhas = (pagina ?? []) as JobEnviado[]
    if (linhas.length === 0) break
    offset += linhas.length

    const daEtapa = linhas.filter((j) => etapaDoJob(j.metadata) === etapaAnterior)
    if (daEtapa.length > 0) {
      const ids = daEtapa.map((j) => j.lead_id)
      const historico = await jobsPorLead(automation.id, ids)
      const pendentes = daEtapa.filter((j) => leadPrecisaDaEtapa(historico.get(j.lead_id) ?? [], etapa))
      const leads = pendentes.length > 0 ? await leadsPorId(pendentes.map((j) => j.lead_id)) : new Map()

      for (const job of pendentes) {
        if (candidatos.length >= limite) break
        if (vistos.has(job.lead_id)) continue
        const lead = leads.get(job.lead_id) as LeadRow | undefined
        if (!lead || lead.status === "perdido") continue
        // Mesmo critério do envio: evita criar job que o despachante cancelaria.
        // (lead em outro estágio — ex.: já em Atendimento IA — também fica de fora)
        if (!leadElegivelParaFollowup(lead, tagsDoLead(lead.referencias), tagsFollowUp)) continue

        const ultima = await getLastHumanInteraction(lead.id)
        if (ultima.timestamp && job.sent_at && new Date(ultima.timestamp).getTime() > new Date(job.sent_at).getTime()) {
          continue
        }
        vistos.add(job.lead_id)
        candidatos.push({ job, lead })
      }
    }
    if (linhas.length < TAM_PAGINA_FOLLOWUP) break
  }

  let criados = 0
  for (const { job, lead } of candidatos) {
    if (await inserirJobFollowup(automation, lead, etapa, scheduledAt, job.id)) {
      criados++
      // Backlog: quem já passou do D+1 mas ficou preso em Em Automação entra em Follow-up agora.
      await moverParaFollowup(automation.id, lead)
    }
  }
  return criados
}

/**
 * D+1: leads parados há 24h+ nos estágios da esteira que nunca tiveram job da régua
 * (ou cujos jobs falharam só por erro transitório). Varre por páginas.
 */
async function criarD1(
  automation: any,
  cutoffIso: string,
  scheduledAt: string,
  limite: number,
  skipIA: Set<string> | null,
  tagsFollowUp: Set<string>
): Promise<number> {
  if (limite <= 0) return 0
  const agora = Date.now()
  const candidatos: LeadRow[] = []
  let offset = 0

  while (candidatos.length < limite && offset < LIMITE_VARREDURA_FOLLOWUP) {
    const { data: pagina } = await wsupabase
      .from("leads")
      .select(LEAD_COLUNAS)
      .in("status", [...STATUS_FOLLOWUP_VALIDOS])
      .is("arquivado_em", null)
      .is("fechado_em", null)
      .lte("atualizado_em", cutoffIso)
      .order("atualizado_em", { ascending: true })
      .range(offset, offset + TAM_PAGINA_FOLLOWUP - 1)

    const linhas = (pagina ?? []) as LeadRow[]
    if (linhas.length === 0) break
    offset += linhas.length

    const elegiveis = linhas.filter((l) => leadElegivelParaFollowup(l, tagsDoLead(l.referencias), tagsFollowUp))
    if (elegiveis.length > 0) {
      const historico = await jobsPorLead(automation.id, elegiveis.map((l) => l.id))
      for (const lead of elegiveis) {
        if (candidatos.length >= limite) break
        if (!leadPrecisaDeD1(historico.get(lead.id) ?? [])) continue
        if (leadTemIAAtiva(skipIA, lead)) continue
        const ultima = await getLastHumanInteraction(lead.id)
        if (ultima.timestamp && new Date(ultima.timestamp).getTime() > agora - 24 * 3600_000) continue
        candidatos.push(lead)
      }
    }
    if (linhas.length < TAM_PAGINA_FOLLOWUP) break
  }

  let criados = 0
  for (const lead of candidatos) {
    if (await inserirJobFollowup(automation, lead, 1, scheduledAt)) {
      criados++
      await moverParaFollowup(automation.id, lead)
    }
  }
  return criados
}

/**
 * Encerramento: D+3 enviado há 48h+ sem resposta → lead vai para Frio.
 * Vale para Em Follow-up e também para Em Automação (antes ficava preso lá para sempre).
 */
async function encerrarReguaConcluida(automation: any, cutoff48hIso: string): Promise<void> {
  let offset = 0
  while (offset < LIMITE_VARREDURA_FOLLOWUP) {
    const { data: pagina } = await wsupabase
      .from("automation_jobs")
      .select("id, lead_id, sent_at, metadata")
      .eq("automation_id", automation.id)
      .in("status", STATUS_JOB_ENVIADO)
      .is("responded_at", null)
      .lte("sent_at", cutoff48hIso)
      .order("sent_at", { ascending: true })
      .range(offset, offset + TAM_PAGINA_FOLLOWUP - 1)

    const linhas = ((pagina ?? []) as JobEnviado[]).filter((j) => etapaDoJob(j.metadata) === 3)
    const total = (pagina ?? []).length
    if (total === 0) break
    offset += total

    if (linhas.length > 0) {
      const leads = await leadsPorId(linhas.map((j) => j.lead_id))
      for (const fin of linhas) {
        const lead = leads.get(fin.lead_id)
        if (!lead || !["em_followup", "em_automacao"].includes(lead.status)) continue
        try {
          const { data: atual } = await wsupabase
            .from("leads")
            .select("observacoes")
            .eq("id", lead.id)
            .maybeSingle()
          const obs = `${(atual as { observacoes?: string } | null)?.observacoes ?? ""}\n[Follow-up] Régua completa D+1, D+2 e D+3 finalizada sem retorno do cliente.`.trim()
          const { data: movido } = await wsupabase
            .from("leads")
            .update({ status: "frio", observacoes: obs, atualizado_em: new Date().toISOString() })
            .eq("id", lead.id)
            .in("status", ["em_followup", "em_automacao"])
            .select("id")
          if ((movido ?? []).length > 0) {
            await createLog({
              automation_id: automation.id,
              lead_id: lead.id,
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
    if (total < TAM_PAGINA_FOLLOWUP) break
  }
}

/**
 * Cria jobs da esteira de Follow-up D+1 (24h), D+2 (48h) e D+3 (72h), com progressão
 * sequencial, teto de 30 msgs/linha/dia (no despachante) e cancelamento automático se o
 * cliente responder ou houver interação humana. A fila é limitada (MAX_FILA_FOLLOWUP) para
 * andar no ritmo da capacidade de envio; etapas mais avançadas têm prioridade.
 */
export async function criarJobsFollowup(
  automation: any,
  results: { created: number },
  skipIA: Set<string> | null,
  tagsFollowUp: Set<string> = new Set()
): Promise<void> {
  const agora = Date.now()
  const cutoff24h = new Date(agora - 24 * 3600_000).toISOString()
  const cutoff48h = new Date(agora - 48 * 3600_000).toISOString()
  const scheduledAt = calculateScheduledAt(automation.wait_config)

  const { count: abertos } = await wsupabase
    .from("automation_jobs")
    .select("id", { count: "exact", head: true })
    .eq("automation_id", automation.id)
    .in("status", STATUS_JOB_ABERTO)

  let folga = folgaDaFila(abertos ?? 0)
  const criadosPorEtapa = { d1: 0, d2: 0, d3: 0 }

  criadosPorEtapa.d3 = await criarEtapaSeguinte(automation, 3, cutoff24h, scheduledAt, folga, tagsFollowUp)
  folga -= criadosPorEtapa.d3
  criadosPorEtapa.d2 = await criarEtapaSeguinte(automation, 2, cutoff24h, scheduledAt, folga, tagsFollowUp)
  folga -= criadosPorEtapa.d2
  criadosPorEtapa.d1 = await criarD1(automation, cutoff24h, scheduledAt, folga, skipIA, tagsFollowUp)

  results.created += criadosPorEtapa.d1 + criadosPorEtapa.d2 + criadosPorEtapa.d3

  await encerrarReguaConcluida(automation, cutoff48h)

  await createLog({
    automation_id: automation.id,
    event_type: "lead_evaluated",
    event_title: "Régua de follow-up — resumo da rodada",
    event_description: `Fila aberta: ${abertos ?? 0} | Novos jobs — D+1: ${criadosPorEtapa.d1}, D+2: ${criadosPorEtapa.d2}, D+3: ${criadosPorEtapa.d3}`,
    payload: { fila_aberta: abertos ?? 0, ...criadosPorEtapa },
  })
}
