import { describe, expect, it } from "vitest"
import { chaveConversa } from "@/lib/ai/inboxHandler"

// Contrato anti-cruzamento: cada contato tem sua chave de conversa.
// Se essa lógica mudar, mensagens de um contato podem vazar para outro.
describe("chaveConversa — isolamento entre contatos", () => {
  it("dois telefones diferentes geram chaves diferentes", () => {
    expect(chaveConversa(undefined, "5518991502791")).not.toBe(chaveConversa(undefined, "5518991976332"))
  })

  it("mesmo telefone gera mesma chave (continuidade)", () => {
    expect(chaveConversa(undefined, "5518991502791")).toBe(chaveConversa(undefined, "5518991502791"))
  })

  it("lead vinculado tem precedência sobre o telefone", () => {
    expect(chaveConversa("lead-123", "5518991502791")).toBe("lead-123")
  })

  it("dois leads diferentes nunca compartilham chave", () => {
    expect(chaveConversa("lead-123", "5518991502791")).not.toBe(chaveConversa("lead-456", "5518991502791"))
  })

  it("nunca usa instância/agente como chave", () => {
    const k = chaveConversa(undefined, "5518991502791")
    expect(k).not.toContain("guilherme")
    expect(k).not.toContain("patricia")
    expect(k).toBe("5518991502791")
  })
})
