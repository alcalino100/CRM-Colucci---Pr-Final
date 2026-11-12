import { describe, expect, it } from "vitest"
import { isBlockedName } from "@/lib/whatsapp-webhook/contact-filters"
import { pareceRespostaNao, mapStatusEntrega } from "@/lib/whatsapp-webhook/lead-attribution"
import { camposMidia } from "@/lib/whatsapp-webhook/media-helpers"

describe("WhatsApp Webhook - Contact Filters & Blocked Names", () => {
  it("bloqueia nomes cadastrados com ou sem acentos e maiúsculas/minúsculas", () => {
    expect(isBlockedName("Fran")).toBe(true)
    expect(isBlockedName("fran")).toBe(true)
    expect(isBlockedName("Fran 🌹")).toBe(true)
    expect(isBlockedName("Ketrine Cristiane")).toBe(true)
    expect(isBlockedName("kétrine cristiane silva")).toBe(true)
  })

  it("não bloqueia clientes comuns ou nomes que não coincidem", () => {
    expect(isBlockedName("Carlos Eduardo")).toBe(false)
    expect(isBlockedName("Maria Aparecida")).toBe(false)
    expect(isBlockedName("Guilherme Teste")).toBe(false)
    expect(isBlockedName("")).toBe(false)
  })
})

describe("WhatsApp Webhook - Automation Response Detection", () => {
  it("detecta padrões de recusa rápida ('NÃO') do lead", () => {
    expect(pareceRespostaNao("não")).toBe(true)
    expect(pareceRespostaNao("nao")).toBe(true)
    expect(pareceRespostaNao("NÃO QUERO")).toBe(true)
    expect(pareceRespostaNao("sem interesse")).toBe(true)
    expect(pareceRespostaNao("não obrigado!")).toBe(true)
    expect(pareceRespostaNao("pare.")).toBe(true)
    expect(pareceRespostaNao("deixa pra la")).toBe(true)
    expect(pareceRespostaNao("agora nao")).toBe(true)
  })

  it("não considera mensagens de interesse ou conversação como recusa", () => {
    expect(pareceRespostaNao("tenho interesse sim")).toBe(false)
    expect(pareceRespostaNao("qual o valor do condomínio?")).toBe(false)
    expect(pareceRespostaNao("gostaria de agendar uma visita amanhã")).toBe(false)
    expect(pareceRespostaNao("")).toBe(false)
  })
})

describe("WhatsApp Webhook - Delivery Status Mapping", () => {
  it("mapeia status de entrega e leitura da Evolution / Baileys corretamente", () => {
    expect(mapStatusEntrega(3)).toBe("delivered")
    expect(mapStatusEntrega("3")).toBe("delivered")
    expect(mapStatusEntrega("DELIVERY_ACK")).toBe("delivered")

    expect(mapStatusEntrega(4)).toBe("read")
    expect(mapStatusEntrega("4")).toBe("read")
    expect(mapStatusEntrega("READ")).toBe("read")
    expect(mapStatusEntrega(5)).toBe("read")
    expect(mapStatusEntrega("5")).toBe("read")
    expect(mapStatusEntrega("PLAYED")).toBe("read")

    expect(mapStatusEntrega(2)).toBeNull()
    expect(mapStatusEntrega(null)).toBeNull()
    expect(mapStatusEntrega("UNKNOWN")).toBeNull()
  })
})

describe("WhatsApp Webhook - Media Fields Helper", () => {
  it("retorna objeto vazio quando midia é nula", () => {
    expect(camposMidia(null)).toEqual({})
  })

  it("retorna colunas corretas para o insert quando midia é detectada", () => {
    const midia = {
      tipo: "audio" as const,
      mimeType: "audio/ogg; codecs=opus",
      nomeArquivo: "gravacao.ogg",
      legenda: null,
    }
    expect(camposMidia(midia)).toEqual({
      tipo_midia: "audio",
      mime_type: "audio/ogg; codecs=opus",
      nome_arquivo: "gravacao.ogg",
    })
  })
})
