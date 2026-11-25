/** Janela de atendimento da API oficial: só é possível enviar texto livre até 24h após a última mensagem DO CLIENTE. */
export const JANELA_HORAS = 24

export function dentroDaJanela(ultimaEntradaISO: string | null | undefined, agoraMs = Date.now()): boolean {
  if (!ultimaEntradaISO) return false
  const t = new Date(ultimaEntradaISO).getTime()
  return Number.isFinite(t) && agoraMs - t < JANELA_HORAS * 3600_000
}

export function horasRestantes(ultimaEntradaISO: string | null | undefined, agoraMs = Date.now()): number {
  if (!ultimaEntradaISO) return 0
  const t = new Date(ultimaEntradaISO).getTime()
  return Math.max(0, Math.round(((t + JANELA_HORAS * 3600_000 - agoraMs) / 3600_000) * 10) / 10)
}

export const MSG_JANELA_EXPIRADA =
  "A janela de 24h desta conversa expirou: pela API oficial só é possível enviar um modelo (template) aprovado até o cliente responder."
