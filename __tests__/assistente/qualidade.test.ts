import { describe, expect, it, vi } from "vitest"
import { RepositorioMemoria, criarMockProvider, calcularIndicadores, resumirIa, type AgenteDeps, type ChamadaIa } from "@/lib/assistente"
import { ehSoMidia, LIMITE_RESPOSTAS, MSG_SO_TEXTO, SILENCIO_APOS_TRANSFERENCIA_MIN, atenderMensagem } from "@/lib/assistente/atendimento"
import { atrasoDigitacao, ehMensagemAutomatica, janelaRajada, tratarMensagemRecebida, type DepsHandler } from "@/lib/assistente/handler"

const provider = criarMockProvider()
const config = { capacidades: { boleto: true, informe: true, reajuste: true, contrato: true, faq: true }, usarIa: true }
const T = "5511999990001"
const t0 = new Date("2026-11-19T10:00:00")
const base = (repo: RepositorioMemoria, extra: any = {}) => atenderMensagem({ repo, provider, config, telefone: T, instanceName: "inst", texto: "bom dia", agora: t0, ...extra })

describe("falha do Claude fica visível e não atrasa o cliente", () => {
  const agenteQuebrado: AgenteDeps = { llm: vi.fn().mockRejectedValue(new Error("HTTP 401 invalid x-api-key")) }
  const humanizadorEspia = (): ChamadaIa => vi.fn().mockResolvedValue({ chamadas: [], tokensTotal: 0, modelo: "m" })

  it("grava o MOTIVO no evento e responde pelo fluxo de regras", async () => {
    const r = await base(new RepositorioMemoria(), { agente: agenteQuebrado })
    expect(r.respondeu).toBe(true)
    expect(r.eventos).toContainEqual(expect.objectContaining({ tipo: "ia", funcao: "agente", ok: false, erro: expect.stringContaining("invalid x-api-key") }))
  })

  it("depois de o agente falhar NÃO chama o humanizador (segunda chamada ao mesmo Claude só atrasaria)", async () => {
    const ia = humanizadorEspia()
    await base(new RepositorioMemoria(), { agente: agenteQuebrado, ia })
    expect(ia).not.toHaveBeenCalled()
  })

  it("sem agente configurado, o humanizador segue funcionando como antes", async () => {
    const ia = humanizadorEspia()
    await base(new RepositorioMemoria(), { ia })
    expect(ia).toHaveBeenCalled()
  })

  it("o handler escreve o motivo no log", async () => {
    const repo = new RepositorioMemoria()
    await repo.salvarConfig({ ativo: true, numerosTeste: [T], usarIa: true })
    const log = vi.fn()
    const d: DepsHandler = { repo, provider, resolverIa: async () => null, resolverAgente: async () => agenteQuebrado, enviarTexto: async () => ({ ok: true }), log, dormir: async () => {} }
    await tratarMensagemRecebida({ telefone: T, texto: "bom dia", instanceName: "inst" }, d)
    expect(log).toHaveBeenCalledWith("erro", expect.stringContaining("IA (agente) não respondeu"), expect.objectContaining({ motivo: expect.stringContaining("invalid x-api-key") }))
  })

  it("indicadores mostram a saúde da IA e o último erro", () => {
    const ia = resumirIa([{ funcao: "agente", ok: false, erro: "A" }, { funcao: "agente", ok: true }, { funcao: "agente", ok: false, erro: "B" }, { funcao: "humanizador", ok: false, erro: "X" }])
    expect(ia).toEqual({ tentativas: 3, ok: 1, falhas: 2, ultimoErro: "B" })
    expect(calcularIndicadores([], new Map()).ia).toEqual({ tentativas: 0, ok: 0, falhas: 0, ultimoErro: null })
  })
})

describe("tempo de resposta é o REAL, não zero", () => {
  it("mede do recebimento do cliente até o fim da resposta", async () => {
    const repo = new RepositorioMemoria()
    const fim = new Date(t0.getTime() + 7000)
    await base(repo, { relogio: () => fim })
    const i = await repo.calcularIndicadores(new Date("2026-11-19T00:00:00"))
    expect(i.tempoMedioRespostaSeg).toBe(7)
  })
})

