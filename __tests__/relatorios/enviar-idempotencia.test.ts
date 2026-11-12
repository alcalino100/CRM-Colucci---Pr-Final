import { describe, it, expect, vi, beforeEach } from "vitest"
import { enviarRelatorioParaDestinatario, type DestinatarioRelatorio } from "@/lib/relatorios/enviar"
import type { RelatorioDiaDados } from "@/lib/relatorios/montar"
import * as whatsappServer from "@/lib/whatsapp/server"

// Mock do logger para evitar poluição no console
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock de sendWhatsAppText
vi.mock("@/lib/whatsapp/server", () => ({
  sendWhatsAppText: vi.fn(),
}))

const mockDadosConsolidados: RelatorioDiaDados = {
  periodo: {
    ymd: "2026-11-11",
    dataFormatada: "11/11/2026",
    inicioIso: "2026-11-11T03:00:00.000Z",
    fimIso: "2026-11-12T03:00:00.000Z",
  },
  secoesAtivas: {
    trafego: true,
    automacao: true,
    ia: true,
    arquivados: true,
    tempo: true,
  },
  opcoes: {
    incluirGestoresNoTempo: false,
    listarNomesLeads: false,
  },
  trafego: {
    totalLeadsNovos: 8,
    totalTelefonesUnicos: 7,
    porCorretor: [
      { corretorId: "u1", corretorNome: "Sérgio Massaro", totalLeads: 5, telefonesUnicos: 4 },
      { corretorId: "u2", corretorNome: "Ana Silva", totalLeads: 3, telefonesUnicos: 3 },
    ],
    corretoresSemLeads: ["Lucas Corretor"],
    reengajadosAnuncioAntigos: 2,
  },
  automacao: {
    mensagensEnviadas: 42,
    leadsDistintosReceberam: 35,
    leadsDistintosResponderam: 14,
    taxaResposta: 40.0,
    entraramEmAutomacao: 9,
    concluiramRegua: 5,
    falhasEnvio: 1,
    filaPendenteAgora: 3,
    etapasRegua: { d1: 20, d2: 15, d3: 7 },
  },
  ia: {
    responderamParaIA: 14,
    iaAssumiuAtendimento: 12,
    iaEscalouParaHumano: 3,
    visitasAgendadasIA: 2,
    porCorretor: [
      { corretorId: "u1", corretorNome: "Sérgio Massaro", leadsAtendidosIA: 8, visitasAgendadasIA: 2 },
      { corretorId: "u2", corretorNome: "Ana Silva", leadsAtendidosIA: 4, visitasAgendadasIA: 0 },
    ],
  },
  arquivados: {
    totalArquivados: 4,
    arquivadosManual: 3,
    arquivadosAutomatico: 1,
    porMotivo: [
      { motivo: "Sem orçamento agora", contagem: 2 },
      { motivo: "Outro", contagem: 2 },
    ],
    totalReaparecidos: 2,
    reaparecidosRedistribuidos: 1,
    conflitosDuplicidade: 0,
    porCorretor: [
      { corretorNome: "Sérgio Massaro", arquivados: 3, reaparecidos: 2 },
      { corretorNome: "Ana Silva", arquivados: 1, reaparecidos: 0 },
    ],
    vaoReaparecerHoje: 3,
  },
  tempo: {
    incluiuGestores: false,
    corretores: [
      {
        usuarioId: "u1",
        nome: "Sérgio Massaro",
        role: "corretor",
        duracaoSegundos: 11520,
        somaBrutaSegundos: 13000,
        tempoTotalFormatado: "3h12",
        numeroSessoes: 4,
        primeiroAcesso: "08:15",
        ultimaAtividade: "17:40",
        acessou: true,
      },
      {
        usuarioId: "u2",
        nome: "Ana Silva",
        role: "corretor",
        duracaoSegundos: 0,
        somaBrutaSegundos: 0,
        tempoTotalFormatado: "não acessou o CRM",
        numeroSessoes: 0,
        primeiroAcesso: "--:--",
        ultimaAtividade: "--:--",
        acessou: false,
      },
    ],
  },
  geradoEmIso: "2026-11-12T11:00:00.000Z",
}

