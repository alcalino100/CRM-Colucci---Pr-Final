import { normalizePhone } from "@/lib/locacao-labels"
import type { LocacaoLead, LocacaoStatus } from "@/lib/locacao-labels"
import type { Origem, Temperatura } from "@/lib/mock-data"

export interface LocacaoFilters {
  query: string
  tempFilter: Temperatura | "todas"
  origemFilter: Origem | "todas"
  statusFilter: LocacaoStatus | "todos"
  corretorFilter: string
  tipoFilter: string
  quartosFilter: string
  aluguelMaxFilter: string
  bairrosFilter: string
  showArchived: boolean
}

export const INITIAL_LOCACAO_FILTERS: LocacaoFilters = {
  query: "",
  tempFilter: "todas",
  origemFilter: "todas",
  statusFilter: "todos",
  corretorFilter: "todos",
  tipoFilter: "todos",
  quartosFilter: "todos",
  aluguelMaxFilter: "",
  bairrosFilter: "",
  showArchived: false,
}

export function matchesLocacaoQuery(l: LocacaoLead, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const qDigits = normalizePhone(query)
  const refs = (l.referencias?.map((r) => r.ref).join(" ") ?? "") + " " + (l.imovelRef ?? "")
  if (qDigits && normalizePhone(l.telefone).includes(qDigits)) return true
  return (
    l.nome.toLowerCase().includes(q) ||
    refs.toLowerCase().includes(q) ||
    (l.observacoes ?? "").toLowerCase().includes(q)
  )
}

export function filterLocacaoLeads(leads: LocacaoLead[], filters: LocacaoFilters): LocacaoLead[] {
  const {
    query,
    tempFilter,
    origemFilter,
    statusFilter,
    corretorFilter,
    tipoFilter,
    quartosFilter,
    aluguelMaxFilter,
    bairrosFilter,
    showArchived,
  } = filters

  return leads.filter(
    (l) =>
      (showArchived || !l.arquivadoEm) &&
      (tempFilter === "todas" || l.temperatura === tempFilter) &&
      (origemFilter === "todas" || l.origem === origemFilter) &&
      (statusFilter === "todos" || l.status === statusFilter) &&
      (corretorFilter === "todos" || l.corretorId === corretorFilter) &&
      (tipoFilter === "todos" || l.tipoImovelDesejado === tipoFilter) &&
      (quartosFilter === "todos" || l.quartos === quartosFilter) &&
      (!aluguelMaxFilter || (l.aluguelMax != null && l.aluguelMax <= Number(aluguelMaxFilter))) &&
      (!bairrosFilter || l.bairrosDesejados.some((b) => b.toLowerCase().includes(bairrosFilter.toLowerCase()))) &&
      matchesLocacaoQuery(l, query)
  )
}

export function sortLocacaoLeads(leads: LocacaoLead[]): LocacaoLead[] {
  return [...leads].sort((a, b) => {
    const da = a.atualizadoEm || a.criadoEm || ""
    const db = b.atualizadoEm || b.criadoEm || ""
    return db.localeCompare(da)
  })
}

export function hasActiveLocacaoFilters(filters: LocacaoFilters): boolean {
  return (
    filters.tempFilter !== "todas" ||
    filters.origemFilter !== "todas" ||
    filters.statusFilter !== "todos" ||
    filters.corretorFilter !== "todos" ||
    filters.tipoFilter !== "todos" ||
    filters.quartosFilter !== "todos" ||
    Boolean(filters.aluguelMaxFilter) ||
    Boolean(filters.bairrosFilter) ||
    Boolean(filters.query.trim())
  )
}
