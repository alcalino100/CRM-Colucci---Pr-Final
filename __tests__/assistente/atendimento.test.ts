import { describe, expect, it, vi } from "vitest"
import {
  RepositorioMemoria, criarMockProvider, estadoInicial, indicadoresVazios, mascararTelefone, sanitizarEstado,
  type ChamadaIa,
} from "@/lib/assistente"
import { atenderMensagem, registrarMensagemHumana } from "@/lib/assistente/atendimento"
import { podeAtuar, tratarMensagemHumana, tratarMensagemRecebida, type DepsHandler } from "@/lib/assistente/handler"

const provider = criarMockProvider()
const config = { capacidades: { boleto: true, informe: true, reajuste: true, contrato: true, faq: true }, usarIa: false }
const T = "5511999990001"
const base = (repo: RepositorioMemoria, extra: any = {}) => ({ repo, provider, config, telefone: T, instanceName: "inst", ...extra })

describe("atenderMensagem", () => {
  it("persiste a conversa e continua o estado entre mensagens", async () => {
    const repo = new RepositorioMemoria()
    const t0 = new Date("2026-11-19T10:00:00")
    await atenderMensagem(base(repo, { texto: "segunda via do boleto", agora: t0 }))
    const r2 = await atenderMensagem(base(repo, { texto: "final 8901", agora: new Date(t0.getTime() + 20_000) }))
    expect(repo.conversas).toHaveLength(1)
    expect(r2.respostas.join("\n")).toContain("23793.38128")
    expect(repo.conversas[0].status).toBe("resolvida_ia")
  })

  it("o estado gravado nunca contém CPF completo", () => {
    const e = { ...estadoInicial(), cliente: { id: "c1", nome: "Mariana", cpfCnpj: "12345678901", telefone: "5511999990001", email: "m@x.com", perfil: "inquilino" as const } }
    const s = JSON.stringify(sanitizarEstado(e))
    expect(s).not.toContain("12345678901")
    expect(s).not.toContain("m@x.com")
    expect(s).toContain("8901")
  })

  it("confirmação de identidade continua funcionando com o estado sanitizado", async () => {
    const repo = new RepositorioMemoria()
    const t0 = new Date("2026-11-19T10:00:00")
    await atenderMensagem(base(repo, { texto: "segunda via do boleto", agora: t0 }))
    repo.conversas[0].estado = sanitizarEstado(repo.conversas[0].estado) // como o banco devolveria
    const r = await atenderMensagem(base(repo, { texto: "8901", agora: new Date(t0.getTime() + 5000) }))
    expect(r.respostas.join("\n")).toContain("Identidade confirmada")
  })

  it("transferida: não repete o aviso ao cliente que insiste; depois de 15 min responde de novo", async () => {
    const repo = new RepositorioMemoria()
    const t0 = new Date("2026-11-19T10:00:00")
    await atenderMensagem(base(repo, { texto: "quero falar com um atendente", agora: t0 }))
    const quieto = await atenderMensagem(base(repo, { texto: "alô?", agora: new Date(t0.getTime() + 60_000) }))
    expect(quieto.respondeu).toBe(false)
    const depois = await atenderMensagem(base(repo, { texto: "alô??", agora: new Date(t0.getTime() + 16 * 60_000) }))
    expect(depois.respondeu).toBe(true)
  })

  it("humano assumiu: assistente só registra", async () => {
    const repo = new RepositorioMemoria()
    const t0 = new Date("2026-11-19T10:00:00")
    await atenderMensagem(base(repo, { texto: "oi", agora: t0 }))
    await repo.marcarHumano(T, "inst", t0)
    const r = await atenderMensagem(base(repo, { texto: "segunda via do boleto", agora: new Date(t0.getTime() + 1000) }))
    expect(r.respondeu).toBe(false)
    expect(repo.mensagens.get(repo.conversas[0].id)!.at(-1)!.conteudo).toBe("segunda via do boleto")
  })

  it("conversa antiga (>12h) vira uma nova", async () => {
    const repo = new RepositorioMemoria()
    const t0 = new Date("2026-11-19T10:00:00")
    await atenderMensagem(base(repo, { texto: "oi", agora: t0 }))
    await atenderMensagem(base(repo, { texto: "oi", agora: new Date(t0.getTime() + 13 * 3_600_000) }))
    expect(repo.conversas).toHaveLength(2)
  })

  it("com IA: humaniza e registra o evento; falha da IA não derruba o atendimento", async () => {
    const repo = new RepositorioMemoria()
    const ok: ChamadaIa = vi.fn().mockResolvedValue({ chamadas: [{ name: "entregar_respostas", input: { respostas: ["Oi! Sou a assistente da Colucci. Como posso ajudar? 😊"] } }], tokensTotal: 10, modelo: "m" })
    const r = await atenderMensagem(base(repo, { texto: "bom dia", ia: ok, config: { ...config, usarIa: true } }))
    expect(r.eventos).toContainEqual(expect.objectContaining({ tipo: "ia", funcao: "humanizador", ok: true }))
    const quebrada: ChamadaIa = vi.fn().mockRejectedValue(new Error("fora"))
    const r2 = await atenderMensagem(base(new RepositorioMemoria(), { texto: "bom dia", ia: quebrada, config: { ...config, usarIa: true } }))
    expect(r2.respondeu).toBe(true)
  })

  it("classificador de reserva entende frase que as regras não pegam", async () => {
    const repo = new RepositorioMemoria()
    const ia: ChamadaIa = vi.fn().mockResolvedValue({ chamadas: [{ name: "classificar", input: { intencao: "segunda_via_boleto", confianca: 0.95 } }], tokensTotal: 5, modelo: "m" })
    const r = await atenderMensagem(base(repo, { texto: "cadê o negócio pra pagar esse mês", ia }))
    expect(r.respostas.join(" ")).toContain("4 últimos dígitos")
  })

  it("capacidade desligada manda para a equipe", async () => {
    const repo = new RepositorioMemoria()
    const r = await atenderMensagem(base(repo, { texto: "qual o reajuste do aluguel", config: { ...config, capacidades: { ...config.capacidades, reajuste: false } } }))
    expect(r.escalada?.motivo).toBe("capacidade_desativada")
  })
})

