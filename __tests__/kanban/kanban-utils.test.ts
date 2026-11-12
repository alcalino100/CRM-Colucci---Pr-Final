import { describe, expect, it } from "vitest"
import { matchesLeadQuery, leadDentroPeriodo, sortLeadsByRecentDate } from "@/lib/kanban-utils"
import type { Lead } from "@/lib/mock-data"

const leadMock: Lead = {
  id: "lead-1",
  nome: "Carlos Eduardo",
  telefone: "5518991610040",
  email: "carlos@teste.com",
  status: "novo",
  origem: "Tráfego Pago",
  temperatura: "quente",
  imovelRef: "CA-1234",
  referencias: [{ ref: "CA-1234", principal: true }, { ref: "Alphaville" }],
  observacoes: "Interesse em casa com piscina no condomínio",
  interacoes: [],
  corretorId: "corretor-1",
  criadoEm: "2026-05-10T10:00:00Z",
  atualizadoEm: "2026-05-15T15:00:00Z",
}

describe("Kanban Utils - matchesLeadQuery", () => {
  it("retorna true quando a busca está vazia", () => {
    expect(matchesLeadQuery(leadMock, "")).toBe(true)
    expect(matchesLeadQuery(leadMock, "   ")).toBe(true)
  })

  it("encontra por parte do nome (case-insensitive)", () => {
    expect(matchesLeadQuery(leadMock, "carlos")).toBe(true)
    expect(matchesLeadQuery(leadMock, "EDUARDO")).toBe(true)
    expect(matchesLeadQuery(leadMock, "Silva")).toBe(false)
  })

  it("encontra por dígitos de telefone normalizados", () => {
    expect(matchesLeadQuery(leadMock, "991610040")).toBe(true)
    expect(matchesLeadQuery(leadMock, "(18) 99161-0040")).toBe(true)
    expect(matchesLeadQuery(leadMock, "988887777")).toBe(false)
  })

  it("encontra por referências do imóvel e tags", () => {
    expect(matchesLeadQuery(leadMock, "CA-1234")).toBe(true)
    expect(matchesLeadQuery(leadMock, "Alphaville")).toBe(true)
    expect(matchesLeadQuery(leadMock, "Habiana")).toBe(false)
  })

  it("encontra por palavras presentes nas observações", () => {
    expect(matchesLeadQuery(leadMock, "piscina")).toBe(true)
    expect(matchesLeadQuery(leadMock, "apartamento")).toBe(false)
  })
})

describe("Kanban Utils - leadDentroPeriodo", () => {
  it("retorna true quando nenhum período foi informado", () => {
    expect(leadDentroPeriodo(leadMock)).toBe(true)
    expect(leadDentroPeriodo(leadMock, null, null)).toBe(true)
  })

  it("valida intervalo de datas baseado na data de atualização ou criação", () => {
    // Lead atualizadoEm é 2026-05-15
    expect(leadDentroPeriodo(leadMock, "2026-05-01", "2026-05-31")).toBe(true)
    expect(leadDentroPeriodo(leadMock, "2026-05-15", "2026-05-15")).toBe(true)
    expect(leadDentroPeriodo(leadMock, "2026-05-16", "2026-05-31")).toBe(false)
    expect(leadDentroPeriodo(leadMock, "2026-01-01", "2026-05-10")).toBe(false)
  })
})

describe("Kanban Utils - sortLeadsByRecentDate", () => {
  it("ordena os leads de forma decrescente pela data mais recente", () => {
    const leadAntigo: Lead = { ...leadMock, id: "antigo", atualizadoEm: "2026-01-01T00:00:00Z" }
    const leadRecente: Lead = { ...leadMock, id: "recente", atualizadoEm: "2026-06-01T00:00:00Z" }

    const lista = [leadAntigo, leadRecente, leadMock]
    lista.sort(sortLeadsByRecentDate)

    expect(lista[0].id).toBe("recente")
    expect(lista[1].id).toBe("lead-1")
    expect(lista[2].id).toBe("antigo")
  })
})