describe("áudio/imagem sem texto", () => {
  it("reconhece os marcadores do webhook", () => {
    expect(ehSoMidia("[mídia]")).toBe(true)
    expect(ehSoMidia("[mídia]\n[mídia]")).toBe(true)
    expect(ehSoMidia("[áudio]")).toBe(true)
    expect(ehSoMidia("segunda via [mídia]")).toBe(false)
    expect(ehSoMidia("oi")).toBe(false)
  })

  it("pede para escrever, sem contar como 'não entendi' e sem escalar", async () => {
    const repo = new RepositorioMemoria()
    const r1 = await base(repo, { texto: "[mídia]" })
    const r2 = await base(repo, { texto: "[mídia]", agora: new Date(t0.getTime() + 20_000) })
    const r3 = await base(repo, { texto: "[mídia]", agora: new Date(t0.getTime() + 40_000) })
    for (const r of [r1, r2, r3]) expect(r.respostas).toEqual([MSG_SO_TEXTO])
    expect(repo.conversas[0].estado.etapa).toBe("inicio")
    expect(repo.conversas[0].estado.naoEntendidas).toBe(0)
  })
})

describe("trava anti-loop (robô conversando com robô)", () => {
  it("depois do limite, cala, entrega à equipe e avisa", async () => {
    const repo = new RepositorioMemoria()
    let ultima: any
    for (let i = 0; i < LIMITE_RESPOSTAS; i++) ultima = await base(repo, { texto: "bom dia", agora: new Date(t0.getTime() + i * 1000) })
    expect(ultima.respondeu).toBe(true)
    const barrada = await base(repo, { texto: "bom dia", agora: new Date(t0.getTime() + 60_000) })
    expect(barrada.respondeu).toBe(false)
    expect(barrada.limitado).toBe(true)
    expect(repo.conversas[0].status).toBe("humano")
    const seguinte = await base(repo, { texto: "bom dia", agora: new Date(t0.getTime() + 70_000) })
    expect(seguinte.respondeu).toBe(false)
    expect(seguinte.limitado).toBeUndefined() // já está com a equipe: não avisa de novo
  })

  it("o handler avisa o gestor uma vez", async () => {
    const repo = new RepositorioMemoria()
    await repo.salvarConfig({ ativo: true, numerosTeste: [T] })
    const notificar = vi.fn().mockResolvedValue(undefined)
    const d: DepsHandler = { repo, provider, resolverIa: async () => null, enviarTexto: async () => ({ ok: true }), notificarGestor: notificar, log: () => {}, dormir: async () => {} }
    for (let i = 0; i < LIMITE_RESPOSTAS + 3; i++) await tratarMensagemRecebida({ telefone: T, texto: "bom dia", instanceName: "inst" }, d)
    expect(notificar.mock.calls.filter((c) => /muitas respostas/.test(c[0]))).toHaveLength(1)
  })
})

describe("mensagens automáticas do próprio sistema", () => {
  it.each([
    "📋 RESUMO DE ALERTAS DO WHATSAPP\n\n🔴 Desconectadas:",
    "🎉 VENDA FECHADA! 🎉\n\n👤 Cliente: X",
    "🤝 LEAD EM NEGOCIAÇÃO 🤝",
    "🔔 Assistente Virtual encaminhou um atendimento",
    "⚠️ Assistente Virtual: muitas respostas",
    "Resumo do dia 19/11:",
  ])("%s → automática", (t) => expect(ehMensagemAutomatica(t)).toBe(true))

  it.each(["oi", "segunda via do boleto", "Bom dia, preciso de ajuda com um resumo do meu contrato", "quero falar com o Assistente Virtual?"])("%s → cliente de verdade", (t) => expect(ehMensagemAutomatica(t)).toBe(false))

  it("o handler ignora (devolve false, não envia nada)", async () => {
    const repo = new RepositorioMemoria()
    await repo.salvarConfig({ ativo: true, numerosTeste: [T] })
    const enviar = vi.fn()
    const d: DepsHandler = { repo, provider, resolverIa: async () => null, enviarTexto: enviar, log: () => {}, dormir: async () => {} }
    expect(await tratarMensagemRecebida({ telefone: T, texto: "📋 RESUMO DE ALERTAS DO WHATSAPP\n\n⚠️ Conectadas", instanceName: "inst" }, d)).toBe(false)
    expect(enviar).not.toHaveBeenCalled()
  })
})

