import { describe, it, expect, vi } from "vitest"
import {
  METRICAS_LOCACAO_VAZIAS,
  coletarMetricasLocacao,
  contarFunil,
  diaSeguinteYmd,
  normalizarStatusLocacao,
} from "@/lib/relatorios/metricas/locacao"
import { formatarRelatorioWhatsApp } from "@/lib/relatorios/formatar-whatsapp"
import { enviarRelatorioParaDestinatario, type DestinatarioRelatorio } from "@/lib/relatorios/enviar"
import { SECOES_LOCACAO_E_TEMPO, SECOES_PADRAO, SECOES_SOMENTE_LOCACAO } from "@/lib/relatorios/secoes"
import { limitesDiaBRT } from "@/lib/relatorios/periodo"
import * as whatsappServer from "@/lib/whatsapp/server"
import type { RelatorioDiaDados } from "@/lib/relatorios/montar"

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))
vi.mock("@/lib/whatsapp/server", () => ({ sendWhatsAppText: vi.fn() }))

const periodo = limitesDiaBRT("2026-11-15")

/** Cliente falso: cada consulta vira uma "promessa" resolvida pela função `responder(tabela, colunas, head)`. */
function clienteFalso(responder: (tabela: string, colunas: string, head: boolean) => { data?: unknown[]; count?: number }) {
  return {
    from(tabela: string) {
      const estado = { colunas: "", head: false }
      const cadeia: any = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === "then") {
              return (resolve: (v: unknown) => void) => {
                const r = responder(tabela, estado.colunas, estado.head)
                resolve({ data: r.data ?? null, count: r.count ?? null, error: null })
              }
            }
            if (prop === "select") {
              return (colunas: string, opcoes?: { head?: boolean }) => {
                estado.colunas = colunas
                estado.head = Boolean(opcoes?.head)
                return cadeia
              }
            }
            return () => cadeia
          },
        }
      )
      return cadeia
    },
  } as any
}

describe("normalização e funil", () => {
  it("normaliza status com acento, espaço e maiúscula", () => {
    expect(normalizarStatusLocacao("Procurando imovel")).toBe("procurando_imovel")
    expect(normalizarStatusLocacao("visita agendada")).toBe("visita_agendada")
    expect(normalizarStatusLocacao("Em Atendimento")).toBe("em_atendimento")
    expect(normalizarStatusLocacao(null)).toBe("")
  })

  it("funil: locado e perdido não entram nos 'em aberto' nem na temperatura", () => {
    const r = contarFunil([
      { status: "novo", temperatura: "quente" },
      { status: "em_atendimento", temperatura: "morno" },
      { status: "procurando imovel", temperatura: "morno" },
      { status: "negociando", temperatura: "frio" },
      { status: "locado", temperatura: "quente" },
      { status: "perdido", temperatura: "frio" },
    ])
    expect(r.totalEmAberto).toBe(4)
    expect(r.funil).toMatchObject({ novo: 1, emAtendimento: 1, procurandoImovel: 1, negociando: 1, locado: 1, perdido: 1 })
    expect(r.temperatura).toEqual({ quente: 1, morno: 2, frio: 1 })
  })

  it("dia seguinte atravessa fim de mês e de ano", () => {
    expect(diaSeguinteYmd("2026-11-15")).toBe("2026-11-16")
    expect(diaSeguinteYmd("2026-11-30")).toBe("2026-12-01")
    expect(diaSeguinteYmd("2026-12-31")).toBe("2027-01-01")
  })
})

