import { describe, it, expect, vi } from "vitest"
import { maskPhone, maskEmail, sanitizeLogData, logger } from "@/lib/logger"

describe("lib/logger.ts - Conformidade LGPD e Sanitização de Logs", () => {
  describe("maskPhone", () => {
    it("deve mascarar telefone no formato nacional BR (11 dígitos)", () => {
      const masked = maskPhone("18996917711")
      expect(masked).toBe("(18) 99***-7711")
    })

    it("deve mascarar telefone com formatação existente", () => {
      const masked = maskPhone("(18) 99711-1362")
      expect(masked).toBe("(18) 99***-1362")
    })

    it("deve mascarar telefone internacional com DDI 55", () => {
      const masked = maskPhone("5518996917711")
      expect(masked).toBe("+55 (18) ****-7711")
    })

    it("deve lidar com valores inválidos ou vazios", () => {
      expect(maskPhone("")).toBe("")
      expect(maskPhone(null)).toBe("[INVALID_PHONE]")
      expect(maskPhone(12345)).toBe("[INVALID_PHONE]")
    })
  })

  describe("maskEmail", () => {
    it("deve mascarar e-mails comuns", () => {
      expect(maskEmail("usuario@empresa.com.br")).toBe("u***o@e***.com.br")
      expect(maskEmail("kleber@colucci.com")).toBe("k***r@c***.com")
    })

    it("deve mascarar e-mails curtos de forma segura", () => {
      expect(maskEmail("a@b.com")).toBe("a***@b***.com")
    })

    it("deve lidar com valores inválidos", () => {
      expect(maskEmail("")).toBe("***@***")
      expect(maskEmail(null)).toBe("[INVALID_EMAIL]")
    })
  })

  describe("sanitizeLogData", () => {
    it("deve redigir segredos e tokens sensíveis", () => {
      const input = {
        token: "secret_token_12345",
        password: "my_plain_password",
        apikey: "ai_api_key_abc",
        nome: "Guilherme",
      }
      const sanitized = sanitizeLogData(input) as Record<string, unknown>
      expect(sanitized.token).toBe("[REDACTED_SECRET]")
      expect(sanitized.password).toBe("[REDACTED_SECRET]")
      expect(sanitized.apikey).toBe("[REDACTED_SECRET]")
      expect(sanitized.nome).toBe("Guilherme")
    })

    it("deve proteger corpo de mensagem (LGPD inegociável: nunca logar mensagem)", () => {
      const input = {
        mensagem: "Olá, tenho interesse na casa do condomínio Damha por R$ 1.500.000",
        body: "Texto confidencial do cliente",
        texto: "Mensagem privada enviada pelo corretor",
        id: "msg_123",
      }
      const sanitized = sanitizeLogData(input) as Record<string, unknown>
      expect(sanitized.id).toBe("msg_123")
      expect(sanitized.mensagem).toMatch(/\[PROTECTED_LGPD: \d+ chars\]/)
      expect(sanitized.body).toMatch(/\[PROTECTED_LGPD: \d+ chars\]/)
      expect(sanitized.texto).toMatch(/\[PROTECTED_LGPD: \d+ chars\]/)
    })

    it("deve mascarar telefones e e-mails embutidos em objetos", () => {
      const input = {
        telefone: "5518996917711",
        email: "contato@cliente.com.br",
        detalhes: {
          whatsapp: "18997111362",
        },
      }
      const sanitized = sanitizeLogData(input) as any
      expect(sanitized.telefone).toContain("****-7711")
      expect(sanitized.email).toContain("c***o@c***.com.br")
      expect(sanitized.detalhes.whatsapp).toContain("***-1362")
    })
  })

  describe("logger methods", () => {
    it("deve emitir logs sem lançar exceções", () => {
      const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {})
      logger.info("Teste informativo seguro", { titular: "Lead Teste", telefone: "18996917711" })
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })
})
