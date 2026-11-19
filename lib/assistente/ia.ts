import type { ClaudeResultado, ClaudeTool } from "@/lib/ai/claude"

/** Contrato mínimo da IA para o assistente. Em produção é o cliente Claude; nos testes é um fake. */
export type ChamadaIa = (p: {
  system: string
  messages: { role: "user" | "assistant"; content: string }[]
  tools: ClaudeTool[]
  toolChoice: { type: "tool"; name: string }
  maxTokens: number
  timeoutMs: number
}) => Promise<Pick<ClaudeResultado, "chamadas" | "tokensTotal" | "modelo">>
