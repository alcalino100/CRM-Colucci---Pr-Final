/**
 * Utilitários puros extraídos de automacoes/page.tsx para cálculo de período,
 * formatação de telefone, tempo relativo, status do piloto e roleta de linhas.
 */

export const MAX_ENVIOS_LINHA_DIA = 30

/**
 * Retorna a data atual no fuso de Brasília (America/Sao_Paulo) no formato YYYY-MM-DD.
 */
export function hojeBRT(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

/**
 * Hash determinístico idêntico ao do worker para prever a linha na roleta de conexões.
 */
export function indiceLinha(leadId: string, n: number): number {
  let h = 0
  const s = String(leadId ?? "")
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return n > 0 ? h % n : 0
}

/**
 * Formata tempo decorrido em minutos de forma legível.
 */
export function haQuanto(min: number | null): string {
  if (min === null || min === undefined) return "—"
  if (min < 1) return "agora mesmo"
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  return h < 24 ? `há ${h}h` : `há ${Math.floor(h / 24)}d`
}

/**
 * Formata número de telefone brasileiro para exibição amigável.
 */
export function formatarTelefone(tel: string | null | undefined): string {
  if (!tel) return "—"
  const d = tel.replace(/\D/g, "")
  const num = d.startsWith("55") && d.length > 11 ? d.slice(2) : d
  if (num.length === 11) return `(${num.slice(0, 2)}) ${num.slice(2, 7)}-${num.slice(7)}`
  if (num.length === 10) return `(${num.slice(0, 2)}) ${num.slice(2, 6)}-${num.slice(6)}`
  return tel
}

export type PilotoTone = "good" | "warn" | "crit" | "muted"

export interface PilotoStatus {
  label: string
  tone: PilotoTone
}

/**
 * Calcula o status de saúde do piloto automático com base no tempo decorrido desde a última rodada.
 */
export function calcularPilotoStatus(minutosDesdeUltima: number | null): PilotoStatus {
  if (minutosDesdeUltima === null || minutosDesdeUltima === undefined) {
    return { label: "Sem execução recente", tone: "muted" }
  }
  if (minutosDesdeUltima <= 30) {
    return { label: "Ativo & Saudável", tone: "good" }
  }
  if (minutosDesdeUltima <= 90) {
    return { label: "Aguardando próxima janela", tone: "warn" }
  }
  return { label: "Pausado ou Inativo", tone: "crit" }
}

export type PeriodoTipo = "hoje" | "ontem" | "7dias" | "30dias" | "custom"
export type PeriodoFiltro = PeriodoTipo

export interface IntervaloPeriodo {
  ini: string
  fim: string
  label: string
}

/**
 * Calcula o intervalo UTC (ISO) para filtros do painel considerando o fuso de Brasília.
 */
export function calcularIntervaloPeriodo(
  periodo: PeriodoTipo,
  dataCustom: string,
  dataBase: Date = new Date()
): IntervaloPeriodo {
  const fmtIso = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d)

  if (periodo === "hoje") {
    const d = fmtIso(dataBase)
    return { ini: `${d}T03:00:00Z`, fim: `${d}T23:59:59Z`, label: "Hoje" }
  }
  if (periodo === "ontem") {
    const ontem = new Date(dataBase)
    ontem.setDate(ontem.getDate() - 1)
    const d = fmtIso(ontem)
    return { ini: `${d}T03:00:00Z`, fim: `${d}T23:59:59Z`, label: "Ontem" }
  }
  if (periodo === "7dias") {
    const d7 = new Date(dataBase)
    d7.setDate(d7.getDate() - 6)
    return { ini: `${fmtIso(d7)}T03:00:00Z`, fim: `${fmtIso(dataBase)}T23:59:59Z`, label: "Últimos 7 dias" }
  }
  if (periodo === "30dias") {
    const d30 = new Date(dataBase)
    d30.setDate(d30.getDate() - 29)
    return { ini: `${fmtIso(d30)}T03:00:00Z`, fim: `${fmtIso(dataBase)}T23:59:59Z`, label: "Últimos 30 dias" }
  }
  return {
    ini: `${dataCustom}T03:00:00Z`,
    fim: `${dataCustom}T23:59:59Z`,
    label: dataCustom.split("-").reverse().join("/"),
  }
}