describe("coletarMetricasLocacao", () => {
  const fake = clienteFalso((tabela, colunas, head) => {
    if (tabela === "locacao_leads" && head) return { count: 2 }
    if (tabela === "locacao_leads" && colunas === "id, corretor_id")
      return { data: [{ id: "a", corretor_id: "c1" }, { id: "b", corretor_id: "c1" }, { id: "c", corretor_id: "c2" }] }
    if (tabela === "locacao_leads" && colunas === "id, valor_comissao")
      return { data: [{ id: "x", valor_comissao: 1500 }, { id: "y", valor_comissao: "500.5" }] }
    if (tabela === "locacao_leads" && colunas === "status, temperatura")
      return { data: [{ status: "novo", temperatura: "quente" }, { status: "locado", temperatura: null }] }
    if (tabela === "locacao_leads" && colunas === "id, nome") return { data: [{ id: "l1", nome: "Maria Souza" }] }
    if (tabela === "locacao_contratos") return { data: [{ id: "k", valor_aluguel: 2000 }] }
    if (tabela === "locacao_visitas" && head) return { count: 4 }
    if (tabela === "locacao_visitas")
      return { data: [{ lead_id: "l1", corretor_id: "c2", horario: "10:00" }, { lead_id: null, corretor_id: null, horario: "15:30" }] }
    if (tabela === "usuarios") return { data: [{ id: "c1", nome: "Ana" }, { id: "c2", nome: "Beto" }] }
    return { data: [] }
  })

  it("consolida os números do dia e o funil atual", async () => {
    const m = await coletarMetricasLocacao(fake, periodo)
    expect(m.novosLeads).toBe(3)
    expect(m.novosPorCorretor).toEqual([
      { corretorNome: "Ana", total: 2 },
      { corretorNome: "Beto", total: 1 },
    ])
    expect(m.negociacoesIniciadas).toBe(2)
    expect(m.locadosNoDia).toBe(2)
    expect(m.comissaoLocadosNoDia).toBeCloseTo(2000.5)
    expect(m.contratosAssinados).toBe(1)
    expect(m.valorAluguelContratos).toBe(2000)
    expect(m.visitasRegistradasNoDia).toBe(4)
    expect(m.diaVisitas).toBe("2026-11-16")
    expect(m.visitasAgendadasTotal).toBe(2)
    expect(m.funil.novo).toBe(1)
    expect(m.funil.locado).toBe(1)
    expect(m.totalEmAberto).toBe(1)
  })

  it("não expõe o nome do lead nas visitas quando 'listar nomes' está desligado (LGPD)", async () => {
    const m = await coletarMetricasLocacao(fake, periodo, { listarNomesLeads: false })
    expect(m.visitasAgendadas.every((v) => v.leadNome === null)).toBe(true)
    expect(m.visitasAgendadas[0]).toMatchObject({ horario: "10:00", corretorNome: "Beto" })
    expect(m.visitasAgendadas[1].corretorNome).toBe("Sem corretor")
  })

  it("mostra o nome do lead quando a opção está ligada", async () => {
    const m = await coletarMetricasLocacao(fake, periodo, { listarNomesLeads: true })
    expect(m.visitasAgendadas[0].leadNome).toBe("Maria Souza")
  })
})

