import { describe, expect, it, vi } from "vitest"
import {
  nomeApresentacao,
  FERRAMENTAS_AGENTE, RepositorioMemoria, criarMockProvider, estadoInicial, fatosNaoRastreaveis, montarSystemPrompt, atenderComAgente,
  type AgenteDeps, type Estado, type LlmAgente,
} from "@/lib/assistente"
import { atenderMensagem } from "@/lib/assistente/atendimento"

const provider = criarMockProvider()
const agora = new Date("2026-11-19T10:00:00")
const T = "5511999990001" // Mariana (CPF final 8901)
const gerarProtocolo = () => "COL-TESTE-0001"

type Roteiro = (c: { tool: (n: string, i?: Record<string, unknown>) => Promise<string>; p: Parameters<LlmAgente>[0] }) => Promise<string>
const llmDe = (r: Roteiro): LlmAgente => async (p) => ({ texto: await r({ tool: (n, i = {}) => p.onToolUse(n, i), p }), tokensTotal: 100, modelo: "claude-fake" })
const agenteDe = (r: Roteiro, extra: Partial<AgenteDeps> = {}): AgenteDeps => ({ llm: llmDe(r), ...extra })

const rodar = (r: Roteiro, o: { estado?: Estado; texto?: string; telefone?: string; historico?: any[]; capacidades?: any; extra?: Partial<AgenteDeps> } = {}) =>
  atenderComAgente({ agente: agenteDe(r, o.extra), provider, estado: o.estado ?? estadoInicial(), historico: o.historico ?? [], texto: o.texto ?? "preciso da segunda via do boleto", telefone: o.telefone ?? T, agora, capacidades: o.capacidades, gerarProtocolo })

describe("modo agente: fluxo feliz", () => {
  it("identifica, busca o boleto e responde com os dados exatos da ferramenta", async () => {
    const r = await rodar(async ({ tool }) => {
      expect(await tool("verificar_identidade", { ultimos4: "8901" })).toContain("CONFIRMADA")
      const b = await tool("buscar_boletos")
      return `Prontinho, Mariana! 😊\n\n${b}`
    })
    expect(r).not.toBeNull()
    expect(r!.estado.etapa).toBe("identificado")
    expect(r!.respostas.join("\n")).toContain("23793.38128 60000.000003 00000.000408 1 98760000280000")
    expect(r!.respostas.join("\n").replace(/\u00a0/g, " ")).toContain("R$ 2.800,00")
    expect(r!.eventos).toContainEqual({ tipo: "intencao", intencao: "segunda_via_boleto" })
    expect(r!.eventos).toContainEqual({ tipo: "resolvido_automaticamente" })
    expect(r!.eventos).toContainEqual({ tipo: "identidade", resultado: "confirmada" })
    expect(r!.tokens).toBe(100)
  })

  it("cliente já identificado em turno anterior não precisa confirmar de novo", async () => {
    const e1 = (await rodar(async ({ tool }) => { await tool("verificar_identidade", { ultimos4: "8901" }); return "Identidade confirmada, Mariana." }))!.estado
    const r = await rodar(async ({ tool }) => `Aqui: ${await tool("listar_contratos")}`, { estado: e1, texto: "e meu contrato?" })
    expect(r!.respostas.join(" ")).toContain("Rua das Flores, 120")
  })
})

