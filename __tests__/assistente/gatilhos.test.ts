import { describe, expect, it } from "vitest"
import { blocoGatilhos, blocoMetas, departamentoDe, estadoInicial, gatilhoObrigatorio, montarSystemPrompt, atenderComAgente, criarMockProvider, type AgenteDeps, type GatilhoAgente, type LlmAgente, type MetaAgente } from "@/lib/assistente"

const G = (nome: string, acao: string, palavras: string[], departamento: GatilhoAgente["departamento"], condicao: GatilhoAgente["condicao"] = "keyword"): GatilhoAgente => ({ nome, condicao, palavras, acao, departamento })
const gatilhos: GatilhoAgente[] = [
  G("Pediu atendente humano", "immediate_handoff", ["atendente", "humano", "gerente", "falar com alguém"], "administrativo"),
  G("Ameaça jurídica", "escalate_specialist", ["procon", "advogado", "justiça"], "administrativo"),
  G("Urgência no imóvel", "immediate_handoff", ["cheiro de gás", "vazamento de gás", "curto circuito"], "manutencao"),
  G("Insatisfação", "immediate_handoff", [], "administrativo", "sentiment"),
  G("Rescisão e renovação", "notify_team", ["rescisão", "renovar", "multa"], "administrativo"),
  G("Pagamento a analisar", "notify_team", ["já paguei", "desconto"], "financeiro"),
  G("Limite de trocas", "notify_team", [], "administrativo", "max_turns"),
]
const metas: MetaAgente[] = [{ nome: "Resolver na hora", tipo: "info", descricao: "d", prompt: "Entregue o dado exatamente como a ferramenta devolveu.", perguntas: ["Precisa de mais algo?"], proximoPasso: "Encerrar com cordialidade.", planoB: "Encaminhar." }]

describe("gatilhoObrigatorio", () => {
  it.each([
    ["quero falar com um atendente", "Pediu atendente humano", "administrativo"],
    ["Quero falar com alguém por favor", "Pediu atendente humano", "administrativo"],
    ["vou chamar o procon", "Ameaça jurídica", "administrativo"],
    ["estou sentindo cheiro de gás no apartamento", "Urgência no imóvel", "manutencao"],
  ])("%s → %s", (texto, nome, dep) => {
    const g = gatilhoObrigatorio(gatilhos, texto)
    expect(g?.nome).toBe(nome)
    expect(g?.departamento).toBe(dep)
  })

  it("gatilhos 'notify_team' NÃO forçam: quem só pergunta sobre renovar/multa/desconto segue com o Claude", () => {
    for (const t of ["quando vence e como renovar meu contrato?", "qual a multa se eu sair?", "tem desconto pagando em dia?", "já paguei o boleto de outubro"]) {
      expect(gatilhoObrigatorio(gatilhos, t)).toBeNull()
    }
  })

  it("mensagem comum não aciona nada; insatisfação clara aciona o gatilho de sentimento", () => {
    expect(gatilhoObrigatorio(gatilhos, "bom dia, preciso da segunda via do boleto")).toBeNull()
    expect(gatilhoObrigatorio(gatilhos, "ISSO É UM ABSURDO!! NINGUÉM RESOLVE NADA")?.nome).toBe("Insatisfação")
    expect(gatilhoObrigatorio([], "atendente")).toBeNull()
    expect(gatilhoObrigatorio(gatilhos, "   ")).toBeNull()
  })

  it("ignora acentos e caixa: cliente sem acento aciona palavra cadastrada com acento (e vice-versa)", () => {
    expect(gatilhoObrigatorio(gatilhos, "JUSTICA vai resolver")?.nome).toBe("Ameaça jurídica")
    expect(gatilhoObrigatorio(gatilhos, "quero falar com alguem")?.nome).toBe("Pediu atendente humano")
    expect(gatilhoObrigatorio(gatilhos, "tem cheiro de gas aqui")?.nome).toBe("Urgência no imóvel")
    expect(gatilhoObrigatorio(gatilhos, "Preciso de um ADVOGADO")?.nome).toBe("Ameaça jurídica")
  })

  it("setor inválido ou vazio cai em administrativo", () => {
    expect(departamentoDe("financeiro")).toBe("financeiro")
    expect(departamentoDe("Manutencao")).toBe("manutencao")
    expect(departamentoDe("diretoria")).toBe("administrativo")
    expect(departamentoDe(null)).toBe("administrativo")
  })
})

