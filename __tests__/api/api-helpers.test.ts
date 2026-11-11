import { describe, it, expect } from "vitest"
import { z } from "zod"
import { ok, fail } from "@/lib/api/response"
import { parseBody, parseQuery } from "@/lib/api/validate"

describe("lib/api/ (response.ts & validate.ts)", () => {
  describe("ok and fail response helpers", () => {
    it("ok() deve retornar status 200 com payload ok: true", async () => {
      const res = ok({ total: 10, items: ["a", "b"] })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data).toEqual({ ok: true, total: 10, items: ["a", "b"] })
    })

    it("fail() deve retornar status padrão 400 com payload ok: false e erro", async () => {
      const res = fail("Requisição inválida.", 400, { campo: "email" })
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data).toEqual({ ok: false, erro: "Requisição inválida.", details: { campo: "email" } })
    })

    it("fail() deve respeitar status HTTP personalizado (ex: 404, 500)", async () => {
      const res = fail("Não encontrado", 404)
      expect(res.status).toBe(404)
      const data = await res.json()
      expect(data.erro).toBe("Não encontrado")
    })
  })

  describe("parseBody with Zod", () => {
    const testSchema = z.object({
      nome: z.string().min(2, "Nome muito curto"),
      idade: z.number().positive(),
    })

    it("deve aceitar e tipar JSON válido", async () => {
      const req = new Request("https://example.com/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: "Guilherme", idade: 28 }),
      })
      const result = await parseBody(req, testSchema)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.nome).toBe("Guilherme")
        expect(result.data.idade).toBe(28)
      }
    })

    it("deve rejeitar body com JSON corrompido retornando HTTP 400", async () => {
      const req = new Request("https://example.com/api/test", {
        method: "POST",
        body: "{ bad json",
      })
      const result = await parseBody(req, testSchema)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.response.status).toBe(400)
        const json = await result.response.json()
        expect(json.erro).toContain("JSON válido")
      }
    })

    it("deve rejeitar campos que violem validação do Zod", async () => {
      const req = new Request("https://example.com/api/test", {
        method: "POST",
        body: JSON.stringify({ nome: "A", idade: -5 }),
      })
      const result = await parseBody(req, testSchema)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.response.status).toBe(400)
        const json = await result.response.json()
        expect(json.erro).toContain("Nome muito curto")
      }
    })
  })

  describe("parseQuery with Zod", () => {
    const querySchema = z.object({
      page: z.string().transform((v) => parseInt(v, 10)),
      filtro: z.string().optional(),
    })

    it("deve validar parâmetros de URL válidos", () => {
      const req = new Request("https://example.com/api/test?page=2&filtro=ativo")
      const result = parseQuery(req, querySchema)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.page).toBe(2)
        expect(result.data.filtro).toBe("ativo")
      }
    })

    it("deve rejeitar parâmetros que violem o schema", async () => {
      const req = new Request("https://example.com/api/test?filtro=ativo")
      const result = parseQuery(req, querySchema)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.response.status).toBe(400)
      }
    })
  })
})
