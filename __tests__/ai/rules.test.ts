import { describe, expect, it } from "vitest"
import {
  dentroDoHorario,
  getBoundInstances,
  getRules,
  leadAptoParaResposta,
  nomeApresentacao,
  regrasParaPrompt,
  type AgentRules,
} from "@/lib/ai/rules"

const QUARTA_12H = new Date("2026-09-09T12:00:00-03:00") // quarta-feira 12:00 SP

function base(): AgentRules {
  return getRules({})
}

describe("nomeApresentacao", () => {
  it("remove sufixo operacional", () => {
    expect(nomeApresentacao("Guilherme - Teste")).toBe("Guilherme")
    expect(nomeApresentacao("Patrícia - Reativação")).toBe("Patrícia")
  })
  it("mantém nome simples e usa fallback", () => {
    expect(nomeApresentacao("Aurora")).toBe("Aurora")
    expect(nomeApresentacao("")).toBe("assistente da Colucci Imóveis")
    expect(nomeApresentacao(null)).toBe("assistente da Colucci Imóveis")
  })
})

describe("getBoundInstances", () => {
  it("une testInstance + whitelist sem duplicar", () => {
    const bound = getBoundInstances({ testInstance: "a-1", rules: { whitelistInstances: ["a-1", "b-2"] } })
    expect(bound).toEqual(expect.arrayContaining(["a-1", "b-2"]))
    expect(bound.length).toBe(2)
  })
  it("vazio quando nada configurado", () => {
    expect(getBoundInstances({})).toEqual([])
  })
})

describe("getRules defaults", () => {
  it("seguros: habilitado, whatsapp, Tráfego Pago", () => {
    const r = getRules({})
    expect(r.enable).toBe(true)
    expect(r.channels).toEqual(["whatsapp"])
    expect(r.target.origensPermitidas).toEqual(["Tráfego Pago"])
    expect(r.target.tagsModo).toBe("none")
  })
  it("respeita config existente", () => {
    const r = getRules({ rules: { enable: false, target: { origensPermitidas: ["WhatsApp"], tags: ["x"], tagsModo: "any" } } })
    expect(r.enable).toBe(false)
    expect(r.target.tags).toEqual(["x"])
  })
})

describe("dentroDoHorario", () => {
  it("horário desabilitado sempre libera", () => {
    const r = base()
    r.schedule.enabled = false
    expect(dentroDoHorario(r, QUARTA_12H)).toBe(true)
  })
  it("dentro da janela libera", () => {
    const r = base()
    r.schedule.days = [3]
    r.schedule.start = "08:00"
    r.schedule.end = "19:00"
    expect(dentroDoHorario(r, QUARTA_12H)).toBe(true)
  })
  it("fora do dia bloqueia", () => {
    const r = base()
    r.schedule.days = [0]
    expect(dentroDoHorario(r, QUARTA_12H)).toBe(false)
  })
  it("fora da hora bloqueia", () => {
    const r = base()
    r.schedule.days = [1, 2, 3, 4, 5, 6]
    r.schedule.start = "13:00"
    r.schedule.end = "19:00"
    expect(dentroDoHorario(r, QUARTA_12H)).toBe(false)
  })
})

describe("leadAptoParaResposta", () => {
  it("sem lead nunca apto", () => {
    expect(leadAptoParaResposta(base(), null)).toBe(false)
  })
  it("origem fora da lista reprova", () => {
    const r = base()
    expect(leadAptoParaResposta(r, { origem: "WhatsApp", referencias: [] })).toBe(false)
  })
  it("origem permitida + tagsModo none aprova", () => {
    const r = base()
    expect(leadAptoParaResposta(r, { origem: "Tráfego Pago", referencias: [] })).toBe(true)
  })
  it("modo any exige ao menos uma tag", () => {
    const r = base()
    r.target.tags = ["teste-ia"]
    r.target.tagsModo = "any"
    expect(leadAptoParaResposta(r, { origem: "Tráfego Pago", referencias: ["teste-ia"] })).toBe(true)
    expect(leadAptoParaResposta(r, { origem: "Tráfego Pago", referencias: ["outra"] })).toBe(false)
  })
  it("modo all exige todas", () => {
    const r = base()
    r.target.tags = ["a", "b"]
    r.target.tagsModo = "all"
    expect(leadAptoParaResposta(r, { origem: "Tráfego Pago", referencias: ["a", "b"] })).toBe(true)
    expect(leadAptoParaResposta(r, { origem: "Tráfego Pago", referencias: ["a"] })).toBe(false)
  })
})

describe("regrasParaPrompt", () => {
  it("inclui identidade e estilo", () => {
    const txt = regrasParaPrompt(base(), "Guilherme")
    expect(txt).toContain("Guilherme")
    expect(txt).toContain("IDENTIDADE")
    expect(txt).toContain("no máximo 2 linhas")
  })
})
