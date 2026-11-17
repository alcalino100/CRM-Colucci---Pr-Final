// Resumo dos alertas de WhatsApp enviados ao gestor.
//
// Antes, cada queda de linha ou linha travada gerava uma mensagem na hora (e repetia).
// Agora o WhatsApp do gestor recebe UM resumo, no máximo 3 vezes ao dia (08h, 12h e 18h de Brasília).
// O painel do CRM continua avisando na hora; só o WhatsApp foi agrupado.
// Cron (UTC, Brasília = UTC-3): "0 11,15,21 * * *".

export const HORAS_RESUMO_BRT = [8, 12, 18]
// Linha "desconectada" há mais que isso é tratada como desativada (ex.: ex-corretor) e não entra no resumo.
export const JANELA_DESCONECTADA_DIAS = 3

export interface LinhaCaida {
  nome: string
  instanceName: string
  desdeIso: string | null
}

export interface LinhaProblema {
  nome: string
  instanceName: string
  detalhe: string
}

function desdeTexto(desdeIso: string | null, agora: Date): string {
  if (!desdeIso) return ""
  const d = new Date(desdeIso)
  if (Number.isNaN(d.getTime())) return ""
  const horas = Math.max(0, Math.round((agora.getTime() - d.getTime()) / 3600_000))
  if (horas < 1) return " (há menos de 1h)"
  if (horas < 48) return ` (há ${horas}h)`
  return ` (há ${Math.round(horas / 24)} dias)`
}

export function montarResumoAlertas(
  dados: { caidas: LinhaCaida[]; problemas: LinhaProblema[] },
  agora: Date,
): string | null {
  const { caidas, problemas } = dados
  if (caidas.length === 0 && problemas.length === 0) return null

  const horario = agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
  const partes: string[] = ["📋 RESUMO DE ALERTAS DO WHATSAPP", ""]

  if (caidas.length > 0) {
    partes.push("🔴 Desconectadas:")
    for (const c of caidas) partes.push(`• ${c.nome} (${c.instanceName})${desdeTexto(c.desdeIso, agora)}`)
    partes.push("")
  }
  if (problemas.length > 0) {
    partes.push("⚠️ Conectadas, mas sem receber mensagens / presas:")
    for (const p of problemas) partes.push(`• ${p.nome} (${p.instanceName}): ${p.detalhe}`)
    partes.push("")
  }
  partes.push(`🕒 ${horario}`, "Leads de anúncio dessas linhas podem estar se perdendo. Reconecte o quanto antes.")
  return partes.join("\n")
}
