import { describe, expect, it, vi, beforeEach } from "vitest"

// Mock do Supabase e OpenAI antes de importar a função
const mockSingle = vi.fn()
const mockMaybeSingle = vi.fn()
const mockLimit = vi.fn()
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockIn = vi.fn()
const mockOrder = vi.fn()

const mockQueryBuilder = {
  select: mockSelect,
  eq: mockEq,
  in: mockIn,
  order: mockOrder,
  limit: mockLimit,
  single: mockSingle,
  maybeSingle: mockMaybeSingle,
}

// Chainable query builder
mockSelect.mockReturnValue(mockQueryBuilder)
mockEq.mockReturnValue(mockQueryBuilder)
mockIn.mockReturnValue(mockQueryBuilder)
mockOrder.mockReturnValue(mockQueryBuilder)
mockLimit.mockReturnValue(mockQueryBuilder)

const mockFrom = vi.fn(() => mockQueryBuilder)

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

const mockCreateChatCompletion = vi.fn()
vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockCreateChatCompletion,
        },
      }
    },
  }
})

vi.mock("@/lib/encryption", () => ({
  decryptToken: vi.fn((token: string) => token),
}))

import { generateAIResponse, providerFromModel } from "@/lib/ai/generateResponse"

describe("generateAIResponse (Unitário Isolado)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OPENAI_API_KEY = "test-openai-key"
  })

  it("deve lançar erro quando o agente de IA não for encontrado", async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: "Not found" } })

    await expect(
      generateAIResponse({
        aiId: "id-inexistente",
        userMessage: "Olá",
        conversationHistory: [],
      })
    ).rejects.toThrow("AI not found")
  })

  it("deve gerar resposta com sucesso a partir do modelo OpenAI mockado", async () => {
    mockSingle.mockResolvedValueOnce({
      data: {
        id: "ai-123",
        model_name: "gpt-4o-mini",
        system_prompt: "Você é um assistente imobiliário.",
        additional_instructions: "Seja cordial.",
        brand_voice: "Profissional",
      },
    })
    // Sem knowledge base
    mockMaybeSingle.mockResolvedValueOnce({ data: null })

    mockCreateChatCompletion.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: "Olá! Posso te ajudar a encontrar seu imóvel ideal.",
          },
        },
      ],
    })

    const resposta = await generateAIResponse({
      aiId: "ai-123",
      userMessage: "Quero ver casas no centro",
      conversationHistory: [{ role: "user", content: "Olá" }],
    })

    expect(resposta.message).toBe("Olá! Posso te ajudar a encontrar seu imóvel ideal.")
    expect(resposta.model).toBe("gpt-4o-mini")
    expect(mockCreateChatCompletion).toHaveBeenCalledTimes(1)
  })

  it("deve incluir contexto da knowledge base e FAQs quando disponível", async () => {
    mockSingle.mockResolvedValueOnce({
      data: {
        id: "ai-456",
        model_name: "gpt-4o-mini",
        system_prompt: "Assistente de vendas",
      },
    })

    // Knowledge base presente
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: "kb-1" } })

    // Documentos e FAQs
    mockLimit
      .mockResolvedValueOnce({ data: [{ id: "doc-1" }] }) // docs
      .mockResolvedValueOnce({ data: [{ chunk_text: "Informações sobre o Condomínio Alpha" }] }) // embeddings
      .mockResolvedValueOnce({ data: [{ question: "Qual o valor do condomínio?", answer: "R$ 800" }] }) // faqs

    mockCreateChatCompletion.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: "O condomínio Alpha tem taxa de R$ 800.",
          },
        },
      ],
    })

    const resposta = await generateAIResponse({
      aiId: "ai-456",
      userMessage: "Qual o valor do Alpha?",
      conversationHistory: [],
    })

    expect(resposta.message).toContain("condomínio Alpha")
    expect(mockCreateChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "system",
            content: expect.stringContaining("CONTEXTO RELEVANTE"),
          }),
        ]),
      })
    )
  })

  it("deve identificar o provedor correto a partir do nome do modelo", () => {
    expect(providerFromModel("gpt-4o-mini")).toBe("openai")
    expect(providerFromModel("gemini-2.5-flash")).toBe("gemini")
    expect(providerFromModel("claude-3-5-sonnet")).toBe("claude")
    expect(providerFromModel(undefined)).toBe("openai")
  })
})
