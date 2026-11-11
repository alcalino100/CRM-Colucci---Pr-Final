import { describe, it, expect } from "vitest"
import {
  hojeBRT,
  indiceLinha,
  haQuanto,
  formatarTelefone,
  calcularPilotoStatus,
  calcularIntervaloPeriodo,
} from "@/lib/automation-dashboard-utils"

describe("automation-dashboard-utils - Testes de Caracterização da Página de Automações", () => {
  describe("hojeBRT", () => {
    it("deve retornar formato de data YYYY-MM-DD", () => {
      const data = hojeBRT()
      expect(data).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  describe("indiceLinha (roleta determinística de conexões)", () => {
    it("deve retornar índice válido dentro de [0, n-1]", () => {
      const idx1 = indiceLinha("lead_abc_123", 4)
      const idx2 = indiceLinha("lead_xyz_789", 4)
      expect(idx1).toBeGreaterThanOrEqual(0)
      expect(idx1).toBeLessThan(4)
      expect(idx2).toBeGreaterThanOrEqual(0)
      expect(idx2).toBeLessThan(4)
    })

    it("deve ser determinístico para o mesmo leadId", () => {
      expect(indiceLinha("lead_fixo_42", 3)).toBe(indiceLinha("lead_fixo_42", 3))
    })

    it("deve retornar 0 quando n <= 0", () => {
      expect(indiceLinha("lead_qualquer", 0)).toBe(0)
    })
  })

  describe("haQuanto", () => {
    it("deve retornar traço para nulo", () => {
      expect(haQuanto(null)).toBe("—")
    })

    it("deve retornar 'agora mesmo' para menos de 1 minuto", () => {
      expect(haQuanto(0)).toBe("agora mesmo")
    })

    it("deve formatar minutos corretamente", () => {
      expect(haQuanto(15)).toBe("há 15 min")
      expect(haQuanto(59)).toBe("há 59 min")
    })

    it("deve formatar horas e dias", () => {
      expect(haQuanto(60)).toBe("há 1h")
      expect(haQuanto(120)).toBe("há 2h")
      expect(haQuanto(1440)).toBe("há 1d")
      expect(haQuanto(2880)).toBe("há 2d")
    })
  })

  describe("formatarTelefone", () => {
    it("deve formatar celular de 11 dígitos", () => {
      expect(formatarTelefone("18996917711")).toBe("(18) 99691-7711")
    })

    it("deve formatar fixo de 10 dígitos", () => {
      expect(formatarTelefone("1832221234")).toBe("(18) 3222-1234")
    })

    it("deve tratar prefixo DDI 55", () => {
      expect(formatarTelefone("5518996917711")).toBe("(18) 99691-7711")
    })

    it("deve retornar traço para valores vazios", () => {
      expect(formatarTelefone(null)).toBe("—")
      expect(formatarTelefone("")).toBe("—")
    })
  })

  describe("calcularPilotoStatus", () => {
    it("deve retornar 'Sem execução recente' para null", () => {
      const status = calcularPilotoStatus(null)
      expect(status.label).toBe("Sem execução recente")
      expect(status.tone).toBe("muted")
    })

    it("deve retornar 'Ativo & Saudável' para <= 30 minutos", () => {
      const status = calcularPilotoStatus(12)
      expect(status.label).toBe("Ativo & Saudável")
      expect(status.tone).toBe("good")
    })

    it("deve retornar 'Aguardando próxima janela' para 31 a 90 minutos", () => {
      const status = calcularPilotoStatus(45)
      expect(status.label).toBe("Aguardando próxima janela")
      expect(status.tone).toBe("warn")
    })

    it("deve retornar 'Pausado ou Inativo' para > 90 minutos", () => {
      const status = calcularPilotoStatus(120)
      expect(status.label).toBe("Pausado ou Inativo")
      expect(status.tone).toBe("crit")
    })
  })

  describe("calcularIntervaloPeriodo", () => {
    const dataFixa = new Date("2026-11-11T12:00:00-03:00")

    it("deve calcular intervalo 'hoje'", () => {
      const res = calcularIntervaloPeriodo("hoje", "", dataFixa)
      expect(res.ini).toBe("2026-11-11T03:00:00Z")
      expect(res.fim).toBe("2026-11-11T23:59:59Z")
      expect(res.label).toBe("Hoje")
    })

    it("deve calcular intervalo 'ontem'", () => {
      const res = calcularIntervaloPeriodo("ontem", "", dataFixa)
      expect(res.ini).toBe("2026-11-10T03:00:00Z")
      expect(res.fim).toBe("2026-11-10T23:59:59Z")
      expect(res.label).toBe("Ontem")
    })

    it("deve calcular intervalo 'custom'", () => {
      const res = calcularIntervaloPeriodo("custom", "2026-11-05", dataFixa)
      expect(res.ini).toBe("2026-11-05T03:00:00Z")
      expect(res.fim).toBe("2026-11-05T23:59:59Z")
      expect(res.label).toBe("05/11/2026")
    })
  })
})
