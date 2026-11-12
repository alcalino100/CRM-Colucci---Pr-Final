import { describe, it, expect } from "vitest"
import { ehFalhaTransitoria } from "@/lib/automation-worker/retry-policy"

describe("ehFalhaTransitoria", () => {
  it("trata 'Connection Closed' como transitório, em HTTP 500 ou 400", () => {
    expect(ehFalhaTransitoria("HTTP_500", "Connection Closed")).toBe(true)
    expect(ehFalhaTransitoria("HTTP_400", '["Error: Connection Closed"]')).toBe(true)
  })

  it("trata 5xx, 429 e exceções de rede como transitórios", () => {
    expect(ehFalhaTransitoria("HTTP_502", "Bad Gateway")).toBe(true)
    expect(ehFalhaTransitoria("HTTP_429", "")).toBe(true)
    expect(ehFalhaTransitoria("EXCEPTION", "fetch failed")).toBe(true)
  })

  it("NÃO retenta número inexistente no WhatsApp", () => {
    const msg = '[{"jid":"18997491372@s.whatsapp.net","exists":false,"number":"18997491372"}]'
    expect(ehFalhaTransitoria("HTTP_400", msg)).toBe(false)
  })

  it("NÃO retenta telefone inválido, conexão inexistente ou Evolution sem configuração", () => {
    expect(ehFalhaTransitoria("INVALID_PHONE", "Telefone inválido.")).toBe(false)
    expect(ehFalhaTransitoria("CONNECTION_NOT_FOUND", "Instância WhatsApp não encontrada.")).toBe(false)
    expect(ehFalhaTransitoria("EVOLUTION_NOT_CONFIGURED", "Evolution API não configurada.")).toBe(false)
  })

  it("aceita valores vazios sem quebrar", () => {
    expect(ehFalhaTransitoria(null, null)).toBe(false)
    expect(ehFalhaTransitoria(undefined, undefined)).toBe(false)
  })
})
