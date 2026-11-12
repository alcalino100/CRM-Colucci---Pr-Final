import { describe, it, expect } from "vitest"
import { formatarRelatorioWhatsApp } from "@/lib/relatorios/formatar-whatsapp"
import type { RelatorioDiaDados } from "@/lib/relatorios/montar"

const mockDados: RelatorioDiaDados = {
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
    totalReaparecidos: 3,
    reaparecidosRedistribuidos: 1,
    conflitosDuplicidade: 0,
    porCorretor: [
      { corretorNome: "Sérgio Massaro", arquivados: 2, reaparecidos: 2 },
    ],
    vaoReaparecerHoje: 5,
  },
  tempo: {
    incluiuGestores: false,
    corretores: [
      {
        usuarioId: "u1",
        nome: "Sérgio Massaro",
        role: "corretor",
        acessou: true,
        tempoTotalFormatado: "3h12",
        duracaoSegundos: 11520,
        somaBrutaSegundos: 13000,
        numeroSessoes: 4,
        primeiroAcesso: "08:14",
        ultimaAtividade: "17:30",
      },
      {
        usuarioId: "u3",
        nome: "Lucas Corretor",
        role: "corretor",
        acessou: false,
        tempoTotalFormatado: "não acessou o CRM",
        duracaoSegundos: 0,
        somaBrutaSegundos: 0,
        numeroSessoes: 0,
        primeiroAcesso: "--:--",
        ultimaAtividade: "--:--",
      },
    ],
  },
  geradoEmIso: "2026-11-12T11:00:00.000Z",
}

describe("Formatador de WhatsApp para Relatório Diário (formatar-whatsapp.ts)", () => {
  it("renderiza todos os blocos ativos com formato escaneável e determinístico", () => {
    const texto = formatarRelatorioWhatsApp(mockDados)

    // Cabeçalho
    expect(texto).toContain("📊 *Relatório Diário do CRM — 11/11/2026*")

    // Bloco 1: Tráfego
    expect(texto).toContain("🎯 *1. TRÁFEGO PAGO POR CORRETOR*")
    expect(texto).toContain("Novos leads: 8 (7 contatos únicos)")
    expect(texto).toContain("Sérgio Massaro: 5 leads (4 únicos)")
    expect(texto).toContain("Sem leads no dia: Lucas Corretor")
    expect(texto).toContain("Reengajados via anúncio (leads antigos): 2")

    // Bloco 2: Automação
    expect(texto).toContain("⚡ *2. AUTOMAÇÃO E RÉGUA DE FOLLOW-UP*")
    expect(texto).toContain("Disparos realizados: 42 (para 35 leads distintos)")
    expect(texto).toContain("Respostas recebidas: 14 (taxa de resposta: 40.0%)")
    expect(texto).toContain("Por etapa: D+1: 20 | D+2: 15 | D+3: 7")

    // Bloco 3: IA
    expect(texto).toContain("🤖 *3. RESPOSTAS E ATENDIMENTO IA*")
    expect(texto).toContain("Responderam e foram para IA: 14")
    expect(texto).toContain("IA escalou para humano (handoff): 3")
    expect(texto).toContain("Visitas agendadas pela IA: 2")

    // Bloco 4: Arquivados
    expect(texto).toContain("📦 *4. LEADS ARQUIVADOS E REAPARECIDOS*")
    expect(texto).toContain("Arquivados no dia: 4 (3 manuais, 1 automáticos)")
    expect(texto).toContain("Reaparecidos no dia: 3 (1 redistribuídos)")
    expect(texto).toContain("Vão reaparecer hoje: 5")

    // Bloco 5: Tempo
    expect(texto).toContain("⏱️ *5. TEMPO DOS CORRETORES NO CRM*")
    expect(texto).toContain("Sérgio Massaro: 3h12 — 4 sessões (08:14 às 17:30)")
    expect(texto).toContain("Lucas Corretor: não acessou o CRM")
  })

  it("omite blocos que estejam desativados na configuração", () => {
    const dadosComSecaoOmitida: RelatorioDiaDados = {
      ...mockDados,
      secoesAtivas: {
        ...mockDados.secoesAtivas,
        trafego: false,
        tempo: false,
      },
    }

    const texto = formatarRelatorioWhatsApp(dadosComSecaoOmitida)

    expect(texto).not.toContain("TRÁFEGO PAGO")
    expect(texto).not.toContain("TEMPO DOS CORRETORES")
    expect(texto).toContain("AUTOMAÇÃO E RÉGUA DE FOLLOW-UP")
    expect(texto).toContain("RESPOSTAS E ATENDIMENTO IA")
    expect(texto).toContain("LEADS ARQUIVADOS E REAPARECIDOS")
  })

  it("garante conformidade LGPD: não inclui números de telefone ou dados pessoais dos leads", () => {
    const texto = formatarRelatorioWhatsApp(mockDados)

    // Não deve conter números de telefone específicos (apenas nomes de corretores e contagens)
    expect(texto).not.toMatch(/55189\d{8}/)
    expect(texto).not.toMatch(/189\d{8}/)
    expect(texto).not.toContain("mensagem do lead")
  })
})
