import { describe, expect, it } from "vitest"
import { classificarIntencao } from "@/lib/assistente"

describe("classificarIntencao", () => {
  it.each([
    ["preciso da segunda via do boleto", "segunda_via_boleto"],
    ["me manda o código de barras", "segunda_via_boleto"],
    ["cadê meu informe de rendimentos?", "informe_rendimentos"],
    ["qual o reajuste do IGP-M?", "reajuste"],
    ["tem vazamento no banheiro", "manutencao"],
    ["quando vence meu contrato", "contrato"],
    ["quero vender meu apartamento", "captacao"],
    ["quero comprar um imóvel", "vendas"],
    ["procuro apartamento para alugar", "locacao"],
    ["quero falar com um atendente", "falar_com_humano"],
    ["qual o horário de atendimento", "faq"],
    ["bom dia", "saudacao"],
    ["asdfgh", "desconhecida"],
    ["", "desconhecida"],
  ])("%s → %s", (txt, esperado) => {
    expect(classificarIntencao(txt)).toBe(esperado)
  })

  it("ignora acentos e caixa", () => {
    expect(classificarIntencao("SEGUNDA VIA DO BOLÉTO")).toBe("segunda_via_boleto")
  })

  it("pedido de humano tem prioridade sobre outros assuntos", () => {
    expect(classificarIntencao("quero falar com atendente sobre o boleto")).toBe("falar_com_humano")
  })
})
