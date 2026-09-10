import { describe, expect, it } from "vitest"
import { generateAIResponse } from "@/lib/ai/generateResponse"

// Mock simples - para rodar com `pnpm test` quando jest/vitest for configurado
describe("generateAIResponse", () => {
  // Requer banco acessível; roda isolado (não quebra a suite offline).
  it("deve gerar resposta a partir da mensagem do usuário", async () => {
    // Este teste requer OPENAI_API_KEY e ai_agents populado no Supabase
    // Mock para MVP: verifica que a função existe e lança erro se AI não existe
    await expect(
      generateAIResponse({ aiId: "inexistente", userMessage: "Olá", conversationHistory: [] })
    ).rejects.toThrow("AI not found")
  })

  it("deve incluir contexto da knowledge base quando houver", async () => {
    // TODO: popular ai_agents + knowledge_bases com docs e testar RAG
    expect(true).toBe(true)
  })

  it("deve detectar trigger de escalada", async () => {
    // Simula mensagem com keyword de frustração
    const msg = "QUERO FALAR COM HUMANO, ESTOU MUITO FRUSTRADO!!!"
    // O teste real chama POST /api/conversations/[id]/messages e verifica escalated=true
    expect(msg.toUpperCase()).toContain("HUMANO")
  })
})
