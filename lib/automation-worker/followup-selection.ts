// =============================================================================
// followup-selection.ts — Regras puras de seleção da régua de follow-up (testáveis)
// =============================================================================

import { MAX_FILA_FOLLOWUP, MAX_TENTATIVAS_FOLLOWUP } from "./constants"
import { ehFalhaTransitoria } from "./retry-policy"

/** Estágios que o despachante aceita para follow-up (os demais seriam cancelados no envio). */
export const STATUS_FOLLOWUP_VALIDOS = ["em_atendimento", "em_automacao", "em_followup"] as const

/** Estágios de "máquina": o lead ainda não respondeu e está na esteira de automação. */
export const STATUS_MOVER_PARA_FOLLOWUP = ["novo", "em_atendimento", "em_automacao"] as const

export interface JobResumo {
  status: string
  failure_code?: string | null
  failure_reason?: string | null
  metadata?: Record<string, unknown> | null
}

/** Etapa da régua de um job: 1 (D+1), 2 (D+2) ou 3 (D+3). Jobs antigos sem metadata = D+1. */
export function etapaDoJob(metadata: Record<string, unknown> | null | undefined): number {
  const step = Number(metadata?.step)
  if (step === 1 || step === 2 || step === 3) return step
  const stage = String(metadata?.followup_stage ?? "")
  const m = /^D\+([123])$/.exec(stage)
  return m ? Number(m[1]) : 1
}

/**
 * Lead precisa receber o D+1? Sim se nunca teve job da régua, ou se TODOS os jobs anteriores
 * falharam por erro transitório (ex.: "Connection Closed") e ainda não estourou o limite.
 */
export function leadPrecisaDeD1(jobsDoLead: JobResumo[]): boolean {
  if (jobsDoLead.length === 0) return true
  if (jobsDoLead.length >= MAX_TENTATIVAS_FOLLOWUP) return false
  return jobsDoLead.every(
    (j) => j.status === "failed" && ehFalhaTransitoria(j.failure_code, j.failure_reason)
  )
}

/** Lead precisa da etapa 2 ou 3? Só se ainda não existe job daquela etapa. */
export function leadPrecisaDaEtapa(jobsDoLead: JobResumo[], etapa: 2 | 3): boolean {
  return !jobsDoLead.some((j) => etapaDoJob(j.metadata) === etapa)
}

/** Quantos jobs novos ainda cabem na fila da régua. */
export function folgaDaFila(jobsAbertos: number): number {
  return Math.max(0, MAX_FILA_FOLLOWUP - Math.max(0, jobsAbertos))
}

export interface LeadFollowup {
  status: string
  origem?: string | null
  telefone?: string | null
  arquivado_em?: string | null
  fechado_em?: string | null
}

/**
 * Mesmo critério que o despachante usa no envio — evita criar job que seria cancelado.
 * Origem "Tráfego Pago" OU tag marcada como Follow-up no catálogo.
 */
export function leadElegivelParaFollowup(
  lead: LeadFollowup,
  tagsDoLeadNormalizadas: string[],
  tagsFollowUp: Set<string>
): boolean {
  if (lead.arquivado_em || lead.fechado_em) return false
  if (!(STATUS_FOLLOWUP_VALIDOS as readonly string[]).includes(lead.status)) return false
  if (String(lead.telefone ?? "").replace(/\D/g, "").length < 10) return false
  const temTag = tagsFollowUp.size > 0 && tagsDoLeadNormalizadas.some((t) => tagsFollowUp.has(t))
  return lead.origem === "Tráfego Pago" || temTag
}
