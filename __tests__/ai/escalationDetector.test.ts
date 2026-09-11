import { describe, expect, it } from "vitest"
import { avaliarTriggers } from "@/lib/ai/escalationDetector"
import type { EscalationTrigger } from "@/lib/ai/types"

function trig(partial: Partial<EscalationTrigger> & { condition: EscalationTrigger["condition"] }): EscalationTrigger {
  return {
    id: `trig_test_${partial.condition}`,
    ai_id: "ai_test",
    name: `Trigger ${partial.condition}`,
    detection_keywords: [],
    action: "notify_team",
    notification_channels: ["whatsapp"],
    created_at: new Date().toISOString(),
    ...partial,
  }
}

const KW = () =>
  trig({ condition: "keyword", name: "Humano pedido", detection_keywords: ["humano", "atendente", "cancelar"] })
const SENT = () => trig({ condition: "sentiment", name: "Frustração" })
const TURNS = () => trig({ condition: "max_turns", name: "Limite turnos" })

const hist = (n: number) => Array.from({ length: n }, (_, i) => ({ role: i % 2 === 0 ? "user" : "ia", content: `msg ${i}` }))

describe("avaliarTriggers — keyword", () => {
  it("detecta keyword exata", () => {
    const r = avaliarTriggers([KW()], "Quero falar com humano", [], 10)
    expect(r.shouldEscalate).toBe(true)
    expect(r.severity).toBe("high")
    expect(r.triggerName).toBe("Humano pedido")
  })

  it("detecta keyword case-insensitive", () => {
    const r = avaliarTriggers([KW()], "quero CANCELAR tudo", [], 10)
    expect(r.shouldEscalate).toBe(true)
    expect(r.reason).toContain("cancelar")
  })

  it("não escala sem keyword", () => {
    const r = avaliarTriggers([KW()], "Qual o horário de atendimento?", [], 10)
    expect(r.shouldEscalate).toBe(false)
    expect(r.severity).toBe("low")
  })

  it("ignora keywords vazias", () => {
    const r = avaliarTriggers([trig({ condition: "keyword", detection_keywords: ["  ", ""] })], "humano", [], 10)
    expect(r.shouldEscalate).toBe(false)
  })
})

describe("avaliarTriggers — sentiment", () => {
  it("CAPS + !!! escala com high", () => {
    const r = avaliarTriggers([SENT()], "ESTOU MUITO FRUSTRADO!!!", [], 10)
    expect(r.shouldEscalate).toBe(true)
    expect(r.severity).toBe("high")
  })

  it("CAPS sozinho escala com medium", () => {
    const r = avaliarTriggers([SENT()], "QUERO FALAR COM ALGUEM", [], 10)
    expect(r.shouldEscalate).toBe(true)
    expect(r.severity).toBe("medium")
  })

  it("2+ palavras negativas escala com high", () => {
    const r = avaliarTriggers([SENT()], "isso nunca funciona, péssimo atendimento, horrível", [], 10)
    expect(r.shouldEscalate).toBe(true)
    expect(r.severity).toBe("high")
  })

  it("mensagem normal curta não escala", () => {
    const r = avaliarTriggers([SENT()], "Oi", [], 10)
    expect(r.shouldEscalate).toBe(false)
  })

  it("mensagem normal longa não escala", () => {
    const r = avaliarTriggers([SENT()], "Olá, gostaria de saber mais sobre o apartamento de 2 quartos", [], 10)
    expect(r.shouldEscalate).toBe(false)
  })

  it("uma palavra negativa isolada não escala", () => {
    const r = avaliarTriggers([SENT()], "o pior horário seria de manhã?", [], 10)
    expect(r.shouldEscalate).toBe(false)
  })
})

describe("avaliarTriggers — max_turns", () => {
  it("escala ao atingir o teto", () => {
    const h = Array.from({ length: 10 }, (_, i) => ({ role: "ia", content: `r${i}` }))
    const r = avaliarTriggers([TURNS()], "continuando...", h, 10)
    expect(r.shouldEscalate).toBe(true)
    expect(r.severity).toBe("medium")
    expect(r.reason).toContain("10")
  })

  it("não escala abaixo do teto", () => {
    const h = Array.from({ length: 3 }, (_, i) => ({ role: "ia", content: `r${i}` }))
    const r = avaliarTriggers([TURNS()], "continuando...", h, 10)
    expect(r.shouldEscalate).toBe(false)
  })

  it("conta role assistant como IA", () => {
    const h = Array.from({ length: 4 }, (_, i) => ({ role: "assistant", content: `r${i}` }))
    const r = avaliarTriggers([TURNS()], "oi", h, 4)
    expect(r.shouldEscalate).toBe(true)
  })
})

describe("avaliarTriggers — bateria da spec (casos exatos)", () => {
  const bateria = () => [
    trig({ condition: "keyword", name: "Bateria", detection_keywords: ["cancelar", "reembolso", "humano"] }),
    trig({ condition: "sentiment", name: "BateriaSent" }),
  ]
  const cases: { msg: string; should: boolean }[] = [
    { msg: "cancelar", should: true },
    { msg: "Quero cancelar meu contrato", should: true },
    { msg: "reembolso", should: true },
    { msg: "RAIVA!!!", should: true },
    { msg: "ESTOU FURIOSA!!!", should: true },
    { msg: "qual é o preço?", should: false },
    { msg: "ok obrigado", should: false },
    { msg: "Oi, tudo bem?", should: false },
  ]
  for (const c of cases) {
    it(`"${c.msg}" → ${c.should ? "escala" : "não escala"}`, () => {
      expect(avaliarTriggers(bateria(), c.msg, [], 10).shouldEscalate).toBe(c.should)
    })
  }
  it("message #11 com teto 10 escala", () => {
    const h = Array.from({ length: 10 }, (_, i) => ({ role: "ia", content: `r${i}` }))
    expect(avaliarTriggers([TURNS()], "mais uma", h, 10).shouldEscalate).toBe(true)
  })
})

describe("avaliarTriggers — geral", () => {
  it("sem triggers não escala", () => {
    const r = avaliarTriggers([], "QUERO HUMANO!!!", [], 10)
    expect(r.shouldEscalate).toBe(false)
    expect(r.reason).toBe("Nenhum trigger ativado")
  })

  it("avalia em ordem: keyword antes de sentiment", () => {
    const r = avaliarTriggers([KW(), SENT()], "QUERO FALAR COM HUMANO", [], 10)
    expect(r.shouldEscalate).toBe(true)
    expect(r.triggerName).toBe("Humano pedido")
  })

  it("histórico misto conta só IA no max_turns", () => {
    const r = avaliarTriggers([TURNS()], "oi", hist(6), 10)
    expect(r.shouldEscalate).toBe(false)
  })

  it("teto zero desativa max_turns", () => {
    const h = Array.from({ length: 50 }, (_, i) => ({ role: "ia", content: `r${i}` }))
    const r = avaliarTriggers([TURNS()], "oi", h, 0)
    expect(r.shouldEscalate).toBe(false)
  })
})