const dadosBase = (secoesAtivas: RelatorioDiaDados["secoesAtivas"]): RelatorioDiaDados => ({
  periodo,
  secoesAtivas,
  opcoes: { incluirGestoresNoTempo: false, listarNomesLeads: false },
  trafego: { totalLeadsNovos: 5, totalTelefonesUnicos: 5, porCorretor: [], corretoresSemLeads: [], reengajadosAnuncioAntigos: 0 },
  automacao: {
    mensagensEnviadas: 10, leadsDistintosReceberam: 9, leadsDistintosResponderam: 2, taxaResposta: 22.2,
    entraramEmAutomacao: 1, concluiramRegua: 0, falhasEnvio: 0, filaPendenteAgora: 3,
  },
  ia: { responderamParaIA: 0, iaAssumiuAtendimento: 0, iaEscalouParaHumano: 0, visitasAgendadasIA: 0, porCorretor: [] },
  arquivados: {
    totalArquivados: 0, arquivadosManual: 0, arquivadosAutomatico: 0, porMotivo: [], totalReaparecidos: 0,
    reaparecidosRedistribuidos: 0, conflitosDuplicidade: 0, porCorretor: [], vaoReaparecerHoje: 0,
  },
  tempo: {
    incluiuGestores: false,
    corretores: [
      { usuarioId: "v1", nome: "Daline", role: "corretor_vendas", acessou: true, tempoTotalFormatado: "24m", duracaoSegundos: 1440, somaBrutaSegundos: 1440, numeroSessoes: 9, primeiroAcesso: "09:01", ultimaAtividade: "16:07" },
      { usuarioId: "v2", nome: "Abraão", role: "corretor_vendas", acessou: false, tempoTotalFormatado: "não acessou o CRM", duracaoSegundos: 0, somaBrutaSegundos: 0, numeroSessoes: 0, primeiroAcesso: "--:--", ultimaAtividade: "--:--" },
      { usuarioId: "l1", nome: "Felipe Braga", role: "corretor_locacao", acessou: true, tempoTotalFormatado: "2m", duracaoSegundos: 120, somaBrutaSegundos: 120, numeroSessoes: 15, primeiroAcesso: "14:30", ultimaAtividade: "17:49" },
      { usuarioId: "l2", nome: "Otávio", role: "corretor_locacao", acessou: false, tempoTotalFormatado: "não acessou o CRM", duracaoSegundos: 0, somaBrutaSegundos: 0, numeroSessoes: 0, primeiroAcesso: "--:--", ultimaAtividade: "--:--" },
    ],
  },
  locacao: {
    ...METRICAS_LOCACAO_VAZIAS,
    novosLeads: 3,
    novosPorCorretor: [{ corretorNome: "Ana", total: 2 }, { corretorNome: "Beto", total: 1 }],
    negociacoesIniciadas: 1,
    locadosNoDia: 2,
    comissaoLocadosNoDia: 2000,
    visitasRegistradasNoDia: 1,
    diaVisitas: "2026-11-16",
    visitasAgendadasTotal: 2,
    visitasAgendadas: [{ horario: "10:00", corretorNome: "Beto", leadNome: null }],
    funil: { novo: 46, emAtendimento: 77, procurandoImovel: 61, visitaAgendada: 8, negociando: 10, locado: 35, perdido: 83 },
    temperatura: { quente: 51, morno: 225, frio: 44 },
    totalEmAberto: 202,
  },
  geradoEmIso: "2026-11-16T11:00:00.000Z",
})

describe("texto do bloco de Locação", () => {
  it("relatório só de Locação tem título próprio e não traz os outros blocos", () => {
    const texto = formatarRelatorioWhatsApp(dadosBase(SECOES_SOMENTE_LOCACAO))
    expect(texto).toContain("Relatório de Locação — 15/11/2026")
    expect(texto).toContain("🏠 *LOCAÇÃO*")
    expect(texto).toContain("Novos leads de locação: 3")
    expect(texto).toContain("  - Ana: 2")
    expect(texto).toContain("Locados no dia: 2 (comissão")
    expect(texto).toContain("Funil em aberto (202): Novo 46 | Em atendimento 77 | Procurando imóvel 61 | Visita agendada 8 | Negociando 10")
    expect(texto).toContain("🔥 51 quentes | 225 mornos | 44 frios")
    expect(texto).toContain("Acumulado: 35 locados | 83 perdidos")
    expect(texto).toContain("  - 10:00 — Beto")
    expect(texto).toContain("… e mais 1")
    expect(texto).not.toContain("TRÁFEGO")
    expect(texto).not.toContain("AUTOMAÇÃO")
  })

  it("junto com os outros blocos, vira o bloco 6 no relatório completo", () => {
    const texto = formatarRelatorioWhatsApp(dadosBase({ ...SECOES_PADRAO, locacao: true }))
    expect(texto).toContain("Relatório Diário do CRM — 15/11/2026")
    expect(texto).toContain("🏠 *6. LOCAÇÃO*")
    expect(texto).toContain("TRÁFEGO PAGO")
  })

  it("sem Locação ativa, o relatório não muda", () => {
    const texto = formatarRelatorioWhatsApp(dadosBase(SECOES_PADRAO))
    expect(texto).not.toContain("LOCAÇÃO")
  })
})