describe("registrarMensagemHumana", () => {
  it("ignora o eco do próprio envio e marca humano quando a mensagem é de uma pessoa", async () => {
    const repo = new RepositorioMemoria()
    const r = await atenderMensagem(base(repo, { texto: "bom dia" }))
    const eco = await registrarMensagemHumana({ repo, telefone: T, instanceName: "inst", texto: r.respostas[0] })
    expect(eco).toBe(false)
    expect(repo.conversas[0].status).not.toBe("humano")
    const humano = await registrarMensagemHumana({ repo, telefone: T, instanceName: "inst", texto: "Oi, aqui é a Carla da Colucci" })
    expect(humano).toBe(true)
    expect(repo.conversas[0].status).toBe("humano")
  })
})

describe("podeAtuar (trava de segurança)", () => {
  const cfg = { ativo: true, instancias: ["inst"], numerosTeste: ["5511999990001"], capacidades: config.capacidades, usarIa: false }
  it("desligado: nunca", () => expect(podeAtuar({ ...cfg, ativo: false }, provider, T, "inst").pode).toBe(false))
  it("fora da instância e não-teste: nunca", () => expect(podeAtuar(cfg, provider, "5511988887777", "outra").pode).toBe(false))
  it("provedor simulado: só número de teste, mesmo em instância liberada", () => {
    expect(podeAtuar(cfg, provider, "5511988887777", "inst")).toEqual({ pode: false, motivo: "provedor_simulado_so_teste" })
    expect(podeAtuar(cfg, provider, T, "inst").pode).toBe(true)
  })
  it("número de teste funciona em qualquer instância e com/sem DDI", () => {
    expect(podeAtuar(cfg, provider, "11999990001", "qualquer").pode).toBe(true)
  })
  it("provedor real: instância liberada atende cliente real", () => {
    expect(podeAtuar(cfg, { ...provider, nome: "immobillis" }, "5511988887777", "inst").pode).toBe(true)
  })
})

