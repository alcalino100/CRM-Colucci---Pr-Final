import { describe, expect, it, vi } from "vitest"
import { ClaudeError, chamarClaude, chamarClaudeComFallback } from "@/lib/ai/claude"

const resp = (status: number, corpo: unknown, headers: Record<string, string> = {}) =>
  ({ ok: status >= 200 && status < 300, status, headers: { get: (k: string) => headers[k.toLowerCase()] ?? null }, json: async () => corpo }) as unknown as Response

const texto = (t: string, extra: Record<string, unknown> = {}) => ({ content: [{ type: "text", text: t }], usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 3 }, stop_reason: "end_turn", ...extra })
const base = { apiKey: "k", system: "sys", messages: [{ role: "user" as const, content: "oi" }], sleepImpl: async () => {} }

describe("chamarClaude", () => {
  it("retorna texto e soma tokens incluindo cache", async () => {
    const f = vi.fn().mockResolvedValue(resp(200, texto("Olá!")))
    const r = await chamarClaude({ ...base, model: "m", fetchImpl: f as any })
    expect(r.texto).toBe("Olá!")
    expect(r.tokensTotal).toBe(15)
    expect(r.uso.cacheLeitura).toBe(3)
  })

  it("envia o system com cache_control e x-api-key", async () => {
    const f = vi.fn().mockResolvedValue(resp(200, texto("ok")))
    await chamarClaude({ ...base, model: "m", fetchImpl: f as any })
    const [, init] = f.mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.system[0].cache_control).toEqual({ type: "ephemeral" })
    expect(init.headers["x-api-key"]).toBe("k")
  })

  it("repete em 529 (overloaded) e em 429 e depois responde", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(resp(529, { error: { type: "overloaded_error", message: "busy" } }))
      .mockResolvedValueOnce(resp(429, { error: { type: "rate_limit_error", message: "slow" } }, { "retry-after": "1" }))
      .mockResolvedValueOnce(resp(200, texto("voltei")))
    const r = await chamarClaude({ ...base, model: "m", fetchImpl: f as any })
    expect(r.texto).toBe("voltei")
    expect(f).toHaveBeenCalledTimes(3)
  })

  it("não repete em 401 (chave inválida)", async () => {
    const f = vi.fn().mockResolvedValue(resp(401, { error: { type: "authentication_error", message: "bad key" } }))
    await expect(chamarClaude({ ...base, model: "m", fetchImpl: f as any })).rejects.toMatchObject({ status: 401, retentavel: false })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it("desiste após esgotar retries", async () => {
    const f = vi.fn().mockResolvedValue(resp(503, { error: { message: "down" } }))
    await expect(chamarClaude({ ...base, model: "m", maxRetries: 1, fetchImpl: f as any })).rejects.toBeInstanceOf(ClaudeError)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it("trata falha de rede/timeout como retentável", async () => {
    const f = vi.fn().mockRejectedValueOnce(Object.assign(new Error("x"), { name: "AbortError" })).mockResolvedValueOnce(resp(200, texto("ok")))
    const r = await chamarClaude({ ...base, model: "m", fetchImpl: f as any })
    expect(r.texto).toBe("ok")
  })

  it("executa ferramentas e devolve o resultado ao modelo", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(resp(200, { content: [{ type: "tool_use", id: "t1", name: "x", input: { a: 1 } }], usage: {} }))
      .mockResolvedValueOnce(resp(200, texto("feito")))
    const onToolUse = vi.fn().mockResolvedValue("resultado")
    const r = await chamarClaude({ ...base, model: "m", tools: [{ name: "x", description: "d", input_schema: {} }], onToolUse, fetchImpl: f as any })
    expect(onToolUse).toHaveBeenCalledWith("x", { a: 1 })
    expect(r.texto).toBe("feito")
    const segundo = JSON.parse(f.mock.calls[1][1].body)
    expect(segundo.messages.at(-1).content[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1", content: "resultado" })
  })

  it("erro dentro da ferramenta vira texto para o modelo, não derruba a conversa", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(resp(200, { content: [{ type: "tool_use", id: "t1", name: "x", input: {} }], usage: {} }))
      .mockResolvedValueOnce(resp(200, texto("ok")))
    const r = await chamarClaude({ ...base, model: "m", tools: [{ name: "x", description: "d", input_schema: {} }], onToolUse: async () => { throw new Error("boom") }, fetchImpl: f as any })
    expect(r.texto).toBe("ok")
    expect(JSON.parse(f.mock.calls[1][1].body).messages.at(-1).content[0].content).toContain("boom")
  })

  it("se as rodadas acabam, fecha pedindo texto sem ferramentas (nunca vazio)", async () => {
    const toolUse = resp(200, { content: [{ type: "tool_use", id: "t", name: "x", input: {} }], usage: {} })
    const f = vi.fn().mockResolvedValueOnce(toolUse).mockResolvedValueOnce(toolUse).mockResolvedValueOnce(resp(200, texto("resumo final")))
    const r = await chamarClaude({ ...base, model: "m", maxRounds: 2, tools: [{ name: "x", description: "d", input_schema: {} }], onToolUse: async () => "r", fetchImpl: f as any })
    expect(r.texto).toBe("resumo final")
    expect(r.parouPor).toBe("max_rodadas")
    expect(JSON.parse(f.mock.calls[2][1].body).tool_choice).toEqual({ type: "none" })
  })

  it("saída estruturada: toolChoice sem onToolUse devolve as chamadas", async () => {
    const f = vi.fn().mockResolvedValue(resp(200, { content: [{ type: "tool_use", id: "t", name: "classificar", input: { intencao: "reajuste" } }], usage: {} }))
    const r = await chamarClaude({ ...base, model: "m", tools: [{ name: "classificar", description: "d", input_schema: {} }], toolChoice: { type: "tool", name: "classificar" }, fetchImpl: f as any })
    expect(r.chamadas[0]).toEqual({ name: "classificar", input: { intencao: "reajuste" } })
  })
})

describe("chamarClaudeComFallback", () => {
  it("cai para o próximo modelo quando o primeiro não existe", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(resp(404, { error: { type: "not_found_error", message: "model: x" } }))
      .mockResolvedValueOnce(resp(200, texto("ok")))
    const r = await chamarClaudeComFallback({ ...base, modelos: ["antigo", "novo"], fetchImpl: f as any })
    expect(r.modelo).toBe("novo")
  })

  it("não troca de modelo em erro de autenticação", async () => {
    const f = vi.fn().mockResolvedValue(resp(401, { error: { type: "authentication_error", message: "no" } }))
    await expect(chamarClaudeComFallback({ ...base, modelos: ["a", "b"], fetchImpl: f as any })).rejects.toMatchObject({ status: 401 })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it("troca de modelo quando o primeiro segue indisponível após retries", async () => {
    const f = vi.fn().mockResolvedValue(resp(529, { error: { type: "overloaded_error", message: "busy" } }))
    f.mockResolvedValueOnce(resp(529, { error: {} })).mockResolvedValueOnce(resp(529, { error: {} })).mockResolvedValueOnce(resp(529, { error: {} })).mockResolvedValueOnce(resp(200, texto("ok")))
    const r = await chamarClaudeComFallback({ ...base, modelos: ["a", "b"], fetchImpl: f as any })
    expect(r.modelo).toBe("b")
  })
})