describe("mensagens seguidas (rajada)", () => {
  const setup = async () => {
    const repo = new RepositorioMemoria()
    await repo.salvarConfig({ ativo: true, numerosTeste: [T] })
    const enviados: string[] = []
    const mk = (aguardarRajada: DepsHandler["aguardarRajada"]): DepsHandler => ({ repo, provider, resolverIa: async () => null, enviarTexto: async (_i, _t, x) => { enviados.push(x); return { ok: true } }, log: () => {}, dormir: async () => {}, aguardarRajada })
    return { repo, enviados, mk }
  }

  it("execução de mensagem que já foi superada: não responde e não deixa a IA de leads responder (true)", async () => {
    const { mk, enviados } = await setup()
    expect(await tratarMensagemRecebida({ telefone: T, texto: "oi", instanceName: "inst", mensagemId: "m1" }, mk(async () => null))).toBe(true)
    expect(enviados).toEqual([])
  })

  it("a execução da mensagem mais nova responde com TODAS as mensagens juntas", async () => {
    const { mk, repo } = await setup()
    await tratarMensagemRecebida({ telefone: T, texto: "preciso do boleto", instanceName: "inst", mensagemId: "m2" }, mk(async () => "oi\npreciso da segunda via do boleto"))
    expect(repo.mensagens.get(repo.conversas[0].id)![0].conteudo).toBe("oi\npreciso da segunda via do boleto")
    expect(repo.conversas).toHaveLength(1)
  })
})

describe("ritmo de digitação (parecer uma pessoa)", () => {
  it("fica entre 0,9 s e 4 s e cresce com o tamanho da mensagem", () => {
    expect(atrasoDigitacao("oi")).toBe(900)
    expect(atrasoDigitacao("x".repeat(60))).toBeGreaterThan(atrasoDigitacao("x".repeat(20)))
    expect(atrasoDigitacao("x".repeat(2000))).toBe(4000)
  })

  it("antes de cada mensagem mostra 'digitando' e espera; nada sai todo de uma vez", async () => {
    const repo = new RepositorioMemoria()
    await repo.salvarConfig({ ativo: true, numerosTeste: ["5511999990001"] })
    const eventos: string[] = []
    const d: DepsHandler = {
      repo, provider, resolverIa: async () => null,
      presenca: async () => { eventos.push("digitando") },
      dormir: async (ms) => { eventos.push(`espera:${ms}`) },
      enviarTexto: async () => { eventos.push("envio"); return { ok: true } },
      log: () => {},
    }
    await tratarMensagemRecebida({ telefone: "5511999990001", texto: "oi", instanceName: "inst" }, d)
    const i = eventos.indexOf("envio")
    expect(eventos.slice(0, i).filter((e) => e === "digitando").length).toBeGreaterThanOrEqual(1)
    expect(eventos.slice(0, i).some((e) => e.startsWith("espera:"))).toBe(true)
  })
})

