import { describe, it, expect } from "vitest"
import { ehTrafegoPago } from "@/lib/relatorios/trafego-helper"

describe("Função Canônica ehTrafegoPago (trafego-helper.ts)", () => {
  it("identifica lead quando origem é exatamente 'Tráfego Pago'", () => {
    expect(ehTrafegoPago({ origem: "Tráfego Pago" })).toBe(true)
  })

  it("identifica lead com meta_campaign_id preenchido (snake_case)", () => {
    expect(ehTrafegoPago({ origem: "WhatsApp", meta_campaign_id: "12038471928" })).toBe(true)
  })

  it("identifica lead com metaCampaignId preenchido (camelCase)", () => {
    expect(ehTrafegoPago({ origem: "Indicação", metaCampaignId: "12038471928" })).toBe(true)
  })

  it("identifica lead com utm_campaign preenchido (snake_case)", () => {
    expect(ehTrafegoPago({ origem: "Instagram", utm_campaign: "black_friday_2026" })).toBe(true)
  })

  it("identifica lead com utmCampaign preenchido (camelCase)", () => {
    expect(ehTrafegoPago({ origem: "Outro", utmCampaign: "lancamento_sul" })).toBe(true)
  })

  it("retorna false para leads orgânicos puros sem tags de anúncio", () => {
    expect(ehTrafegoPago({ origem: "Instagram" })).toBe(false)
    expect(ehTrafegoPago({ origem: "Indicação" })).toBe(false)
    expect(ehTrafegoPago({ origem: "Outro" })).toBe(false)
    expect(ehTrafegoPago({ origem: "WhatsApp", meta_campaign_id: "", utm_campaign: "   " })).toBe(false)
    expect(ehTrafegoPago(null)).toBe(false)
    expect(ehTrafegoPago(undefined)).toBe(false)
  })
})