describe("tratarMensagemRecebida", () => {
  function deps(repo: RepositorioMemoria, over: Partial<DepsHandler> = {}) {
    const enviados: string[] = []
    const d: DepsHandler = {
      repo, provider, resolverIa: async () => null,
      enviarTexto: async (_i, _t, texto) => { enviados.push(texto); return { ok: true, keyId: "k" } },
      notificarGestor: vi.fn().mockResolvedValue(undefined),
      log: () => {}, dormir: async () => {},
      ...over,
    }
    return { d, enviados }
  }

  it("desligado: devolve false e não envia nada (fluxo de leads segue igual)", async () => {
    const repo = new RepositorioMemoria()
    const { d, enviados } = deps(repo)
    expect(await tratarMensagemRecebida({ telefone: T, texto: "oi", instanceName: "inst" }, d)).toBe(false)
    expect(enviados).toEqual([])
  })

  it("banco indisponível: devolve false (nunca bloqueia o fluxo normal)", async () => {
    const repo = new RepositorioMemoria()
    repo.obterConfig = async () => { throw new Error("relation does not exist") }
    expect(await tratarMensagemRecebida({ telefone: T, texto: "oi", instanceName: "inst" }, deps(repo).d)).toBe(false)
  })

  it("número de teste: responde, envia e registra no Inbox", async () => {
    const repo = new RepositorioMemoria()
    await repo.salvarConfig({ ativo: true, numerosTeste: [T] })
    const registrar = vi.fn().mockResolvedValue(undefined)
    const { d, enviados } = deps(repo, { registrarNoInbox: registrar })
    expect(await tratarMensagemRecebida({ telefone: T, texto: "bom dia", instanceName: "inst" }, d)).toBe(true)
    expect(enviados.join("")).toContain("assistente virtual")
    expect(registrar).toHaveBeenCalled()
  })

  it("cliente real com provedor simulado: NÃO assume (devolve false, nada enviado)", async () => {
    const repo = new RepositorioMemoria()
    await repo.salvarConfig({ ativo: true, instancias: ["inst"], numerosTeste: [] })
    const { d, enviados } = deps(repo)
    expect(await tratarMensagemRecebida({ telefone: "5511977776666", texto: "segunda via do boleto", instanceName: "inst" }, d)).toBe(false)
    expect(enviados).toEqual([])
  })

  it("escalada avisa o gestor com protocolo", async () => {
    const repo = new RepositorioMemoria()
    await repo.salvarConfig({ ativo: true, numerosTeste: [T] })
    const notificar = vi.fn().mockResolvedValue(undefined)
    await tratarMensagemRecebida({ telefone: T, texto: "quero falar com um atendente", instanceName: "inst" }, deps(repo, { notificarGestor: notificar }).d)
    expect(notificar.mock.calls[0][0]).toMatch(/Protocolo: COL-/)
  })

  it("erro inesperado: avisa o gestor e ainda assim assume (IA de leads não responde por cima)", async () => {
    const repo = new RepositorioMemoria()
    await repo.salvarConfig({ ativo: true, numerosTeste: [T] })
    const notificar = vi.fn().mockResolvedValue(undefined)
    const { d } = deps(repo, { enviarTexto: async () => { throw new Error("evolution caiu") }, notificarGestor: notificar })
    expect(await tratarMensagemRecebida({ telefone: T, texto: "bom dia", instanceName: "inst" }, d)).toBe(true)
    expect(notificar.mock.calls[0][0]).toContain("falhou")
  })

  it("mensagem humana na instância silencia o assistente", async () => {
    const repo = new RepositorioMemoria()
    await repo.salvarConfig({ ativo: true, numerosTeste: [T] })
    const { d, enviados } = deps(repo)
    await tratarMensagemRecebida({ telefone: T, texto: "bom dia", instanceName: "inst" }, d)
    await tratarMensagemHumana({ telefone: T, texto: "Oi, é a Carla, já te ajudo", instanceName: "inst" }, d)
    const antes = enviados.length
    await tratarMensagemRecebida({ telefone: T, texto: "segunda via do boleto", instanceName: "inst" }, d)
    expect(enviados.length).toBe(antes)
  })
})

describe("mascararTelefone / indicadores", () => {
  it("mascara o telefone", () => {
    expect(mascararTelefone("5511999990001")).toBe("+55 11 9****-0001")
    expect(mascararTelefone("abc")).toBe("••••")
  })

  it("indicadores a partir das conversas reais", async () => {
    const repo = new RepositorioMemoria()
    const t0 = new Date("2026-11-19T10:00:00")
    await atenderMensagem(base(repo, { texto: "segunda via do boleto", agora: t0 }))
    await atenderMensagem(base(repo, { texto: "8901", agora: new Date(t0.getTime() + 10_000) }))
    await atenderMensagem(base(repo, { telefone: "5511999990002", texto: "quero falar com atendente", agora: t0 }))
    const i = await repo.calcularIndicadores(new Date("2026-11-19T00:00:00"))
    expect(i.atendimentos).toBe(2)
    expect(i.resolvidosIaPct).toBe(50)
    expect(i.transferidos).toBe(1)
    expect(i.minutosEconomizados).toBe(4)
    expect(i.porIntencao.map((x) => x.intencao)).toEqual(expect.arrayContaining(["segunda_via_boleto", "falar_com_humano"]))
    const lista = await repo.listarAtendimentos({ limite: 10 })
    expect(lista[0].telefoneMascarado).toMatch(/\*\*\*\*/)
    expect(JSON.stringify(lista)).not.toContain("5511999990001")
  })
  it("indicadoresVazios", () => expect(indicadoresVazios().atendimentos).toBe(0))
})
