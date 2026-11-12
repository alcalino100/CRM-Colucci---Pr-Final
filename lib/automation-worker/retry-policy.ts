// =============================================================================
// retry-policy.ts — Política de retentativa de envios (funções puras)
// =============================================================================

const PADRAO_TRANSITORIO =
  /connection closed|connection reset|timed? ?out|timeout|econn|etimedout|socket|fetch failed|network|temporar|rate.?limit|too many requests|bad gateway|service unavailable/i

/**
 * Erro transitório = vale tentar de novo (instância reconectando, queda de rede, 5xx, 429).
 * Erro permanente (número sem WhatsApp, telefone inválido, conexão inexistente) NÃO é
 * retentado: repetir o envio só gasta cota e aumenta risco de banimento.
 */
export function ehFalhaTransitoria(
  code: string | null | undefined,
  message: string | null | undefined
): boolean {
  const c = String(code ?? "").toUpperCase()
  const m = String(message ?? "")

  // Resposta da Evolution dizendo que o número não existe no WhatsApp: permanente.
  if (/"exists"\s*:\s*false/i.test(m)) return false
  if (c === "INVALID_PHONE" || c === "CONNECTION_NOT_FOUND" || c === "EVOLUTION_NOT_CONFIGURED") return false

  if (c === "EXCEPTION" || c === "HTTP_429") return true
  if (/^HTTP_5\d\d$/.test(c)) return true
  return PADRAO_TRANSITORIO.test(m)
}
