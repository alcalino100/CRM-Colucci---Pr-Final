import { describe, it, expect } from "vitest"
import {
  matchesLocacaoQuery,
  filterLocacaoLeads,
  sortLocacaoLeads,
  hasActiveLocacaoFilters,
  INITIAL_LOCACAO_FILTERS,
} from "@/components/kanban-locacao/kanban-locacao-utils"
import type { LocacaoLead } from "@/lib/locacao-labels"

function makeMockLocacaoLead(overrides: Partial<LocacaoLead> = {}): LocacaoLead {
  const base: LocacaoLead = {
    id: "lead-loc-1",
    nome: "Carlos Eduardo",
    telefone: "11987654321",
    email: "carlos@example.com",
    status: "novo",
    temperatura: "quente",
    origem: "WhatsApp",
    corretorId: "corretor-1",
    tipoImovelDesejado: "Apartamento",
    quartos: "2",
    garantia: "Caução",
    aluguelMax: 3000,
    bairrosDesejados: ["Centro", "Jardins"],
    imovelRef: "AP-101",
    referencias: [{ ref: "AP-101", principal: true }],
    observacoes: "Procura ap mobiliado",
    interacoes: [],
    criadoEm: "2026-03-01T10:00:00Z",
    atualizadoEm: "2026-03-02T10:00:00Z",
  }
  return { ...base, ...overrides }
}

describe("kanban-locacao-utils", () => {
  describe("matchesLocacaoQuery", () => {
    const lead = makeMockLocacaoLead()

    it("matches empty query", () => {
      expect(matchesLocacaoQuery(lead, "")).toBe(true)
      expect(matchesLocacaoQuery(lead, "   ")).toBe(true)
    })

    it("matches name case-insensitively", () => {
      expect(matchesLocacaoQuery(lead, "carlos")).toBe(true)
      expect(matchesLocacaoQuery(lead, "EDUARDO")).toBe(true)
      expect(matchesLocacaoQuery(lead, "marina")).toBe(false)
    })

    it("matches phone by digits", () => {
      expect(matchesLocacaoQuery(lead, "(11) 98765-4321")).toBe(true)
      expect(matchesLocacaoQuery(lead, "987654321")).toBe(true)
    })

    it("matches reference", () => {
      expect(matchesLocacaoQuery(lead, "AP-101")).toBe(true)
    })

    it("matches observation notes", () => {
      expect(matchesLocacaoQuery(lead, "mobiliado")).toBe(true)
    })
  })

  describe("filterLocacaoLeads", () => {
    const lead1 = makeMockLocacaoLead({ id: "1", status: "novo", temperatura: "quente", aluguelMax: 2500 })
    const lead2 = makeMockLocacaoLead({
      id: "2",
      nome: "Mariana Souza",
      status: "visita agendada",
      temperatura: "frio",
      aluguelMax: 4000,
      bairrosDesejados: ["Moema"],
      arquivadoEm: "2026-03-01T00:00:00Z",
    })

    it("filters out archived leads by default", () => {
      const res = filterLocacaoLeads([lead1, lead2], INITIAL_LOCACAO_FILTERS)
      expect(res).toHaveLength(1)
      expect(res[0].id).toBe("1")
    })

    it("includes archived leads when showArchived is true", () => {
      const res = filterLocacaoLeads([lead1, lead2], {
        ...INITIAL_LOCACAO_FILTERS,
        showArchived: true,
      })
      expect(res).toHaveLength(2)
    })

    it("filters by temperatura", () => {
      const res = filterLocacaoLeads([lead1, lead2], {
        ...INITIAL_LOCACAO_FILTERS,
        showArchived: true,
        tempFilter: "frio",
      })
      expect(res).toHaveLength(1)
      expect(res[0].id).toBe("2")
    })

    it("filters by max rent", () => {
      const res = filterLocacaoLeads([lead1, lead2], {
        ...INITIAL_LOCACAO_FILTERS,
        showArchived: true,
        aluguelMaxFilter: "3000",
      })
      expect(res).toHaveLength(1)
      expect(res[0].id).toBe("1")
    })
  })

  describe("sortLocacaoLeads", () => {
    it("sorts descending by atualizadoEm/criadoEm", () => {
      const leadOld = makeMockLocacaoLead({ id: "old", atualizadoEm: "2026-01-01T00:00:00Z" })
      const leadNew = makeMockLocacaoLead({ id: "new", atualizadoEm: "2026-03-01T00:00:00Z" })

      const sorted = sortLocacaoLeads([leadOld, leadNew])
      expect(sorted[0].id).toBe("new")
      expect(sorted[1].id).toBe("old")
    })
  })

  describe("hasActiveLocacaoFilters", () => {
    it("returns false for initial filters", () => {
      expect(hasActiveLocacaoFilters(INITIAL_LOCACAO_FILTERS)).toBe(false)
    })

    it("returns true when any filter is set", () => {
      expect(hasActiveLocacaoFilters({ ...INITIAL_LOCACAO_FILTERS, query: "abc" })).toBe(true)
      expect(hasActiveLocacaoFilters({ ...INITIAL_LOCACAO_FILTERS, tempFilter: "quente" })).toBe(true)
      expect(hasActiveLocacaoFilters({ ...INITIAL_LOCACAO_FILTERS, aluguelMaxFilter: "5000" })).toBe(true)
    })
  })
})
