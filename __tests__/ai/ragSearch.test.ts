import { describe, expect, it } from "vitest"
import { chunkText, cosineSimilarity } from "@/lib/ai/ragSearch"

describe("chunkText", () => {
  it("texto vazio retorna vazio", () => {
    expect(chunkText("")).toEqual([])
    expect(chunkText("   ")).toEqual([])
  })
  it("texto curto passa direto", () => {
    expect(chunkText("Olá mundo")).toEqual(["Olá mundo"])
  })
  it("texto longo quebra em chunks <= size", () => {
    const longo = Array.from({ length: 20 }, (_, i) => `Parágrafo ${i} com conteúdo suficiente para encher bem o texto de teste.`).join("\n\n")
    const chunks = chunkText(longo, 500)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(500)
    // nada se perde
    expect(chunks.join(" ").length).toBeGreaterThanOrEqual(longo.length - 40)
  })
  it("preserva parágrafos curtos inteiros", () => {
    const chunks = chunkText("Primeiro.\n\nSegundo.", 500)
    expect(chunks).toEqual(["Primeiro.\n\nSegundo."])
  })
})

describe("cosineSimilarity", () => {
  it("vetores iguais = 1", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1)
  })
  it("ortogonais = 0", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0)
  })
  it("opostos = -1", () => {
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1)
  })
  it("dimensões diferentes = 0", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0)
  })
  it("vazio = 0", () => {
    expect(cosineSimilarity([], [])).toBe(0)
  })
})
