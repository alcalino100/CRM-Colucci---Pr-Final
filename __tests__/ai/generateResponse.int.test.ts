import { describe, expect, it } from "vitest"
import { generateAIResponse } from "@/lib/ai/generateResponse"

// Teste de Integração: executa apenas quando a suíte de integração for explicitamente disparada
describe("generateAIResponse (Integração com Supabase/Rede)", () => {
  it("deve rejeitar quando ID não existir no banco real", async () => {
    // Requer conexão com banco Supabase configurado em variáveis de ambiente
    await expect(
      generateAIResponse({
        aiId: "inexistente-int-test",
        userMessage: "Olá integração",
        conversationHistory: [],
      })
    ).rejects.toThrow()
  }, 10000)
})
