import { describe, it, expect } from "vitest"
import { ORCAMENTO_DESPACHO_MS, orcamentoEsgotado } from "@/lib/automation-worker/time-budget"

describe("orcamentoEsgotado", () => {
  const inicio = 1_000_000

  it("deixa folga para a função (limite 300 s) terminar e gravar o resumo", () => {
    expect(ORCAMENTO_DESPACHO_MS).toBeLessThanOrEqual(240_000)
    expect(300_000 - ORCAMENTO_DESPACHO_MS).toBeGreaterThanOrEqual(60_000)
  })

  it("não esgota no começo da rodada", () => {
    expect(orcamentoEsgotado(inicio, inicio + 1_000)).toBe(false)
    expect(orcamentoEsgotado(inicio, inicio + 60_000)).toBe(false)
  })

  it("esgota ao alcançar o orçamento", () => {
    expect(orcamentoEsgotado(inicio, inicio + ORCAMENTO_DESPACHO_MS - 1)).toBe(false)
    expect(orcamentoEsgotado(inicio, inicio + ORCAMENTO_DESPACHO_MS)).toBe(true)
    expect(orcamentoEsgotado(inicio, inicio + ORCAMENTO_DESPACHO_MS + 5_000)).toBe(true)
  })

  it("considera a pausa anti-ban que viria antes do próximo envio", () => {
    const aos200s = inicio + 200_000
    expect(orcamentoEsgotado(inicio, aos200s, 0)).toBe(false)
    expect(orcamentoEsgotado(inicio, aos200s, 20_000)).toBe(false)
    expect(orcamentoEsgotado(inicio, aos200s, 45_000)).toBe(true)
  })

  it("aceita orçamento customizado", () => {
    expect(orcamentoEsgotado(0, 9_000, 0, 10_000)).toBe(false)
    expect(orcamentoEsgotado(0, 9_000, 1_000, 10_000)).toBe(true)
  })
})
