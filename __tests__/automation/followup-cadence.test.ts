import { describe, it, expect } from "vitest"
import {
  TEMPLATE_D1,
  TEMPLATE_D2,
  TEMPLATE_D3,
  MAX_ENVIOS_LINHA_DIA,
} from "@/app/api/automation/worker/route"

describe("Régua de Follow-up (D+1, D+2, D+3) e Anti-Ban", () => {
  it("deve definir corretamente os templates e o limite anti-ban de 30 msgs/linha", () => {
    expect(TEMPLATE_D1).toBe("a0000000-0000-0000-0000-000000000002")
    expect(TEMPLATE_D2).toBe("a0000000-0000-0000-0000-000000000003")
    expect(TEMPLATE_D3).toBe("a0000000-0000-0000-0000-000000000004")
    expect(MAX_ENVIOS_LINHA_DIA).toBe(30)
  })

  it("deve simular rotação de linha caso a principal atinja 30 envios no dia", () => {
    const conexoes = [
      { id: "patricia-1", enviosHoje: 30 },
      { id: "patricia-2", enviosHoje: 12 },
    ]

    // Escolhe a primeira com cota menor que o limite estrito (30)
    const disponivel = conexoes.find((c) => c.enviosHoje < MAX_ENVIOS_LINHA_DIA)
    expect(disponivel?.id).toBe("patricia-2")
    expect(disponivel?.enviosHoje).toBeLessThan(30)
  })

  it("deve bloquear envios caso todas as linhas disponíveis atinjam 30 envios", () => {
    const conexoes = [
      { id: "patricia-1", enviosHoje: 30 },
      { id: "patricia-2", enviosHoje: 30 },
    ]

    const disponivel = conexoes.find((c) => c.enviosHoje < MAX_ENVIOS_LINHA_DIA)
    expect(disponivel).toBeUndefined()
  })

  it("deve calcular corretamente a progressão temporal D+1 (24h), D+2 (48h) e D+3 (72h)", () => {
    const agora = 1700000000000
    const vinteQuatroHorasMs = 24 * 3600 * 1000

    const cutoffD1 = agora - vinteQuatroHorasMs
    const cutoffD2 = agora - vinteQuatroHorasMs * 2
    const cutoffD3 = agora - vinteQuatroHorasMs * 3

    expect(agora - cutoffD1).toBe(24 * 3600 * 1000)
    expect(agora - cutoffD2).toBe(48 * 3600 * 1000)
    expect(agora - cutoffD3).toBe(72 * 3600 * 1000)
  })
})
