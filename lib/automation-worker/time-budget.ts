// =============================================================================
// time-budget.ts — Orçamento de tempo do worker (funções puras)
// =============================================================================

// A rota do worker tem limite de 300 s (maxDuration). Os envios têm pausa anti-ban de
// 25–45 s, então com a fila cheia a rodada ultrapassava o limite e era cortada pela Vercel
// sem gravar o resumo. O despachante para de INICIAR envios ao chegar neste orçamento,
// deixando ~75 s de folga para terminar o envio em curso e gravar o resumo da rodada.
export const ORCAMENTO_DESPACHO_MS = 225_000

/**
 * O orçamento acaba quando o tempo já gasto (+ a pausa que viria antes do próximo envio)
 * alcança o limite. Passe a pausa para não dormir à toa por um envio que não caberia.
 */
export function orcamentoEsgotado(
  inicioMs: number,
  agoraMs: number,
  proximaPausaMs = 0,
  orcamentoMs = ORCAMENTO_DESPACHO_MS
): boolean {
  return agoraMs - inicioMs + proximaPausaMs >= orcamentoMs
}
