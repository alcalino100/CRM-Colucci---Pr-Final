import { describe, expect, it } from "vitest"
import { isMasterEmail, MASTER_EMAIL, BRAND_DEFAULTS, FONTES_TITULO, FONTES_TEXTO } from "@/lib/master"
import { ABAS } from "@/app/(app)/master/page"

describe("master - isMasterEmail", () => {
  it("valida e-mail master configurado ou padrão", () => {
    expect(isMasterEmail(MASTER_EMAIL)).toBe(true)
    expect(isMasterEmail(MASTER_EMAIL.toUpperCase())).toBe(true)
    expect(isMasterEmail("outro@colucciimoveis.com.br")).toBe(false)
    expect(isMasterEmail("")).toBe(false)
  })
})

describe("master - BRAND_DEFAULTS e fontes", () => {
  it("contém valores padrão esperados para branding", () => {
    expect(BRAND_DEFAULTS.brand_name).toBeDefined()
    expect(BRAND_DEFAULTS.cor_primaria).toMatch(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    expect(FONTES_TITULO.length).toBeGreaterThan(0)
    expect(FONTES_TEXTO.length).toBeGreaterThan(0)
  })
})

describe("master - ABAS", () => {
  it("contém as 9 seções do painel master", () => {
    expect(ABAS.map((a) => a.id)).toEqual([
      "marca",
      "ias",
      "automacoes",
      "tags",
      "equipe",
      "pipelines",
      "relatorios",
      "agencia",
      "clonar",
    ])
  })
})