describe("blocos no prompt", () => {
  it("metas e gatilhos entram no prompt do agente", () => {
    const p = montarSystemPrompt({ persona: { nome: "Aurora", metas, gatilhos }, estado: estadoInicial(), agora: new Date("2026-11-23T10:00:00") })
    expect(p).toContain("METAS DO ATENDIMENTO")
    expect(p).toContain("Resolver na hora (info)")
    expect(p).toContain("Perguntas possíveis: Precisa de mais algo?")
    expect(p).toContain("GATILHOS DE ENCAMINHAMENTO")
    expect(p).toContain("Pediu atendente humano")
    expect(p).toMatch(/Urgência no imóvel.*setor manutencao, encaminhamento imediato/)
    expect(p).toMatch(/Rescisão e renovação.*encaminhe se o pedido realmente exigir/)
  })

  it("sem metas nem gatilhos, nenhum bloco vazio", () => {
    const p = montarSystemPrompt({ persona: { nome: "Aurora" }, estado: estadoInicial(), agora: new Date() })
    expect(p).not.toContain("METAS DO ATENDIMENTO")
    expect(p).not.toContain("GATILHOS DE ENCAMINHAMENTO")
    expect(blocoMetas([])).toBe("")
    expect(blocoGatilhos([])).toBe("")
  })

  it("limita o tamanho (prompt de meta enorme é cortado)", () => {
    expect(blocoMetas([{ ...metas[0], prompt: "x".repeat(2000) }]).length).toBeLessThan(900)
  })
})

describe("o código cumpre a escalação de ação imediata antes do Claude", () => {
  const provider = criarMockProvider()
  const agora = new Date("2026-11-23T10:00:00")
  const llmQueApenasEscreve: LlmAgente = async (p) => ({ texto: `Entendi, e sinto muito. ${/protocolo (COL-[A-Z0-9-]+)/.exec(p.system)?.[0] ?? ""}. A equipe continua por aqui.`.replace("protocolo ", "Seu protocolo é "), tokensTotal: 10, modelo: "m" })
  const rodar = (texto: string, agente: AgenteDeps) => atenderComAgente({ agente, provider, estado: estadoInicial(), historico: [], texto, telefone: "5511999990001", agora, gerarProtocolo: () => "COL-TESTE-0001" })

  it("pediu atendente: transfere para o setor do gatilho, com protocolo, sem depender do modelo lembrar", async () => {
    const r = await rodar("quero falar com um atendente", { llm: llmQueApenasEscreve, persona: { gatilhos } })
    expect(r!.estado).toMatchObject({ etapa: "transferido", departamento: "administrativo", protocolo: "COL-TESTE-0001" })
    expect(r!.eventos.find((e) => e.tipo === "escalada")).toMatchObject({ departamento: "administrativo", motivo: "pediu_atendente_humano" })
    expect(r!.respostas.join(" ")).toContain("COL-TESTE-0001")
  })

  it("urgência vai para manutenção", async () => {
    const r = await rodar("sinto cheiro de gás aqui", { llm: llmQueApenasEscreve, persona: { gatilhos } })
    expect(r!.estado.departamento).toBe("manutencao")
  })

  it("o Claude recebe a nota de que o encaminhamento JÁ foi feito (e não tenta resolver)", async () => {
    let system = ""
    await rodar("vou chamar o procon", { llm: async (p) => { system = p.system; return { texto: "Sinto muito. Seu protocolo é COL-TESTE-0001, a equipe continua por aqui.", tokensTotal: 1, modelo: "m" } }, persona: { gatilhos } })
    expect(system).toContain("ENCAMINHAMENTO JÁ REALIZADO PELO SISTEMA")
    expect(system).toContain("Ameaça jurídica")
    expect(system).toContain("COL-TESTE-0001")
  })

  it("mensagem sem gatilho segue o fluxo normal (nada é forçado)", async () => {
    const r = await rodar("oi, tudo bem?", { llm: async () => ({ texto: "Oi, tudo bem? Como posso te ajudar?", tokensTotal: 1, modelo: "m" }), persona: { gatilhos } })
    expect(r!.estado.etapa).toBe("inicio")
    expect(r!.eventos.find((e) => e.tipo === "escalada")).toBeUndefined()
  })

  it("'renovar' sozinho NÃO transfere: o Claude responde e decide", async () => {
    const r = await rodar("como faço para renovar meu contrato?", { llm: async () => ({ texto: "Posso te ajudar com isso. Você já confirmou os dados?", tokensTotal: 1, modelo: "m" }), persona: { gatilhos } })
    expect(r!.estado.etapa).not.toBe("transferido")
  })

  it("sem gatilhos cadastrados, comportamento idêntico ao anterior", async () => {
    const r = await rodar("quero falar com um atendente", { llm: async () => ({ texto: "Claro, já te passo para a equipe.", tokensTotal: 1, modelo: "m" }) })
    expect(r!.estado.etapa).toBe("inicio")
  })
})
