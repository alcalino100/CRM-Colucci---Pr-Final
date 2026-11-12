import { describe, it, expect } from "vitest"
import {
  isLeadNovoNoPeriodo,
  isLeadAntigoMovimentadoNoPeriodo,
  separateCadastrosLeads,
  groupCadastrosPorDia,
  variacao,
  addDays,
  fmtDia,
  type CadastrosFilters,
} from "@/components/cadastros/cadastros-utils"
import type { Lead } from "@/lib/mock-data"

function makeMockLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    nome: "Cliente Teste",
    telefone: "11999998888",
    email: "teste@example.com",
    imovelRef: "AP-101",
    referencias: [{ ref: "AP-101", principal: true }],
    temperatura: "quente",
    origem: "Tráfego Pago",
    observacoes: "",
    status: "novo",
    corretorId: "corretor-1",
    criadoEm: "2026-11-10T10:00:00Z",
    atualizadoEm: "2026-11-10T10:00:00Z",
    interacoes: [],
    ...overrides,
  }
}

describe("cadastros-utils", () => {
  const ini = "2026-11-01"
  const fim = "2026-11-30"

  describe("isLeadNovoNoPeriodo", () => {
    it("identifies a lead created inside the period as novo", () => {
      const lead = makeMockLead({ criadoEm: "2026-11-12T08:00:00Z" })
      expect(isLeadNovoNoPeriodo(lead, ini, fim)).toBe(true)
    })

    it("does not consider a lead created in 2025 as novo in Nov/2026", () => {
      const leadAntigo = makeMockLead({
        criadoEm: "2025-05-10T10:00:00Z",
        atualizadoEm: "2026-11-12T08:00:00Z", // atualizado hoje
      })
      expect(isLeadNovoNoPeriodo(leadAntigo, ini, fim)).toBe(false)
    })
  })

  describe("isLeadAntigoMovimentadoNoPeriodo", () => {
    it("identifies lead created before ini that had activity in period", () => {
      const leadAntigo = makeMockLead({
        criadoEm: "2025-05-10T10:00:00Z",
        atualizadoEm: "2026-11-12T08:00:00Z",
      })
      expect(isLeadAntigoMovimentadoNoPeriodo(leadAntigo, ini, fim)).toBe(true)
    })

    it("returns false for a lead created inside the period", () => {
      const leadNovo = makeMockLead({
        criadoEm: "2026-11-05T10:00:00Z",
        atualizadoEm: "2026-11-12T08:00:00Z",
      })
      expect(isLeadAntigoMovimentadoNoPeriodo(leadNovo, ini, fim)).toBe(false)
    })

    it("returns false for old lead with no recent activity", () => {
      const leadInativo = makeMockLead({
        criadoEm: "2025-05-10T10:00:00Z",
        atualizadoEm: "2025-06-01T08:00:00Z",
      })
      expect(isLeadAntigoMovimentadoNoPeriodo(leadInativo, ini, fim)).toBe(false)
    })
  })

  describe("separateCadastrosLeads", () => {
    const leadNovo1 = makeMockLead({
      id: "novo-1",
      nome: "Lead Novo 1",
      criadoEm: "2026-11-10T10:00:00Z",
      atualizadoEm: "2026-11-10T10:00:00Z",
    })
    const leadNovo2 = makeMockLead({
      id: "novo-2",
      nome: "Lead Novo 2 (Hoje)",
      criadoEm: "2026-11-12T08:00:00Z",
      atualizadoEm: "2026-11-12T08:00:00Z",
    })
    const leadAntigoMovimentado = makeMockLead({
      id: "antigo-1",
      nome: "Lead Antigo com Atividade Recente",
      criadoEm: "2025-03-01T10:00:00Z",
      atualizadoEm: "2026-11-12T09:00:00Z", // atualizado hoje
    })
    const leadArquivado = makeMockLead({
      id: "arquivado-1",
      nome: "Lead Arquivado",
      criadoEm: "2026-11-11T10:00:00Z",
      arquivadoEm: "2026-11-11T11:00:00Z",
    })

    const allLeads = [leadNovo1, leadNovo2, leadAntigoMovimentado, leadArquivado]

    const baseFilters: CadastrosFilters = {
      dataInicio: ini,
      dataFim: fim,
      corretor: "todos",
      origem: "todas",
      status: "todos",
      criterioData: "criacao",
      abaLeads: "novos",
      showArchived: false,
    }

    it("does NOT mix old leads into 'novos' list", () => {
      const { novos } = separateCadastrosLeads(allLeads, baseFilters)
      expect(novos.map((l) => l.id)).toEqual(["novo-2", "novo-1"])
      expect(novos.find((l) => l.id === "antigo-1")).toBeUndefined()
    })

    it("isolates older re-engaged leads into 'antigosMovimentados'", () => {
      const { antigosMovimentados } = separateCadastrosLeads(allLeads, {
        ...baseFilters,
        abaLeads: "antigos_movimentados",
      })
      expect(antigosMovimentados.map((l) => l.id)).toEqual(["antigo-1"])
    })

    it("excludes archived leads by default", () => {
      const { novos } = separateCadastrosLeads(allLeads, baseFilters)
      expect(novos.find((l) => l.id === "arquivado-1")).toBeUndefined()
    })

    it("includes archived leads when showArchived is true", () => {
      const { novos } = separateCadastrosLeads(allLeads, { ...baseFilters, showArchived: true })
      expect(novos.find((l) => l.id === "arquivado-1")).toBeDefined()
    })

    it("renders only 'novos' when abaLeads is 'novos'", () => {
      const { exibidos } = separateCadastrosLeads(allLeads, { ...baseFilters, abaLeads: "novos" })
      expect(exibidos).toHaveLength(2)
      expect(exibidos[0].id).toBe("novo-2") // Mais recente primeiro
    })

    it("renders only 'antigosMovimentados' when abaLeads is 'antigos_movimentados'", () => {
      const { exibidos } = separateCadastrosLeads(allLeads, {
        ...baseFilters,
        abaLeads: "antigos_movimentados",
      })
      expect(exibidos).toHaveLength(1)
      expect(exibidos[0].id).toBe("antigo-1")
    })
  })

  describe("groupCadastrosPorDia", () => {
    it("groups only by criadoEm within the date range", () => {
      const leads = [
        makeMockLead({ criadoEm: "2026-11-10T10:00:00Z" }),
        makeMockLead({ criadoEm: "2026-11-10T14:00:00Z" }),
        makeMockLead({ criadoEm: "2026-11-12T08:00:00Z" }),
      ]
      const result = groupCadastrosPorDia(leads, ini, fim)
      expect(result).toHaveLength(2)
      expect(result.find((r) => r.key === "2026-11-10")?.total).toBe(2)
      expect(result.find((r) => r.key === "2026-11-12")?.total).toBe(1)
    })
  })

  describe("auxiliary helpers", () => {
    it("computes variation percentage correctly", () => {
      expect(variacao(10, 5)).toBe(100)
      expect(variacao(5, 10)).toBe(-50)
      expect(variacao(0, 10)).toBe(-100)
      expect(variacao(10, 0)).toBe(100)
      expect(variacao(0, 0)).toBeNull()
    })

    it("adds days to YYYY-MM-DD", () => {
      expect(addDays("2026-11-10", 5)).toBe("2026-11-15")
      expect(addDays("2026-11-10", -10)).toBe("2026-10-31")
    })

    it("formats dia for charts", () => {
      expect(fmtDia("2026-11-12")).toBe("12/11")
    })
  })
})