describe("modo agente: trilhos de segurança", () => {
  it("dado financeiro sem identidade: ferramenta recusa e nada vaza", async () => {
    const r = await rodar(async ({ tool }) => {
      const out = await tool("buscar_boletos")
      expect(out).toContain("IDENTIDADE NÃO VERIFICADA")
      return "Para sua segurança, me informe os 4 últimos dígitos do CPF cadastrado."
    })
    expect(r!.estado.etapa).not.toBe("identificado")
    expect(r!.respostas.join(" ")).not.toContain("23793")
  })

  it("modelo que tenta inventar valor é barrado (devolve null → fluxo de regras)", async () => {
    const r = await rodar(async ({ tool }) => { await tool("verificar_identidade", { ultimos4: "8901" }); await tool("buscar_boletos"); return "Seu boleto é de R$ 1.999,00 e vence em 05/12/2026." })
    expect(r).toBeNull()
  })

  it("modelo que escreve o CPF completo é barrado", async () => {
    expect(await rodar(async () => "Seu CPF 12345678901 está confirmado.")).toBeNull()
  })

  it("4 dígitos errados 3 vezes: código escala sozinho e gera protocolo", async () => {
    const r = await rodar(async ({ tool }) => {
      await tool("verificar_identidade", { ultimos4: "0000" })
      await tool("verificar_identidade", { ultimos4: "1111" })
      const t3 = await tool("verificar_identidade", { ultimos4: "2222" })
      expect(t3).toContain("ENCAMINHADO")
      expect(await tool("buscar_boletos")).toContain("já encaminhada")
      return "Não consegui confirmar sua identidade, vou chamar a equipe. Protocolo: COL-TESTE-0001."
    })
    expect(r!.estado.etapa).toBe("transferido")
    expect(r!.eventos).toContainEqual({ tipo: "identidade", resultado: "bloqueada" })
    expect(r!.eventos.find((e) => e.tipo === "escalada")).toMatchObject({ departamento: "administrativo", protocolo: "COL-TESTE-0001" })
  })

  it("telefone não cadastrado: encaminha sem expor dados", async () => {
    const r = await rodar(async ({ tool }) => {
      const out = await tool("verificar_identidade", { ultimos4: "8901" })
      expect(out).toContain("TELEFONE NÃO CADASTRADO")
      return "Não localizei seu número, vou chamar a equipe."
    }, { telefone: "5511900000000" })
    expect(r!.estado.etapa).toBe("transferido")
    expect(r!.respostas.join(" ")).toContain("COL-TESTE-0001") // protocolo acrescentado pelo código
  })

  it("Immobillis fora do ar: ferramenta orienta a encaminhar e o cliente não vê erro técnico", async () => {
    const llm = llmDe(async ({ tool }) => { const o = await tool("verificar_identidade", { ultimos4: "8901" }); expect(o).toContain("SISTEMA INDISPONÍVEL"); return "Estou com instabilidade agora, já chamei a equipe." })
    const r = await atenderComAgente({ agente: { llm }, provider: criarMockProvider({ indisponivel: true }), estado: estadoInicial(), historico: [], texto: "boleto", telefone: T, agora, gerarProtocolo })
    expect(r!.estado.etapa).toBe("transferido")
  })

  it("capacidade desligada pelo gestor: ferramenta recusa", async () => {
    const r = await rodar(async ({ tool }) => {
      await tool("verificar_identidade", { ultimos4: "8901" })
      expect(await tool("buscar_boletos")).toContain("RECURSO DESATIVADO")
      return "Esse assunto eu passo para a equipe."
    }, { capacidades: { boleto: false } })
    expect(r).not.toBeNull()
  })

  it("nenhuma ferramenta aceita id de cliente/CPF vindo do modelo (anti-injeção)", () => {
    for (const f of FERRAMENTAS_AGENTE) {
      const props = Object.keys((f.input_schema as any).properties ?? {})
      expect(props.filter((k) => /cliente|cpf|cnpj|telefone|contrato/i.test(k))).toEqual([])
    }
  })

  it("falha do Claude devolve null (o chamador cai para as regras)", async () => {
    expect(await rodar(async () => { throw new Error("overloaded") })).toBeNull()
  })

  it("resposta vazia sem encaminhamento devolve null", async () => {
    expect(await rodar(async () => "   ")).toBeNull()
  })
})

