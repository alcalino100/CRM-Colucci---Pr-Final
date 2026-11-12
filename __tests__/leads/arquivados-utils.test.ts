import { describe, expect, it } from "vitest"
import {
  calcularKpisArquivados,
  filtrarLeadsArquivados,
  gerarConteudoCsvArquivados,
  fmtDataBr,
} from "@/lib/arquivados-utils"
import type { Lead } from "@/lib/mock-data"

function makeMockLead(overrides: Partial<Lead> & { id: string; nome: string }): Lead {
  const base: Lead = {
    id: overrides.id,
    nome: overrides.nome,
    telefone: "5518991234567",
    email: "lead@teste.com",
    imovelRef: "REF01",
    referencias: [],
    temperatura: "morno",
    origem: "Tráfego Pago",
    observacoes: "",
    status: "novo",
    corretorId: "corretor-1",
    criadoEm: "2026-01-01T00:00:00Z",
    atualizadoEm: "2026-01-01T00:00:00Z",
    interacoes: [],
  }
  return { ...base, ...overrides }
}

const mockArquivados: Lead[] = [
  makeMockLead({
    id: "lead-1",
    nome: "Ana Paula",
    telefone: "5518991234567",
    email: "ana@teste.com",
    status: "novo",
    origem: "Tráfego Pago",
    temperatura: "morno",
    corretorId: "corretor-1",
    arquivadoEm: "2026-04-01T10:00:00Z",
    dataReaparecimento: "2026-05-20",
    motivoArquivamento: "quer comprar em data futura",
  }),
  makeMockLead({
    id: "lead-2",
    nome: "Bruno Silva",
    telefone: "5518997654321",
    email: "bruno@teste.com",
    status: "em_atendimento",
    origem: "Instagram",
    temperatura: "frio",
    corretorId: "corretor-2",
    arquivadoEm: "2026-03-01T10:00:00Z",
    dataReaparecimento: "2026-05-01", // vencido em relação a hoje (2026-05-10)
    motivoArquivamento: "sem orcamento agora",
  }),
  makeMockLead({
    id: "lead-3",
    nome: "Carlos Eduardo",
    telefone: "5518998888888",
    email: "carlos@teste.com",
    status: "novo",
    origem: "WhatsApp",
    temperatura: "quente",
    corretorId: "corretor-1",
    arquivadoEm: "2026-04-10T10:00:00Z",
    dataReaparecimento: "2026-12-01",
    motivoArquivamento: "outro",
    observacaoArquivamento: "Aguardando liberação de FGTS",
  }),
]

const mockTodosLeads: Lead[] = [
  ...mockArquivados,
  makeMockLead({
    id: "lead-4",
    nome: "Daniel Reativado",
    telefone: "5518999999999",
    status: "fechado",
    origem: "Indicação",
    temperatura: "quente",
    corretorId: "corretor-1",
    reativadoEm: "2026-04-15T10:00:00Z",
  }),
  makeMockLead({
    id: "lead-5",
    nome: "Eduardo Reativado 2",
    telefone: "5518991111111",
    status: "novo",
    origem: "WhatsApp",
    temperatura: "morno",
    corretorId: "corretor-2",
    reativadoEm: "2026-04-20T10:00:00Z",
  }),
]

describe("Arquivados Utils - calcularKpisArquivados", () => {
  it("calcula totais, prazos de reaparecimento e taxa de conversão", () => {
    const hoje = "2026-05-10"
    const daqui30dias = "2026-06-09"

    const kpis = calcularKpisArquivados(mockArquivados, mockTodosLeads, hoje, daqui30dias)

    expect(kpis.total).toBe(3)
    // lead-1 reaparece em 2026-05-20 (está entre 2026-05-10 e 2026-06-09)
    expect(kpis.reaparece30d).toBe(1)
    // lead-2 data é 2026-05-01 (vencido antes de hoje 2026-05-10)
    expect(kpis.vencidos).toBe(1)
    // 2 reativados no total (lead-4 e lead-5), 1 virou fechamento (lead-4) -> 50%
    expect(kpis.totalReativados).toBe(2)
    expect(kpis.reativadosVenda).toBe(1)
    expect(kpis.taxaConversao).toBe(50)
  })
})

describe("Arquivados Utils - filtrarLeadsArquivados", () => {
  const baseParams = {
    busca: "",
    isGestor: true,
    filtroCorretor: "todos",
    filtroMotivo: "todos",
    filtroOrigem: "todas",
    filtroReaparece: "todos",
    hoje: "2026-05-10",
    daqui30dias: "2026-06-09",
    dataInicioCustom: "",
    dataFimCustom: "",
  }

  it("filtra por busca textual (nome, telefone, email, observação)", () => {
    const resNome = filtrarLeadsArquivados(mockArquivados, { ...baseParams, busca: "Ana" })
    expect(resNome).toHaveLength(1)
    expect(resNome[0].id).toBe("lead-1")

    const resObs = filtrarLeadsArquivados(mockArquivados, { ...baseParams, busca: "FGTS" })
    expect(resObs).toHaveLength(1)
    expect(resObs[0].id).toBe("lead-3")
  })

  it("filtra por corretor quando gestor", () => {
    const res = filtrarLeadsArquivados(mockArquivados, {
      ...baseParams,
      filtroCorretor: "corretor-2",
    })
    expect(res).toHaveLength(1)
    expect(res[0].id).toBe("lead-2")
  })

  it("filtra por status de reaparecimento vencido", () => {
    const res = filtrarLeadsArquivados(mockArquivados, {
      ...baseParams,
      filtroReaparece: "vencidos",
    })
    expect(res).toHaveLength(1)
    expect(res[0].id).toBe("lead-2")
  })

  it("filtra por status de reaparecimento nos próximos 30 dias", () => {
    const res = filtrarLeadsArquivados(mockArquivados, {
      ...baseParams,
      filtroReaparece: "proximos_30d",
    })
    expect(res).toHaveLength(1)
    expect(res[0].id).toBe("lead-1")
  })
})

describe("Arquivados Utils - gerarConteudoCsvArquivados e fmtDataBr", () => {
  it("formata data ISO ou YYYY-MM-DD para DD/MM/YYYY", () => {
    expect(fmtDataBr("2026-05-20")).toBe("20/05/2026")
    expect(fmtDataBr("2026-04-01T10:00:00Z")).toBe("01/04/2026")
    expect(fmtDataBr(null)).toBe("—")
  })

  it("gera conteúdo CSV com delimitador ';' e BOM UTF-8", () => {
    const csv = gerarConteudoCsvArquivados(mockArquivados, (id) => `Nome ${id}`)
    expect(csv.startsWith("\uFEFF")).toBe(true)
    expect(csv).toContain("Nome;Telefone;E-mail;Corretor;Origem")
    expect(csv).toContain('"Ana Paula"')
    expect(csv).toContain('"Nome corretor-1"')
  })
})
