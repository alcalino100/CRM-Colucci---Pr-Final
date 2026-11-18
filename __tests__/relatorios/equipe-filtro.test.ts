import { describe, it, expect } from "vitest"
import { aplicarFiltroEquipe, resumoEquipeFiltro } from "@/lib/relatorios/equipe-filtro"
import { formatarRelatorioWhatsApp } from "@/lib/relatorios/formatar-whatsapp"
import { METRICAS_LOCACAO_VAZIAS } from "@/lib/relatorios/metricas/locacao"
import type { RelatorioDiaDados } from "@/lib/relatorios/montar"

const usuarios = [
  { id: "v1", nome: "Ana Vendas", role: "corretor_vendas" },
  { id: "v2", nome: "Beto Geral", role: "corretor" },
  { id: "l1", nome: "Carla Locação", role: "corretor_locacao" },
  { id: "l2", nome: "Dino Locação", role: "corretor_locacao" },
]

const tempo = (u: { id: string; nome: string; role: string }) => ({
  usuarioId: u.id, nome: u.nome, role: u.role, acessou: true, tempoTotalFormatado: "10m",
  duracaoSegundos: 600, somaBrutaSegundos: 600, numeroSessoes: 1, primeiroAcesso: "09:00", ultimaAtividade: "10:00",
})

const dados: RelatorioDiaDados = {
  periodo: { ymd: "2026-11-17", dataFormatada: "17/11/2026", inicioIso: "2026-11-17T03:00:00.000Z", fimIso: "2026-11-18T03:00:00.000Z" },
  secoesAtivas: { trafego: true, automacao: false, ia: false, arquivados: false, tempo: true, locacao: false },
  opcoes: { incluirGestoresNoTempo: false, listarNomesLeads: false },
  trafego: {
    totalLeadsNovos: 10, totalTelefonesUnicos: 9,
    porCorretor: [
      { corretorId: "v1", corretorNome: "Ana Vendas", totalLeads: 4, telefonesUnicos: 4 },
      { corretorId: "l1", corretorNome: "Carla Locação", totalLeads: 6, telefonesUnicos: 5 },
    ],
    corretoresSemLeads: ["Beto Geral", "Dino Locação"],
    reengajadosAnuncioAntigos: 3,
  },
  automacao: { mensagensEnviadas: 0, leadsDistintosReceberam: 0, leadsDistintosResponderam: 0, taxaResposta: 0, entraramEmAutomacao: 0, concluiramRegua: 0, falhasEnvio: 0, filaPendenteAgora: 0 },
  ia: { responderamParaIA: 0, iaAssumiuAtendimento: 0, iaEscalouParaHumano: 0, visitasAgendadasIA: 0, porCorretor: [] },
  arquivados: { totalArquivados: 0, arquivadosManual: 0, arquivadosAutomatico: 0, porMotivo: [], totalReaparecidos: 0, reaparecidosRedistribuidos: 0, conflitosDuplicidade: 0, porCorretor: [], vaoReaparecerHoje: 0 },
  tempo: { corretores: usuarios.map(tempo), incluiuGestores: false },
  locacao: METRICAS_LOCACAO_VAZIAS,
  geradoEmIso: "2026-11-18T11:00:00.000Z",
}

describe("filtro de corretores por destinatário", () => {
  it("sem filtro devolve os dados intactos", () => {
    expect(aplicarFiltroEquipe(dados, null, usuarios)).toBe(dados)
    expect(aplicarFiltroEquipe(dados, { modo: "todos" }, usuarios)).toBe(dados)
  })

  it("só Vendas: tira Locação e recalcula totais", () => {
    const r = aplicarFiltroEquipe(dados, { modo: "vendas" }, usuarios)
    expect(r.trafego.porCorretor.map((c) => c.corretorNome)).toEqual(["Ana Vendas"])
    expect(r.trafego.totalLeadsNovos).toBe(4)
    expect(r.trafego.corretoresSemLeads).toEqual(["Beto Geral"])
    expect(r.tempo.corretores.map((c) => c.nome)).toEqual(["Ana Vendas", "Beto Geral"])
    expect(r.trafego.reengajadosAnuncioAntigos).toBeNull()
    expect(formatarRelatorioWhatsApp(r)).not.toContain("Carla")
    expect(formatarRelatorioWhatsApp(r)).not.toContain("Reengajados")
  })

  it("só Locação: tira Vendas e o corretor genérico", () => {
    const r = aplicarFiltroEquipe(dados, { modo: "locacao" }, usuarios)
    expect(r.trafego.porCorretor.map((c) => c.corretorNome)).toEqual(["Carla Locação"])
    expect(r.trafego.totalLeadsNovos).toBe(6)
    expect(r.tempo.corretores.map((c) => c.nome)).toEqual(["Carla Locação", "Dino Locação"])
  })

  it("corretores escolhidos", () => {
    const r = aplicarFiltroEquipe(dados, { modo: "selecionados", ids: ["v1", "l2"] }, usuarios)
    expect(r.tempo.corretores.map((c) => c.nome)).toEqual(["Ana Vendas", "Dino Locação"])
  })

  it("resumo para a lista", () => {
    expect(resumoEquipeFiltro(null)).toBe("Todos os corretores")
    expect(resumoEquipeFiltro({ modo: "selecionados", ids: ["a", "b"] })).toBe("2 corretores escolhidos")
  })
})
