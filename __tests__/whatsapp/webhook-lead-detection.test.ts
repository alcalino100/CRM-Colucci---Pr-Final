import { describe, expect, it } from "vitest"
import {
  extrairTelefoneContato,
  extrairReferenciaDoTexto,
  detectAd,
  pareceTextoDeAnuncio,
} from "@/app/api/whatsapp/webhook/route"

describe("WhatsApp Webhook - LID & Inbound Contact Extraction", () => {
  it("extrai telefone padrão de remoteJid @s.whatsapp.net", () => {
    const msg = {
      key: {
        remoteJid: "5518991610040@s.whatsapp.net",
        fromMe: false,
        id: "msg-1",
      },
    }
    const { telefone, remoteJid } = extrairTelefoneContato(msg)
    expect(telefone).toBe("5518991610040")
    expect(remoteJid).toBe("5518991610040@s.whatsapp.net")
  })

  it("resolve número real a partir de remoteJidAlt quando remoteJid está em modo LID", () => {
    const msg = {
      key: {
        remoteJid: "260842004181186@lid",
        remoteJidAlt: "5517988119252@s.whatsapp.net",
        addressingMode: "lid",
        fromMe: false,
        id: "msg-lid-1",
      },
    }
    const { telefone } = extrairTelefoneContato(msg)
    expect(telefone).toBe("5517988119252")
  })

  it("resolve participante alternativo quando addressingMode é LID", () => {
    const msg = {
      key: {
        remoteJid: "136279362678846@lid",
        participantAlt: "5518997387614@s.whatsapp.net",
        addressingMode: "lid",
        fromMe: false,
      },
    }
    const { telefone } = extrairTelefoneContato(msg)
    expect(telefone).toBe("5518997387614")
  })

  it("ignora grupos e transmissões", () => {
    const msgGrupo = {
      key: {
        remoteJid: "120363412692079220@g.us",
        participant: "5518991610040@s.whatsapp.net",
      },
    }
    expect(extrairTelefoneContato(msgGrupo).telefone).toBe("")

    const msgBroadcast = {
      key: {
        remoteJid: "status@broadcast",
      },
    }
    expect(extrairTelefoneContato(msgBroadcast).telefone).toBe("")
  })
})

describe("WhatsApp Webhook - Ad & CTWA Detection", () => {
  it("detecta anúncio por referral com source_type ad", () => {
    const msg = {
      referral: {
        source_type: "ad",
        source_id: "1202084930129",
        headline: "Casa no condomínio",
      },
    }
    const res = detectAd(msg, "")
    expect(res.veioDeAnuncio).toBe(true)
    expect(res.anuncioId).toBe("1202084930129")
  })

  it("detecta anúncio por contextInfo da Meta/Evolution (conversionSource / entryPointConversionSource)", () => {
    const msg = {
      contextInfo: {
        entryPointConversionSource: "ad",
        entryPointConversionApp: "fb",
      },
    }
    const res = detectAd(msg, "")
    expect(res.veioDeAnuncio).toBe(true)
  })

  it("detecta anúncio por texto padrão pré-preenchido", () => {
    const textos = [
      "Olá, gostaria de saber mais sobre o imóvel ref. 17176",
      "Olá! Posso ter mais informações sobre isso?",
      "Vi o anúncio no Instagram e gostaria de informações",
      "Vi no Facebook esse imóvel, ainda está disponível?",
      "Olá, gostaria de agendar uma visita para essa casa",
    ]
    for (const t of textos) {
      expect(pareceTextoDeAnuncio(t)).toBe(true)
      const res = detectAd({}, t)
      expect(res.veioDeAnuncio).toBe(true)
    }
  })

  it("extrai referências numéricas e alfanuméricas do texto", () => {
    expect(extrairReferenciaDoTexto("Olá, gostaria de saber mais sobre o ref: 17454")).toBe("17454")
    expect(extrairReferenciaDoTexto("ref. 17176")).toBe("17176")
    expect(extrairReferenciaDoTexto("Código: 12345")).toBe("12345")
    expect(extrairReferenciaDoTexto("ref Umuarama")).toBe("Umuarama")
  })
})
