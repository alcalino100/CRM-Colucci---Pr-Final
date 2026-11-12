import type { Lead, LeadStatus, Origem } from "@/lib/mock-data"

export type Periodo = { ini: string; fim: string }

export type CriterioData = "criacao" | "atividade"
export type AbaCadastros = "novos" | "antigos_movimentados" | "todos"

export interface CadastrosFilters {
  dataInicio: string
  dataFim: string
  corretor: string
  origem: Origem | "todas"
  status: LeadStatus | "todos"
  criterioData: CriterioData
  abaLeads: AbaCadastros
  showArchived: boolean
}

export function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const dia = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${dia}`
}

export function inicioSemana(d: Date): Date {
  const x = new Date(d)
  const dia = x.getDay()
  const delta = dia === 0 ? -6 : 1 - dia
  x.setDate(x.getDate() + delta)
  return x
}

export function addDays(ymdStr: string, days: number): string {
  if (!ymdStr) return ""
  const [y, m, d] = ymdStr.split("-").map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return ymd(dt)
}

export function variacao(cur: number, prev: number): number | null {
  if (prev === 0) return cur > 0 ? 100 : null
  if (cur === 0) return -100
  return ((cur - prev) / prev) * 100
}

export const PRESETS: { label: string; get: () => Periodo }[] = [
  { label: "Hoje", get: () => { const h = new Date(); return { ini: ymd(h), fim: ymd(h) } } },
  { label: "Ontem", get: () => { const h = new Date(); h.setDate(h.getDate() - 1); return { ini: ymd(h), fim: ymd(h) } } },
  { label: "Esta semana", get: () => { const h = new Date(); return { ini: ymd(inicioSemana(h)), fim: ymd(h) } } },
  {
    label: "Semana passada",
    get: () => {
      const h = new Date()
      const ini = inicioSemana(h)
      ini.setDate(ini.getDate() - 7)
      const fim = new Date(ini)
      fim.setDate(fim.getDate() + 6)
      return { ini: ymd(ini), fim: ymd(fim) }
    },
  },
  { label: "Este mês", get: () => { const h = new Date(); return { ini: ymd(new Date(h.getFullYear(), h.getMonth(), 1)), fim: ymd(h) } } },
  {
    label: "Mês passado",
    get: () => {
      const h = new Date()
      return {
        ini: ymd(new Date(h.getFullYear(), h.getMonth() - 1, 1)),
        fim: ymd(new Date(h.getFullYear(), h.getMonth(), 0)),
      }
    },
  },
  {
    label: "Últimos 7 dias",
    get: () => {
      const h = new Date()
      const ini = new Date(h)
      ini.setDate(ini.getDate() - 6)
      return { ini: ymd(ini), fim: ymd(h) }
    },
  },
  {
    label: "Últimos 30 dias",
    get: () => {
      const h = new Date()
      const ini = new Date(h)
      ini.setDate(ini.getDate() - 29)
      return { ini: ymd(ini), fim: ymd(h) }
    },
  },
  { label: "Este ano", get: () => { const h = new Date(); return { ini: ymd(new Date(h.getFullYear(), 0, 1)), fim: ymd(h) } } },
  { label: "Todos", get: () => ({ ini: "", fim: "" }) },
]

export function fmtDia(key: string): string {
  if (!key) return "—"
  const [y, m, d] = key.split("-").map(Number)
  if (!y) return key
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  })
}

export function fmtDateLead(iso?: string | null): string {
  if (!iso) return "—"
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  if (!y) return "—"
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
}

export function fmtDateTimeLead(iso?: string | null): string {
  if (!iso) return "—"
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return fmtDateLead(iso)
    return d.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return fmtDateLead(iso)
  }
}

/**
 * Retorna true se o lead foi efetivamente CADASTRADO (criado) dentro do intervalo [ini, fim].
 */
export function isLeadNovoNoPeriodo(lead: Lead, ini: string, fim: string): boolean {
  const dCriado = (lead.criadoEm || "").slice(0, 10)
  if (!dCriado) return false
  const min = ini || "0000-00-00"
  const max = fim || "9999-99-99"
  return dCriado >= min && dCriado <= max
}

/**
 * Retorna true se o lead foi criado ANTES do período, mas teve atividade (atualização) dentro do período.
 */
export function isLeadAntigoMovimentadoNoPeriodo(lead: Lead, ini: string, fim: string): boolean {
  const dCriado = (lead.criadoEm || "").slice(0, 10)
  const dAtivo = (lead.atualizadoEm || "").slice(0, 10)
  if (!dCriado || !dAtivo) return false
  const min = ini || "0000-00-00"
  const max = fim || "9999-99-99"

  // Foi criado antes do início do período selecionado
  const criadoAntes = ini ? dCriado < ini : false
  // E teve atividade dentro do período
  const ativoNoPeriodo = dAtivo >= min && dAtivo <= max

  return criadoAntes && ativoNoPeriodo
}

export interface SeparatedCadastrosLeads {
  novos: Lead[]
  antigosMovimentados: Lead[]
  todos: Lead[]
  exibidos: Lead[]
}

/**
 * Separa os leads de forma que os leads antigos nunca se misturem sem identificação clara com os novos.
 */
export function separateCadastrosLeads(
  leads: Lead[],
  filters: CadastrosFilters
): SeparatedCadastrosLeads {
  const { dataInicio, dataFim, corretor, origem, status, criterioData, abaLeads, showArchived } = filters

  const ini = dataInicio || "0000-00-00"
  const fim = dataFim || "9999-99-99"

  // Pré-filtro comum: corretor, origem, status e arquivados
  const preFiltrados = leads.filter((l) => {
    if (!showArchived && l.arquivadoEm) return false
    if (corretor !== "todos" && l.corretorId !== corretor) return false
    if (origem !== "todas" && l.origem !== origem) return false
    if (status !== "todos" && l.status !== status) return false
    return true
  })

  // 1. Leads novos (criados no período)
  const novos = preFiltrados
    .filter((l) => isLeadNovoNoPeriodo(l, ini, fim))
    .sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""))

  // 2. Leads da base anterior com atividade no período
  const antigosMovimentados = preFiltrados
    .filter((l) => isLeadAntigoMovimentadoNoPeriodo(l, ini, fim))
    .sort((a, b) => (b.atualizadoEm || "").localeCompare(a.atualizadoEm || ""))

  // 3. Conjunto completo no período
  let todos: Lead[]
  if (criterioData === "criacao") {
    // Quando o critério estrito de data for "Data de Cadastro", apenas os novos entram em 'todos'
    todos = [...novos]
  } else {
    // Quando critério for atividade ou ambos, combina novos e antigos mantendo novos em destaque
    const todosMap = new Map<string, Lead>()
    for (const l of novos) todosMap.set(l.id, l)
    for (const l of antigosMovimentados) todosMap.set(l.id, l)
    todos = Array.from(todosMap.values()).sort((a, b) => {
      // Prioriza novos cadastros no topo
      const aNovo = isLeadNovoNoPeriodo(a, ini, fim)
      const bNovo = isLeadNovoNoPeriodo(b, ini, fim)
      if (aNovo && !bNovo) return -1
      if (!aNovo && bNovo) return 1
      const da = a.criadoEm || a.atualizadoEm || ""
      const db = b.criadoEm || b.atualizadoEm || ""
      return db.localeCompare(da)
    })
  }

  // 4. Seleção da aba ativa
  let exibidos: Lead[]
  if (abaLeads === "novos") {
    exibidos = novos
  } else if (abaLeads === "antigos_movimentados") {
    exibidos = antigosMovimentados
  } else {
    exibidos = todos
  }

  return { novos, antigosMovimentados, todos, exibidos }
}

export function groupCadastrosPorDia(
  leads: Lead[],
  dataInicio: string,
  dataFim: string
): { key: string; label: string; total: number }[] {
  const m = new Map<string, number>()

  for (const l of leads) {
    const k = (l.criadoEm || "").slice(0, 10)
    if (!k) continue
    if (dataInicio && k < dataInicio) continue
    if (dataFim && k > dataFim) continue
    m.set(k, (m.get(k) ?? 0) + 1)
  }

  return Array.from(m.entries())
    .map(([key, total]) => ({ key, label: fmtDia(key), total }))
    .sort((a, b) => a.key.localeCompare(b.key))
}