describe("depois de transferir, e recomeçar do zero pelo painel", () => {
  const transferir = async (repo: RepositorioMemoria) => base(repo, { texto: "quero falar com um atendente" })
  const min = (n: number) => new Date(t0.getTime() + n * 60_000)

  it("logo depois de transferir (poucos minutos) fica em silêncio; passado o prazo, lembra do protocolo com naturalidade", async () => {
    const repo = new RepositorioMemoria()
    await transferir(repo)
    const logo = await base(repo, { texto: "ok", agora: new Date(t0.getTime() + 20_000) })
    expect(logo.respondeu).toBe(false)
    const depois = await base(repo, { texto: "oi", agora: min(SILENCIO_APOS_TRANSFERENCIA_MIN + 1) })
    expect(depois.respondeu).toBe(true)
    expect(depois.respostas.join(" ")).toMatch(/já está com a nossa equipe|Já passei o seu caso/)
    expect(depois.respostas.join(" ")).toContain("COL-")
  })

  it("reiniciar encerra a conversa: o próximo 'oi' é atendido como o primeiro, sem estado nem histórico", async () => {
    const repo = new RepositorioMemoria()
    await transferir(repo)
    expect(repo.conversas[0].estado.etapa).toBe("transferido")
    expect(await repo.reiniciarConversas({ telefone: T }, min(1))).toBe(1)
    expect(repo.conversas[0].status).toBe("encerrada")

    const r = await base(repo, { texto: "oi", agora: min(2) })
    expect(r.respondeu).toBe(true)
    expect(r.respostas.join(" ")).toMatch(/tudo (bem|certo)|Em que posso|Me conta/)
    expect(repo.conversas).toHaveLength(2)
    expect(repo.conversas[1].estado.etapa).toBe("inicio")
    expect(repo.conversas[1].estado.protocolo).toBeUndefined()
    expect(await repo.historico(repo.conversas[1].id, 20)).toHaveLength(2) // só "oi" e a resposta nova
  })

  it("reiniciar por telefone aceita número com ou sem DDI e não mexe em outros clientes", async () => {
    const repo = new RepositorioMemoria()
    await base(repo, { texto: "oi" })
    await base(repo, { texto: "oi", telefone: "5511999990002" })
    expect(await repo.reiniciarConversas({ telefone: "11999990001" }, t0)).toBe(1)
    expect(repo.conversas.find((c) => c.telefone === "5511999990002")!.status).not.toBe("encerrada")
  })

  it("reiniciar por id encerra todas as abertas do mesmo cliente na mesma instância", async () => {
    const repo = new RepositorioMemoria()
    await base(repo, { texto: "oi" })
    expect(await repo.reiniciarConversas({ conversaId: repo.conversas[0].id }, min(1))).toBe(1)
    expect(await repo.reiniciarConversas({ conversaId: repo.conversas[0].id }, min(1))).toBe(0) // já encerrada
    expect(await repo.reiniciarConversas({}, min(1))).toBe(0)
  })

  it("'digitando' só aparece quando ele realmente vai responder", async () => {
    const repo = new RepositorioMemoria()
    await repo.salvarConfig({ ativo: true, numerosTeste: [T] })
    let digitando = 0
    const d: DepsHandler = { repo, provider, resolverIa: async () => null, presenca: async () => { digitando++ }, enviarTexto: async () => ({ ok: true }), log: () => {}, dormir: async () => {} }
    await tratarMensagemRecebida({ telefone: T, texto: "quero falar com um atendente", instanceName: "inst" }, d) // responde (transfere)
    const aposResposta = digitando
    expect(aposResposta).toBeGreaterThan(0)
    await tratarMensagemRecebida({ telefone: T, texto: "ok", instanceName: "inst" }, d) // silêncio pós-transferência
    expect(digitando).toBe(aposResposta) // nenhum "digitando" novo
  })
})

describe("janela das mensagens seguidas", () => {
  const agora = new Date("2026-11-23T01:20:00Z").getTime()
  it("nunca olha além de 60 s, mesmo que a última resposta seja antiga (evita 'ok\noi\noi' grudado em conversa nova)", () => {
    expect(janelaRajada("2026-11-23T01:08:05Z", agora)).toBe("2026-11-23T01:19:00.000Z")
    expect(janelaRajada(undefined, agora)).toBe("2026-11-23T01:19:00.000Z")
  })
  it("se respondeu há poucos segundos, só considera o que veio depois da resposta", () => {
    expect(janelaRajada("2026-11-23T01:19:45Z", agora)).toBe("2026-11-23T01:19:45.000Z")
  })
})
