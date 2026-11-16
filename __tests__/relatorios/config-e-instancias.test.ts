import { describe, it, expect } from "vitest"
import { configUpdateSchema } from "@/lib/relatorios/config-schema"
import { extrairInstancias, horaParaCampo, instanciaConectada, rotuloInstancia } from "@/lib/relatorios/instancias-ui"

describe("configUpdateSchema (hora)", () => {
  it("aceita HH:mm:ss vindo do banco e normaliza para HH:mm", () => {
    const r = configUpdateSchema.parse({ hora_envio: "08:00:00", limite_tentativa: "12:00:00" })
    expect(r.hora_envio).toBe("08:00")
    expect(r.limite_tentativa).toBe("12:00")
  })

  it("continua aceitando HH:mm", () => {
    expect(configUpdateSchema.parse({ hora_envio: "07:30" }).hora_envio).toBe("07:30")
  })

  it("recusa horas inválidas", () => {
    for (const ruim of ["8:00", "25:00", "08:60", "08h", "", "08:00:99"]) {
      expect(configUpdateSchema.safeParse({ hora_envio: ruim }).success).toBe(false)
    }
  })

  it("salva a instância escolhida e aceita limpar (automático)", () => {
    expect(configUpdateSchema.parse({ instance_name: "patricia-6c2875b4" }).instance_name).toBe("patricia-6c2875b4")
    expect(configUpdateSchema.parse({ instance_name: null }).instance_name).toBeNull()
  })
})

describe("instâncias na tela de relatórios", () => {
  const resposta = {
    data: [
      { instance_name: "patricia-6c2875b4", status: "conectado", numero: "5518991976332", corretorNome: "Patrícia" },
      { instance_name: "diego-7735934c", status: "desconectado", numero: null, corretorNome: "—" },
      { status: "conectado" },
    ],
  }

  it("lê o formato real da API ({ data }) e ignora itens sem nome", () => {
    const lista = extrairInstancias(resposta)
    expect(lista.map((i) => i.instance_name)).toEqual(["patricia-6c2875b4", "diego-7735934c"])
    expect(lista[1].corretorNome).toBeNull()
  })

  it("ainda aceita o formato antigo ({ instancias })", () => {
    expect(extrairInstancias({ instancias: [{ instance_name: "a", status: "open" }] })).toHaveLength(1)
  })

  it("resposta inesperada vira lista vazia, sem quebrar", () => {
    expect(extrairInstancias(null)).toEqual([])
    expect(extrairInstancias({ erro: "x" })).toEqual([])
  })

  it("rótulo mostra corretor, nome, número e status; só conectadas são selecionáveis", () => {
    const [pat, diego] = extrairInstancias(resposta)
    expect(rotuloInstancia(pat)).toBe("Patrícia · patricia-6c2875b4 · 5518991976332 (conectado)")
    expect(rotuloInstancia(diego)).toBe("diego-7735934c (desconectado)")
    expect(instanciaConectada("conectado")).toBe(true)
    expect(instanciaConectada("desconectado")).toBe(false)
  })

  it("hora do banco vira valor do campo de hora", () => {
    expect(horaParaCampo("08:00:00", "08:00")).toBe("08:00")
    expect(horaParaCampo(undefined, "12:00")).toBe("12:00")
  })
})
