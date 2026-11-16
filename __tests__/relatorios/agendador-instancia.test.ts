import { describe, it, expect, vi } from "vitest"
import { resolverInstanciaEnvio, STATUS_INSTANCIA_CONECTADA } from "@/lib/relatorios/agendador"

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

/** Cliente falso do Supabase: registra o filtro de status e devolve as linhas combinadas. */
function clienteFalso(linhas: Array<{ instance_name: string; status: string }>) {
  const chamadas: { in?: [string, string[]] } = {}
  const builder: any = {
    select: () => builder,
    in: (coluna: string, valores: string[]) => {
      chamadas.in = [coluna, valores]
      builder._linhas = linhas.filter((l) => valores.includes(l.status))
      return builder
    },
    order: () => builder,
    limit: async () => ({ data: builder._linhas ?? [], error: null }),
  }
  return { supabase: { from: () => builder } as any, chamadas }
}

describe("resolverInstanciaEnvio", () => {
  it("usa a instância escolhida na configuração, sem consultar o banco", async () => {
    const { supabase } = clienteFalso([])
    const from = vi.spyOn(supabase, "from")
    expect(await resolverInstanciaEnvio(supabase, "patricia-6c2875b4")).toBe("patricia-6c2875b4")
    expect(from).not.toHaveBeenCalled()
  })

  it("sem instância escolhida, acha a primeira com status 'conectado' (o status real do CRM)", async () => {
    const { supabase, chamadas } = clienteFalso([
      { instance_name: "diego-7735934c", status: "desconectado" },
      { instance_name: "levi-284b8246", status: "conectado" },
    ])
    expect(await resolverInstanciaEnvio(supabase, null)).toBe("levi-284b8246")
    expect(chamadas.in?.[0]).toBe("status")
    expect(chamadas.in?.[1]).toContain("conectado")
  })

  it("continua aceitando os nomes de status da Evolution (open / connected)", () => {
    expect(STATUS_INSTANCIA_CONECTADA).toEqual(expect.arrayContaining(["open", "connected"]))
  })

  it("sem nenhuma instância conectada, devolve null", async () => {
    const { supabase } = clienteFalso([{ instance_name: "a", status: "desconectado" }])
    expect(await resolverInstanciaEnvio(supabase, "")).toBeNull()
  })
})