const mockDestinatario: DestinatarioRelatorio = {
  id: "dest-uuid-1",
  nome: "Grupo Diretoria",
  tipo: "grupo",
  destino: "120363028371@g.us",
  ativo: true,
}

describe("enviarRelatorioParaDestinatario - Idempotência e Auditoria", () => {
  let mockSelectMaybeSingle: ReturnType<typeof vi.fn>
  let mockInsertSelectMaybeSingle: ReturnType<typeof vi.fn>
  let mockSupabase: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockSelectMaybeSingle = vi.fn()
    mockInsertSelectMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: "envio-id-123" },
      error: null,
    })

    const eqChain = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle: mockSelectMaybeSingle,
    }

    const insertChain = {
      select: vi.fn().mockReturnValue({
        maybeSingle: mockInsertSelectMaybeSingle,
      }),
    }

    mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "relatorio_envios") {
          return {
            select: vi.fn().mockReturnValue(eqChain),
            insert: vi.fn().mockReturnValue(insertChain),
          }
        }
        return {}
      }),
    }
  })

  it("deve realizar o envio com sucesso e registrar em relatorio_envios quando origem for automatico e não houver envio prévio", async () => {
    mockSelectMaybeSingle.mockResolvedValueOnce({ data: null, error: null })
    vi.mocked(whatsappServer.sendWhatsAppText).mockResolvedValueOnce({ ok: true })

    const res = await enviarRelatorioParaDestinatario(mockSupabase, {
      destinatario: mockDestinatario,
      instanceName: "crm-instance",
      origem: "automatico",
      dadosConsolidados: mockDadosConsolidados,
    })

    expect(res.ok).toBe(true)
    expect(res.status).toBe("enviado")
    expect(res.envioId).toBe("envio-id-123")
    expect(whatsappServer.sendWhatsAppText).toHaveBeenCalledTimes(1)
    expect(whatsappServer.sendWhatsAppText).toHaveBeenCalledWith(
      "crm-instance",
      mockDestinatario.destino,
      expect.stringContaining("Relatório Diário do CRM — 11/11/2026")
    )
  })

  it("deve pular o envio (status: pulado) por idempotência quando já existir registro de envio automático bem-sucedido", async () => {
    mockSelectMaybeSingle.mockResolvedValueOnce({
      data: { id: "envio-anterior-id" },
      error: null,
    })

    const res = await enviarRelatorioParaDestinatario(mockSupabase, {
      destinatario: mockDestinatario,
      instanceName: "crm-instance",
      origem: "automatico",
      dadosConsolidados: mockDadosConsolidados,
    })

    expect(res.ok).toBe(true)
    expect(res.status).toBe("pulado")
    expect(whatsappServer.sendWhatsAppText).not.toHaveBeenCalled()
  })

  it("deve disparar normalmente quando a origem for 'teste', mesmo se houvesse registro prévio", async () => {
    vi.mocked(whatsappServer.sendWhatsAppText).mockResolvedValueOnce({ ok: true })

    const res = await enviarRelatorioParaDestinatario(mockSupabase, {
      destinatario: mockDestinatario,
      instanceName: "crm-instance",
      origem: "teste",
      dadosConsolidados: mockDadosConsolidados,
    })

    expect(res.ok).toBe(true)
    expect(res.status).toBe("enviado")
    // Não deve checar a tabela para pular
    expect(mockSelectMaybeSingle).not.toHaveBeenCalled()
    expect(whatsappServer.sendWhatsAppText).toHaveBeenCalledTimes(1)
  })

  it("deve registrar falha no banco quando a Evolution API retornar erro", async () => {
    mockSelectMaybeSingle.mockResolvedValueOnce({ data: null, error: null })
    vi.mocked(whatsappServer.sendWhatsAppText).mockResolvedValueOnce({
      ok: false,
      erro: "Instância desconectada",
    })

    const res = await enviarRelatorioParaDestinatario(mockSupabase, {
      destinatario: mockDestinatario,
      instanceName: "crm-instance",
      origem: "automatico",
      dadosConsolidados: mockDadosConsolidados,
    })

    expect(res.ok).toBe(false)
    expect(res.status).toBe("falhou")
    expect(res.erro).toBe("Instância desconectada")
  })
})