describe("relatório de Locação traz só a equipe de Locação", () => {
  it("com Locação + Tempo: título de Locação, Locação primeiro e Tempo só com a equipe de Locação", () => {
    const texto = formatarRelatorioWhatsApp(dadosBase(SECOES_LOCACAO_E_TEMPO))
    expect(texto).toContain("Relatório de Locação — 15/11/2026")
    expect(texto).not.toContain("Relatório Diário do CRM")
    expect(texto).toContain("⏱️ *TEMPO DA EQUIPE DE LOCAÇÃO NO CRM*")
    expect(texto).toContain("• Felipe Braga: 2m")
    expect(texto).toContain("• Otávio: não acessou o CRM")
    expect(texto).not.toContain("Daline")
    expect(texto).not.toContain("Abraão")
    expect(texto).not.toContain("5. TEMPO")
    expect(texto.indexOf("🏠 *LOCAÇÃO*")).toBeLessThan(texto.indexOf("TEMPO DA EQUIPE DE LOCAÇÃO"))
  })

  it("no relatório completo (com blocos de vendas), o Tempo continua listando todos", () => {
    const texto = formatarRelatorioWhatsApp(dadosBase({ ...SECOES_PADRAO, locacao: true }))
    expect(texto).toContain("5. TEMPO DOS CORRETORES NO CRM")
    expect(texto).toContain("• Daline: 24m")
    expect(texto).toContain("• Felipe Braga: 2m")
  })

  it("equipe de Locação vazia não quebra o bloco", () => {
    const dados = dadosBase(SECOES_LOCACAO_E_TEMPO)
    dados.tempo.corretores = dados.tempo.corretores.filter((c) => c.role !== "corretor_locacao")
    expect(formatarRelatorioWhatsApp(dados)).toContain("Nenhum usuário da equipe de Locação registrado")
  })
})

describe("envio: cada destinatário recebe só os blocos dele", () => {
  function supabaseDeEnvios() {
    const eqChain = { eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }
    const insertChain = { select: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: "e1" }, error: null }) }) }
    return {
      from: vi.fn(() => ({ select: vi.fn().mockReturnValue(eqChain), insert: vi.fn().mockReturnValue(insertChain) })),
    } as any
  }

  const kleber: DestinatarioRelatorio = { id: "k", nome: "Kleber", tipo: "numero", destino: "5518991975661", ativo: true, secoes: null }
  const ricardo: DestinatarioRelatorio = { id: "r", nome: "Ricardo", tipo: "numero", destino: "5518990000000", ativo: true, secoes: SECOES_SOMENTE_LOCACAO }

  it("dados coletados para a união; Kleber não ganha Locação e o Ricardo não recebe os demais", async () => {
    const uniao = dadosBase({ ...SECOES_PADRAO, locacao: true }) // o que a coleta devolve para [Kleber, Ricardo]
    vi.mocked(whatsappServer.sendWhatsAppText).mockResolvedValue({ ok: true })

    for (const d of [kleber, ricardo]) {
      await enviarRelatorioParaDestinatario(supabaseDeEnvios(), {
        destinatario: d,
        instanceName: "patricia-6c2875b4",
        origem: "automatico",
        dadosConsolidados: uniao,
        secoesGerais: SECOES_PADRAO,
      })
    }

    const chamadas = vi.mocked(whatsappServer.sendWhatsAppText).mock.calls
    const paraKleber = chamadas.find((c) => c[1] === kleber.destino)![2]
    const paraRicardo = chamadas.find((c) => c[1] === ricardo.destino)![2]

    expect(paraKleber).toContain("TRÁFEGO PAGO")
    expect(paraKleber).not.toContain("LOCAÇÃO")
    expect(paraRicardo).toContain("Relatório de Locação")
    expect(paraRicardo).toContain("🏠 *LOCAÇÃO*")
    expect(paraRicardo).not.toContain("TRÁFEGO PAGO")
    expect(paraRicardo).not.toContain("AUTOMAÇÃO")
  })
})
