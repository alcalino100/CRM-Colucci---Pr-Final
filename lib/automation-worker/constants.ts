// =============================================================================
// constants.ts — Constantes, Templates e Estruturas de Dados do Worker
// =============================================================================

export const TEMPLATE_D1 = "a0000000-0000-0000-0000-000000000002" // Follow-up D+1 (24h)
export const TEMPLATE_D2 = "a0000000-0000-0000-0000-000000000003" // Follow-up D+2 (48h)
export const TEMPLATE_D3 = "a0000000-0000-0000-0000-000000000004" // Follow-up D+3 (72h)
export const TEMPLATE_CONTENCAO_IA = "a0000000-0000-0000-0000-000000000005" // Contenção IA — Resgate para Follow-up
export const AUTOMATION_CONTENCAO_IA_ID = "b0000000-0000-0000-0000-000000000003" // Automação de Contenção IA

// Limite estrito anti-banimento (máximo 30 msgs/linha/dia em horário de Brasília)
export const MAX_ENVIOS_LINHA_DIA = 30

// Conta-gotas anti-ban por rodada: ~10 envios com 25-45s entre eles + avaliação
export const MAX_ENVIOS_POR_RODADA = 10

export interface RejectionBreakdown {
  has_active_job: number
  conditions_not_met: number
  human_interaction_recent: number
  no_leads_found: number
  insert_error: number
  ia_in_conversa: number
}

export interface WorkerResults {
  evaluated: number
  created: number
  processed: number
  sent: number
  failed: number
  cancelled: number
  blocked_hour: number
}
