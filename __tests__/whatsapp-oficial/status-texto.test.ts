import { describe, expect, it } from "vitest"
import { explicarNomeExibicao, explicarStatusNumero } from "@/lib/whatsapp-oficial/status-texto"

describe("nome de exibição", () => {
  it("aprovado libera o envio", () => expect(explicarNomeExibicao("APPROVED").gravidade).toBe("ok"))
  it("em análise é atenção e cita o erro 131037", () => {
    const r = explicarNomeExibicao("PENDING_REVIEW")
    expect(r.gravidade).toBe("atencao")
    expect(r.ajuda).toContain("131037")
  })
  it("sem nome ou recusado é erro com orientação", () => {
    expect(explicarNomeExibicao("NONE").gravidade).toBe("erro")
    expect(explicarNomeExibicao(null).gravidade).toBe("erro")
    expect(explicarNomeExibicao("DECLINED").ajuda).toContain("WhatsApp Manager")
  })
  it("um novo nome pendente ou recusado prevalece sobre o atual", () => {
    expect(explicarNomeExibicao("APPROVED", "Colucci Imóveis", "PENDING_REVIEW").titulo).toContain("em análise")
    expect(explicarNomeExibicao("APPROVED", "X", "DECLINED").gravidade).toBe("erro")
  })
})

describe("status do número", () => {
  it("mapeia os estados principais", () => {
    expect(explicarStatusNumero("CONNECTED").gravidade).toBe("ok")
    expect(explicarStatusNumero("PENDING").gravidade).toBe("atencao")
    expect(explicarStatusNumero("BANNED").gravidade).toBe("erro")
  })
})