describe("modo agente: encaminhamento e conhecimento", () => {
  it("encaminhar_para_equipe cria protocolo e departamento pelo código", async () => {
    const r = await rodar(async ({ tool }) => { const o = await tool("encaminhar_para_equipe", { departamento: "manutencao", motivo: "Vazamento na pia" }); return `Anotei! ${o.includes("COL-TESTE-0001") ? "Protocolo COL-TESTE-0001." : ""}` }, { texto: "tem vazamento na pia" })
    expect(r!.estado).toMatchObject({ etapa: "transferido", departamento: "manutencao", protocolo: "COL-TESTE-0001" })
    expect(r!.eventos).toContainEqual({ tipo: "intencao", intencao: "manutencao" })
    expect(r!.eventos.find((e) => e.tipo === "escalada")).toMatchObject({ motivo: "vazamento_na_pia" })
  })

  it("departamento inventado vira administrativo", async () => {
    const r = await rodar(async ({ tool }) => { await tool("encaminhar_para_equipe", { departamento: "diretoria_secreta", motivo: "x" }); return "Encaminhei." })
    expect(r!.estado.departamento).toBe("administrativo")
  })

  it("usa a base de conhecimento e só aceita fatos que vieram dela", async () => {
    const conhecimento = vi.fn().mockResolvedValue("Atendimento presencial de segunda a sexta, das 9h às 17h.")
    const ok = await rodar(async ({ tool }) => `Atendemos de segunda a sexta, das 9h às 17h. ${(await tool("buscar_conhecimento", { pergunta: "horário" })).slice(0, 0)}`, { texto: "qual o horário?", extra: { conhecimento } })
    expect(conhecimento).toHaveBeenCalledWith("horário")
    expect(ok!.eventos).toContainEqual({ tipo: "resolvido_automaticamente" })
    const sem = await rodar(async ({ tool }) => { const o = await tool("buscar_conhecimento", { pergunta: "x" }); expect(o).toContain("NADA ENCONTRADO"); return "Vou chamar a equipe." }, { extra: { conhecimento: async () => "" } })
    expect(sem!.eventos).not.toContainEqual({ tipo: "resolvido_automaticamente" })
  })
})

describe("modo agente: contexto enviado ao Claude", () => {
  it("histórico começa por mensagem do cliente e termina na atual", async () => {
    let msgs: any[] = []
    await rodar(async ({ p }) => { msgs = p.messages; return "Olá!" }, { texto: "oi de novo", historico: [{ papel: "assistente", conteudo: "Olá!" }, { papel: "cliente", conteudo: "oi" }, { papel: "assistente", conteudo: "Como posso ajudar?" }] })
    expect(msgs[0].role).toBe("user")
    expect(msgs.at(-1)).toEqual({ role: "user", content: "oi de novo" })
  })

  it("system prompt traz regras, persona e situação de identidade", () => {
    const p = montarSystemPrompt({ persona: { nome: "Júlia - Clientes", system: "Trate todos por 'você'.", voz: "leve e simpática" }, estado: estadoInicial(), agora, capacidades: { reajuste: false } })
    expect(p).toContain("Júlia")
    expect(p).toContain("REGRAS OBRIGATÓRIAS")
    expect(p).toContain("AINDA NÃO identificado")
    expect(p).toContain("Trate todos por 'você'.")
    expect(p).toContain("leve e simpática")
    expect(p).toContain("reajuste")
    expect(p).toContain("19/11/2026")
  })
})

describe("dados escritos pela Colucci no prompt do agente", () => {
  const empresa = "Telefone: (18) 2103-4900. WhatsApp: (18) 99197-6332. CEP: 16015-245. CRECI: 039072-J. Atendimento das 8h00 às 18h00."
  const resposta = "Nosso telefone é (18) 2103-4900 e o endereço fica no CEP 16015-245."

  it("valem como fonte: o assistente pode informar telefone, CEP e CRECI sem ser barrado", async () => {
    const r = await rodar(async () => resposta, { texto: "qual o telefone de vocês?", extra: { persona: { instrucoes: empresa } } })
    expect(r).not.toBeNull()
    expect(r!.respostas.join(" ")).toContain("2103-4900")
  })

  it("sem estar no prompt, o mesmo número continua barrado (não é inventado em silêncio)", async () => {
    expect(await rodar(async () => resposta, { texto: "qual o telefone de vocês?" })).toBeNull()
  })

  it("mas um número que NÃO está no prompt nem nas ferramentas segue barrado", async () => {
    expect(await rodar(async () => "Ligue para (18) 3333-9999.", { texto: "telefone?", extra: { persona: { instrucoes: empresa } } })).toBeNull()
  })
})

