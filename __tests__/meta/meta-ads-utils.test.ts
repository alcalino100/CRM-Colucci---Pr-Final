import { describe, it, expect } from "vitest"
import {
  toBrasiliaIso,
  rangeFor,
  periodoAnterior,
  agrega,
  fmt,
  brl2,
  NIVEL_LABEL,
  FILHO,
  STATUS_PT,
} from "@/lib/meta-ads-utils"

describe("Meta Ads Dashboard Utils (Characterization Tests)", () => {
  it("deve formatar data para o fuso de Brasília (YYYY-MM-DD)", () => {
    // 2026-11-12T01:00:00Z é 2026-11-11 às 22:00 em Brasília (UTC-3)
    const dataUtc = new Date("2026-11-12T01:00:00Z")
    expect(toBrasiliaIso(dataUtc)).toBe("2026-11-11")
  })

  it("deve calcular intervalos de datas por preset", () => {
    const hoje = rangeFor("hoje", "", "")
    expect(hoje.since).toBe(hoje.until)

    const d7 = rangeFor("7d", "", "")
    expect(new Date(d7.until).getTime()).toBeGreaterThan(new Date(d7.since).getTime())

    const custom = rangeFor("custom", "2026-05-01", "2026-05-15")
    expect(custom).toEqual({ since: "2026-05-01", until: "2026-05-15" })
  })

  it("deve calcular o período anterior com a mesma quantidade de dias", () => {
    const prev = periodoAnterior("2026-05-10", "2026-05-15")
    // 6 dias (10, 11, 12, 13, 14, 15)
    // período anterior deve ser 6 dias antes do dia 10 (04 a 09)
    expect(prev.until).toBe("2026-05-09")
    expect(prev.since).toBe("2026-05-04")
  })

  it("deve agregar métricas de insights corretamente", () => {
    const rows = [
      { spend: 100, impressions: 5000, clicks: 100, reach: 4000, actions: [{ action_type: "lead", value: 10 }] },
      { spend: 50, impressions: 2500, clicks: 50, reach: 2000, actions: [{ action_type: "lead", value: 5 }] },
    ]
    const agg = agrega(rows)
    expect(agg.spend).toBe(150)
    expect(agg.impressions).toBe(7500)
    expect(agg.clicks).toBe(150)
    expect(agg.reach).toBe(6000)
    expect(agg.results).toBe(15)
    expect(agg.ctr).toBe(2) // (150/7500)*100
    expect(agg.cpc).toBe(1) // 150/150
    expect(agg.cpm).toBe(20) // (150/7500)*1000
    expect(agg.cpr).toBe(10) // 150/15
  })

  it("deve formatar valores numéricos e moeda BRL", () => {
    expect(fmt(1234.56, 2)).toBe("1.234,56")
    expect(brl2(100)).toMatch(/R\$\s*100,00/)
    expect(brl2(undefined)).toBe("—")
  })

  it("deve mapear a hierarquia e os labels de drill-down", () => {
    expect(FILHO.account).toBe("campaign")
    expect(FILHO.campaign).toBe("adset")
    expect(FILHO.adset).toBe("ad")
    expect(FILHO.ad).toBeNull()

    expect(NIVEL_LABEL.account).toBe("Conta")
    expect(STATUS_PT.ACTIVE.label).toBe("Ativo")
  })
})
