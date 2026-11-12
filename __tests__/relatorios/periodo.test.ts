import { describe, it, expect } from "vitest"
import {
  diaAnteriorBRT,
  limitesDiaBRT,
  limitesDiaAnteriorBRT,
  formatarDataBr,
  formatarHoraMinutoBr,
} from "@/lib/relatorios/periodo"

describe("Módulo de Período America/Sao_Paulo (periodo.ts)", () => {
  it("calcula o dia civil anterior em BRT para data ao meio-dia", () => {
    // 12/11/2026 às 12:00 BRT = 15:00 UTC
    const now = new Date("2026-11-12T15:00:00.000Z")
    const { ymd, dataFormatada } = diaAnteriorBRT(now)

    expect(ymd).toBe("2026-11-11")
    expect(dataFormatada).toBe("11/11/2026")
  })

  it("calcula o dia civil anterior mesmo próximo da meia-noite UTC (22:00 BRT do dia anterior)", () => {
    // 12/11/2026 às 01:00 UTC = 11/11/2026 às 22:00 BRT
    const now = new Date("2026-11-12T01:00:00.000Z")
    const { ymd, dataFormatada } = diaAnteriorBRT(now)

    // Como em BRT ainda é dia 11/11, o dia anterior é dia 10/11
    expect(ymd).toBe("2026-11-10")
    expect(dataFormatada).toBe("10/11/2026")
  })

  it("produz limites exatos [inicioIso, fimIso) para um dia civil arbitrário", () => {
    const limites = limitesDiaBRT("2026-11-11")

    expect(limites.ymd).toBe("2026-11-11")
    expect(limites.dataFormatada).toBe("11/11/2026")
    // 00:00:00 BRT = 03:00:00 UTC
    expect(limites.inicioIso).toBe("2026-11-11T03:00:00.000Z")
    // 24:00:00 BRT = 03:00:00 UTC do dia seguinte
    expect(limites.fimIso).toBe("2026-11-12T03:00:00.000Z")

    // A duração entre início e fim deve ser exatamente 24 horas (86.400.000 ms)
    const diffMs = new Date(limites.fimIso).getTime() - new Date(limites.inicioIso).getTime()
    expect(diffMs).toBe(24 * 60 * 60 * 1000)
  })

  it("trata viradas de mês e de ano sem inconsistências de fuso", () => {
    // Virada de mês: 01 de Dezembro
    const limitesMes = limitesDiaBRT("2026-12-01")
    expect(limitesMes.inicioIso).toBe("2026-12-01T03:00:00.000Z")
    expect(limitesMes.fimIso).toBe("2026-12-02T03:00:00.000Z")

    // Virada de ano: 01 de Janeiro
    const limitesAno = limitesDiaBRT("2026-01-01")
    expect(limitesAno.inicioIso).toBe("2026-01-01T03:00:00.000Z")
    expect(limitesAno.fimIso).toBe("2026-01-02T03:00:00.000Z")
  })

  it("limitesDiaAnteriorBRT combina diaAnterior e limitesDiaBRT", () => {
    // 12/11/2026 às 11:00 UTC = 08:00 BRT
    const now = new Date("2026-11-12T11:00:00.000Z")
    const limites = limitesDiaAnteriorBRT(now)

    expect(limites.ymd).toBe("2026-11-11")
    expect(limites.inicioIso).toBe("2026-11-11T03:00:00.000Z")
    expect(limites.fimIso).toBe("2026-11-12T03:00:00.000Z")
  })

  it("formatadores de data e hora BRT", () => {
    expect(formatarDataBr("2026-11-11")).toBe("11/11/2026")
    expect(formatarDataBr("2026-11-11T15:30:00.000Z")).toBe("11/11/2026")

    // 15:30 UTC = 12:30 BRT
    expect(formatarHoraMinutoBr("2026-11-11T15:30:00.000Z")).toBe("12:30")
    expect(formatarHoraMinutoBr(null)).toBe("--:--")
  })
})
