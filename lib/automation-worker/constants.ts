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

// --- Régua de follow-up: controle de fila e retentativa ---
// Máximo de jobs abertos (agendados/retentando/bloqueados) da régua de follow-up. Só cria
// novos jobs enquanto houver folga: a fila acompanha a capacidade de envio (30/linha/dia)
// e os leads são reavaliados no momento do envio, sem acumular dezenas de dias de backlog.
export const MAX_FILA_FOLLOWUP = 60

// Varredura paginada dos candidatos (nunca olha só os "N mais antigos": os já tratados
// ficariam sempre no começo da lista e bloqueariam os leads novos).
export const TAM_PAGINA_FOLLOWUP = 100
export const LIMITE_VARREDURA_FOLLOWUP = 1500

// Tentativas por job de follow-up quando o erro é transitório (ex.: "Connection Closed").
export const MAX_TENTATIVAS_FOLLOWUP = 3
