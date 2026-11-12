import { describe, it, expect } from "vitest"
import { uniaoIntervalosSegundos, formatarTempoSegundos, type IntervaloTempo } from "@/lib/relatorios/metricas/tempo"

describe("Algoritmo de União de Intervalos de Tempo no CRM (tempo.ts)", () => {
  const janela = {
    inicio: "2026-11-11T03:00:00.000Z", // 00:00 BRT
    fim: "2026-11-12T03:00:00.000Z",    // 24:00 BRT
  }

  it("calcula duração exata de intervalo único dentro da janela", () => {
    // Sessão das 10:00 às 11:30 BRT (1h30 = 5400 segundos)
    const intervalos: IntervaloTempo[] = [
      {
        inicio: "2026-11-11T13:00:00.000Z",
        fim: "2026-11-11T14:30:00.000Z",
      },
    ]

    const segundos = uniaoIntervalosSegundos(intervalos, janela)
    expect(segundos).toBe(5400)
    expect(formatarTempoSegundos(segundos)).toBe("1h30")
  })

  it("soma intervalos sem sobreposição", () => {
    // Sessão manhã: 09:00 às 10:00 BRT (3600s)
    // Sessão tarde: 14:00 às 15:00 BRT (3600s)
    const intervalos: IntervaloTempo[] = [
      { inicio: "2026-11-11T12:00:00.000Z", fim: "2026-11-11T13:00:00.000Z" },
      { inicio: "2026-11-11T17:00:00.000Z", fim: "2026-11-11T18:00:00.000Z" },
    ]

    const segundos = uniaoIntervalosSegundos(intervalos, janela)
    expect(segundos).toBe(7200)
    expect(formatarTempoSegundos(segundos)).toBe("2h00")
  })

  it("evita dupla contagem quando o usuário tem múltiplas abas abertas simultâneas (sobreposição)", () => {
    // Aba 1: 10:00 às 10:45 BRT (45 min = 2700s)
    // Aba 2: 10:30 às 11:00 BRT (30 min = 1800s)
    // A soma bruta seria 75 min (4500s).
    // A união real é de 10:00 às 11:00 BRT = 60 min (3600s).
    const intervalos: IntervaloTempo[] = [
      { inicio: "2026-11-11T13:00:00.000Z", fim: "2026-11-11T13:45:00.000Z" },
      { inicio: "2026-11-11T13:30:00.000Z", fim: "2026-11-11T14:00:00.000Z" },
    ]

    const segundos = uniaoIntervalosSegundos(intervalos, janela)
    expect(segundos).toBe(3600)
    expect(formatarTempoSegundos(segundos)).toBe("1h00")
  })

  it("recorta sessões que viram a meia-noite (começam antes do início da janela)", () => {
    // Sessão começa no dia anterior às 23:00 BRT (02:00 UTC) e vai até 01:00 BRT (04:00 UTC)
    // O pedaço pertencente ao dia atual é de 00:00 às 01:00 BRT (03:00 a 04:00 UTC) = 1h = 3600s.
    const intervalos: IntervaloTempo[] = [
      { inicio: "2026-11-11T02:00:00.000Z", fim: "2026-11-11T04:00:00.000Z" },
    ]

    const segundos = uniaoIntervalosSegundos(intervalos, janela)
    expect(segundos).toBe(3600)
  })

  it("recorta sessões que extrapolam o fim do dia (terminam após o fim da janela)", () => {
    // Sessão das 23:30 BRT (02:30 UTC de 12/11) até 01:00 BRT (04:00 UTC)
    // Fim da janela do dia 11/11 é 03:00 UTC de 12/11.
    // Duração computada para o dia: 30 minutos = 1800s.
    const intervalos: IntervaloTempo[] = [
      { inicio: "2026-11-12T02:30:00.000Z", fim: "2026-11-12T04:00:00.000Z" },
    ]

    const segundos = uniaoIntervalosSegundos(intervalos, janela)
    expect(segundos).toBe(1800)
    expect(formatarTempoSegundos(segundos)).toBe("30m")
  })

  it("retorna 0 para usuário sem intervalos válidos na janela", () => {
    const intervalos: IntervaloTempo[] = [
      // Totalmente fora (dia 10/11)
      { inicio: "2026-11-10T12:00:00.000Z", fim: "2026-11-10T14:00:00.000Z" },
    ]

    const segundos = uniaoIntervalosSegundos(intervalos, janela)
    expect(segundos).toBe(0)
    expect(formatarTempoSegundos(segundos)).toBe("não acessou o CRM")
  })

  it("formatação de tempos amigável", () => {
    expect(formatarTempoSegundos(0)).toBe("não acessou o CRM")
    expect(formatarTempoSegundos(45)).toBe("1m")
    expect(formatarTempoSegundos(2700)).toBe("45m")
    // 3h12m = 3 * 3600 + 12 * 60 = 10800 + 720 = 11520s
    expect(formatarTempoSegundos(11520)).toBe("3h12")
  })
})
