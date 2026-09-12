import { describe, expect, it } from "vitest"
import { juntarRajada } from "@/lib/ai/inboxHandler"

describe("juntarRajada — rajada vira bloco único", () => {
  it("une textos com quebra de linha", () => {
    expect(juntarRajada(["oi", "quanto custa?", "tenho interesse"])).toBe("oi\nquanto custa?\ntenho interesse")
  })
  it("ignora vazios/nulos", () => {
    expect(juntarRajada(["oi", "", null, "  ", undefined, "tchau"])).toBe("oi\ntchau")
  })
  it("apara espaços", () => {
    expect(juntarRajada(["  oi  "])).toBe("oi")
  })
  it("vazio total retorna vazio", () => {
    expect(juntarRajada([])).toBe("")
    expect(juntarRajada([null, ""])).toBe("")
  })
  it("limita tamanho do bloco", () => {
    expect(juntarRajada(["x".repeat(5000)]).length).toBeLessThanOrEqual(2000)
  })
})
