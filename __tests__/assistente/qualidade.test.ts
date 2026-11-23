import { describe, expect, it, vi } from "vitest"
import { RepositorioMemoria, criarMockProvider, calcularIndicadores, resumirIa, type AgenteDeps, type ChamadaIa } from "@/lib/assistente"
import { ehSoMidia, LIMITE_RESPOSTAS, MSG_SO_TEXTO, atenderMensagem } from "@/lib/assistente/atendimento"
import { ehMensagemAutomatica, tratarMensagemRecebida, type DepsHandler } from "@/lib/assistente/handler"

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
