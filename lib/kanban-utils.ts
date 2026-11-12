import { normalizePhone } from "@/lib/labels"
import type { Lead } from "@/lib/mock-data"

export function matchesLeadQuery(lead: Lead, query: string): boolean {
  const q = (query || "").trim().toLowerCase()
  if (!q) return true

  const qDigits = normalizePhone(query)
  if (qDigits && lead.telefone && normalizePhone(lead.telefone).includes(qDigits)) {
    return true
  }

  const refs =
    (lead.referencias?.map((r) => ("string" === typeof r ? r : r.ref)).join(" ") ?? "") +
    " " +
    (lead.imovelRef ?? "")

  return (
    lead.nome.toLowerCase().includes(q) ||
    refs.toLowerCase().includes(q) ||
    (lead.observacoes ?? "").toLowerCase().includes(q)
  )
}

export function leadDentroPeriodo(
  lead: Lead,
  dataInicio?: string | null,
  dataFim?: string | null
): boolean {
  if (!dataInicio && !dataFim) return true
  const d = lead.atualizadoEm?.slice(0, 10) ?? lead.criadoEm?.slice(0, 10) ?? ""
  if (!d) return false
  if (dataInicio && d < dataInicio) return false
  if (dataFim && d > dataFim) return false
  return true
}

export function sortLeadsByRecentDate(a: Lead, b: Lead): number {
  const da = a.atualizadoEm || a.criadoEm || ""
  const db = b.atualizadoEm || b.criadoEm || ""
  return db.localeCompare(da)
}
