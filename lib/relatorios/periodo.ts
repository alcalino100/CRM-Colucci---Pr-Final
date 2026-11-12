// lib/relatorios/periodo.ts
// Manipulação estrita de período baseada em America/Sao_Paulo via Intl.
// Funções puras sem fixar offset -03:00. Consultas sempre com gte(inicioIso) e lt(fimIso) em UTC.

export const TIMEZONE_BRT = "America/Sao_Paulo"

export interface PeriodoDiaBRT {
  ymd: string // Formato YYYY-MM-DD (America/Sao_Paulo)
  dataFormatada: string // Formato DD/MM/YYYY
  inicioIso: string // UTC ISO inclusivo correspondente a 00:00:00.000 no fuso de Brasília
  fimIso: string // UTC ISO exclusivo correspondente a 24:00:00.000 no fuso de Brasília (00:00 do dia seguinte)
}

/**
 * Retorna os componentes de ano, mês e dia no fuso America/Sao_Paulo para uma data Date.
 */
function getBRTYMD(date: Date): { year: number; month: number; day: number; ymd: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE_BRT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)

  const year = Number(parts.find((p) => p.type === "year")?.value || "2000")
  const month = Number(parts.find((p) => p.type === "month")?.value || "1")
  const day = Number(parts.find((p) => p.type === "day")?.value || "1")
  const ymd = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`

  return { year, month, day, ymd }
}

/**
 * Calcula a diferença em minutos entre UTC e America/Sao_Paulo no instante da data fornecida.
 */
function getBRTOffsetMinutes(date: Date): number {
  const str = date.toLocaleString("en-US", {
    timeZone: TIMEZONE_BRT,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  const [datePart, timePart] = str.split(", ")
  const [m, d, y] = datePart.split("/").map(Number)
  const [h, min, s] = timePart.split(":").map(Number)
  const asUtc = Date.UTC(y, m - 1, d, h, min, s)
  return (asUtc - date.getTime()) / 60000
}

/**
 * Converte um dia civil YYYY-MM-DD em America/Sao_Paulo para o instante UTC de início (00:00:00.000).
 */
function getBRTStartOfDayDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number)
  // Estimativa inicial: 03:00 UTC (correspondente ao UTC-3)
  const estimateUtc = new Date(Date.UTC(y, m - 1, d, 3, 0, 0, 0))
  const offsetMin = getBRTOffsetMinutes(estimateUtc)
  const targetUtcEpoch = Date.UTC(y, m - 1, d, 0, 0, 0, 0)
  const exactTime = targetUtcEpoch - offsetMin * 60000
  return new Date(exactTime)
}

/**
 * Retorna o dia civil anterior ao momento informado, no fuso de Brasília.
 */
export function diaAnteriorBRT(now = new Date()): { ymd: string; dataFormatada: string } {
  const currentBRT = getBRTYMD(now)
  // Subtrai 1 dia civil
  const previousUtcDate = new Date(Date.UTC(currentBRT.year, currentBRT.month - 1, currentBRT.day - 1, 12, 0, 0))
  const prevY = previousUtcDate.getUTCFullYear()
  const prevM = String(previousUtcDate.getUTCMonth() + 1).padStart(2, "0")
  const prevD = String(previousUtcDate.getUTCDate()).padStart(2, "0")

  const ymd = `${prevY}-${prevM}-${prevD}`
  const dataFormatada = `${prevD}/${prevM}/${prevY}`

  return { ymd, dataFormatada }
}

/**
 * Retorna os limites exatos [inicioIso, fimIso) para um determinado dia civil YYYY-MM-DD em America/Sao_Paulo.
 * início é 00:00:00.000 BRT (inclusivo); fim é 24:00:00.000 BRT (exclusivo).
 */
export function limitesDiaBRT(ymd: string): PeriodoDiaBRT {
  const cleanYmd = ymd.trim().slice(0, 10)
  const [y, m, d] = cleanYmd.split("-").map(Number)
  const dataFormatada = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`

  const startDate = getBRTStartOfDayDate(cleanYmd)
  // O dia seguinte é exatamente 24 horas civis depois (ou próximo dia civil)
  const nextCivilDate = new Date(Date.UTC(y, m - 1, d + 1, 12, 0, 0))
  const nextY = nextCivilDate.getUTCFullYear()
  const nextM = String(nextCivilDate.getUTCMonth() + 1).padStart(2, "0")
  const nextD = String(nextCivilDate.getUTCDate()).padStart(2, "0")
  const nextYmd = `${nextY}-${nextM}-${nextD}`
  const endDate = getBRTStartOfDayDate(nextYmd)

  return {
    ymd: cleanYmd,
    dataFormatada,
    inicioIso: startDate.toISOString(),
    fimIso: endDate.toISOString(),
  }
}

/**
 * Retorna os limites exatos [inicioIso, fimIso) para o "dia anterior" em America/Sao_Paulo.
 */
export function limitesDiaAnteriorBRT(now = new Date()): PeriodoDiaBRT {
  const { ymd } = diaAnteriorBRT(now)
  return limitesDiaBRT(ymd)
}

/**
 * Formata um timestamp ISO ou data civil para DD/MM/YYYY no fuso de Brasília.
 */
export function formatarDataBr(isoOuYmd: string): string {
  if (!isoOuYmd) return ""
  if (isoOuYmd.length === 10 && isoOuYmd.includes("-")) {
    const [y, m, d] = isoOuYmd.split("-")
    return `${d}/${m}/${y}`
  }
  try {
    const d = new Date(isoOuYmd)
    if (isNaN(d.getTime())) return isoOuYmd
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: TIMEZONE_BRT,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d)
  } catch {
    return isoOuYmd
  }
}

/**
 * Formata um timestamp ISO para HH:mm no fuso de Brasília.
 */
export function formatarHoraMinutoBr(iso: string | null | undefined): string {
  if (!iso) return "--:--"
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return "--:--"
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: TIMEZONE_BRT,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d)
  } catch {
    return "--:--"
  }
}
