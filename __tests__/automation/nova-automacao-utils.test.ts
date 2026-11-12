import { describe, it, expect } from "vitest"
import {
  formatCancelRule,
  generateAutomationSlug,
  renderPreviewMessage,
  WIZARD_STEPS,
  CONDITION_FIELDS,
} from "@/components/automacoes-nova/nova-automacao-utils"

describe("nova-automacao-utils", () => {
  describe("generateAutomationSlug", () => {
    it("converts spaces and accents to lowercase hyphenated slug", () => {
      expect(generateAutomationSlug("Reativação de Leads Frios")).toBe("reativacao-de-leads-frios")
      expect(generateAutomationSlug("  Campanha 2026!  ")).toBe("campanha-2026")
      expect(generateAutomationSlug("Super-Automação @ 123")).toBe("super-automacao-123")
    })
  })

  describe("formatCancelRule", () => {
    it("formats known cancel rules to human-readable strings", () => {
      expect(formatCancelRule("cancel_on_manual_message")).toBe("Corretor enviou mensagem manual")
      expect(formatCancelRule("cancel_on_lost")).toBe("Lead marcado como perdido")
      expect(formatCancelRule("cancel_on_converted")).toBe("Lead foi convertido")
    })

    it("returns key as fallback for unknown rule", () => {
      expect(formatCancelRule("unknown_rule")).toBe("unknown_rule")
    })
  })

  describe("renderPreviewMessage", () => {
    it("replaces known variables with realistic placeholders", () => {
      const template = "Olá {{primeiro_nome}}, sou {{nome_corretor}} da {{nome_imobiliaria}} sobre {{empreendimento_interesse}}."
      const rendered = renderPreviewMessage(template)
      expect(rendered).toContain("Olá Maria, sou João Santos da Sua Imobiliária sobre Residencial Parque.")
    })

    it("returns empty string if empty content passed", () => {
      expect(renderPreviewMessage("")).toBe("")
    })
  })

  describe("constants", () => {
    it("has 10 wizard steps", () => {
      expect(WIZARD_STEPS).toHaveLength(10)
    })

    it("has condition fields defined", () => {
      expect(CONDITION_FIELDS.length).toBeGreaterThan(5)
    })
  })
})
