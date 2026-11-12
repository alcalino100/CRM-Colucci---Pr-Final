import { describe, expect, it } from "vitest"
import {
  chaveConversa,
  juntarRajada,
  custoPor1k,
  normalize,
  MANUAL_PIPELINE_INSTANCES,
} from "@/lib/ai/inbox-common"

describe("inbox-common - chaveConversa", () => {
  it("prioriza leadId quando disponível", () => {
    expect(chaveConversa("lead-123", "5518999999999")).toBe("lead-123")
  })

  it("usa telefone como fallback quando leadId é undefined ou vazio", () => {
    expect(chaveConversa(undefined, "5518999999999")).toBe("5518999999999")
    expect(chaveConversa("", "5518999999999")).toBe("5518999999999")
  })
})

describe("inbox-common - juntarRajada", () => {
  it("junta mensagens em bloco separado por quebra de linha", () => {
    const corpos = ["Oi", "Quero saber o valor", "do imovel"]
    expect(juntarRajada(corpos)).toBe("Oi\nQuero saber o valor\ndo imovel")
  })

  it("ignora valores nulos, vazios ou undefined", () => {
    const corpos = ["Oi", null, "   ", undefined, "tudo bem?"]
    expect(juntarRajada(corpos)).toBe("Oi\ntudo bem?")
  })

  it("limita o tamanho a 2000 caracteres", () => {
    const textoLongo = "a".repeat(1500)
    const texto2 = "b".repeat(1000)
    const res = juntarRajada([textoLongo, texto2])
    expect(res.length).toBe(2000)
  })
})

describe("inbox-common - custoPor1k", () => {
  it("retorna custo estimado correto para cada família de modelo", () => {
    expect(custoPor1k("gpt-4o-mini")).toBe(0.00015)
    expect(custoPor1k("gpt-4o")).toBe(0.0025)
    expect(custoPor1k("claude-3-5-sonnet-20241022")).toBe(0.001)
    expect(custoPor1k("gemini-1.5-flash")).toBe(0.0002)
    expect(custoPor1k("outro-modelo")).toBe(0.0002)
  })
})

describe("inbox-common - normalize e MANUAL_PIPELINE_INSTANCES", () => {
  it("normaliza strings em lowercase sem espacos", () => {
    expect(normalize("  Novo  ")).toBe("novo")
    expect(normalize("EM_ATENDIMENTO")).toBe("em_atendimento")
    expect(normalize("")).toBe("")
  })

  it("contem instância padrão do Brayon", () => {
    expect(MANUAL_PIPELINE_INSTANCES.has("brayon-22b51e92")).toBe(true)
  })
})