describe("nome de apresentação do agente", () => {
  it.each([
    ["Aurora - Atendimento Clientes", "Aurora"],
    ["Aurora", "Aurora"],
    ["IA - RELAÇÕES PÚBLICAS", "Assistente Colucci"],
    ["Novo Agente", "Assistente Colucci"],
    ["", "Assistente Colucci"],
    [undefined, "Assistente Colucci"],
  ])("%s → %s", (entrada, esperado) => expect(nomeApresentacao(entrada as string | undefined)).toBe(esperado))
})

describe("fatosNaoRastreaveis", () => {
  it("aceita fatos presentes nas fontes e acusa os ausentes", () => {
    expect(fatosNaoRastreaveis("Vence em 10/11/2026: R$ 2.800,00", ["Vencimento: 10/11/2026\nValor: R$ 2.800,00"])).toEqual([])
    expect(fatosNaoRastreaveis("Vence em 11/11/2026: R$ 2.800,00", ["Vencimento: 10/11/2026\nValor: R$ 2.800,00"])).toEqual(["11/11/2026"])
  })
})

describe("atenderMensagem com agente", () => {
  const cfg = { capacidades: { boleto: true, informe: true, reajuste: true, contrato: true, faq: true }, usarIa: true }
  const base = (repo: RepositorioMemoria, agente: AgenteDeps | null, texto: string, quando = agora) => atenderMensagem({ repo, provider, config: cfg, telefone: T, instanceName: "inst", texto, agora: quando, agente, gerarProtocolo })

  it("persiste a conversa, mantém identidade entre turnos e usa o histórico", async () => {
    const repo = new RepositorioMemoria()
    const vistos: number[] = []
    const agente = agenteDe(async ({ tool, p }) => {
      vistos.push(p.messages.length)
      if (p.messages.at(-1)!.content === "segunda via do boleto") return "Claro! Me passe os 4 últimos dígitos do CPF cadastrado."
      await tool("verificar_identidade", { ultimos4: "8901" })
      return `Pronto!\n\n${await tool("buscar_boletos")}`
    })
    await base(repo, agente, "segunda via do boleto")
    const r2 = await base(repo, agente, "8901", new Date(agora.getTime() + 15_000))
    expect(repo.conversas).toHaveLength(1)
    expect(repo.conversas[0].status).toBe("resolvida_ia")
    expect(repo.conversas[0].estado.etapa).toBe("identificado")
    expect(vistos).toEqual([1, 3]) // 2º turno viu: pedido, resposta do assistente e "8901"
    expect(r2.respostas.join("\n")).toContain("23793.38128")
    expect(r2.eventos).toContainEqual(expect.objectContaining({ tipo: "ia", funcao: "agente", ok: true }))
  })

  it("se a resposta do Claude não passa na conferência, cai para o fluxo de regras e registra", async () => {
    const repo = new RepositorioMemoria()
    const r = await base(repo, agenteDe(async () => "Seu boleto vence em 01/01/2030 e custa R$ 123,45."), "bom dia")
    expect(r.respondeu).toBe(true)
    expect(r.respostas.join(" ")).toContain("assistente virtual da Colucci")
    expect(r.eventos).toContainEqual(expect.objectContaining({ tipo: "ia", funcao: "agente", ok: false, erro: expect.stringContaining("conferência") }))
  })

  it("Claude fora do ar: segue 100% pelas regras", async () => {
    const r = await base(new RepositorioMemoria(), agenteDe(async () => { throw new Error("down") }), "quero falar com um atendente")
    expect(r.escalada?.protocolo).toBe("COL-TESTE-0001")
  })

  it("com usarIa desligado o agente nem é chamado", async () => {
    const llm = vi.fn()
    await atenderMensagem({ repo: new RepositorioMemoria(), provider, config: { ...cfg, usarIa: false }, telefone: T, instanceName: "i", texto: "oi", agente: { llm } as any })
    expect(llm).not.toHaveBeenCalled()
  })
})
