import { describe, expect, it } from "vitest"
import {
  extrairTelefoneContato,
  extrairReferenciaDoTexto,
  detectAd,
  pareceTextoDeAnuncio,
  ehTemplateExatoDeAnuncio,
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

  it("detecta anúncio por externalAdReply (card oficial do Meta Ads)", () => {
    const msg = {
      contextInfo: {
        externalAdReply: {
          title: "Converse conosco",
          sourceId: "120250884182240692",
          sourceUrl: "https://fb.me/colucci",
        },
      },
    }
    const res = detectAd(msg, "Olá, quero saber mais")
    expect(res.veioDeAnuncio).toBe(true)
    expect(res.anuncioId).toBe("120250884182240692")
    expect(res.anuncioTitulo).toBe("Converse conosco")
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

  it("detecta anúncio quando o texto é o template boilerplate do Meta Ads (numérico, alfanumérico e locação)", () => {
    const templatesOficiais = [
      "Olá Gostaria de saber mais sobre o imóvel ref.: 16430",
      "Olá, gostaria de saber mais sobre o imóvel ref 17176",
      "Olá Gostaria de saber mais sobre o imóvel ref.: Bairro Umuarama",
      "Olá Gostaria de saber mais sobre o imóvel ref.: Habiana 1",
      "Olá Gostaria de saber mais sobre o imóvel ref.: Alphaville!",
      "Olá Gostaria de saber mais sobre o imóvel ref.: Portal dos Bandeirantes",
      "Olá Gostaria de saber mais sobre o imóvel ref.: Villa Estádio!",
      "Olá Gostaria de saber mais sobre o imóvel disponível para locação",
      "Olá Gostaria de saber mais sobre o imóvel",
      "Olá! Posso ter mais informações sobre isso?",
      "Olá! Tenho interesse nisso.",
      "Olá Gostaria de saber mais sobre o imóvel ref.: 17454\nAmanhã volto a fazer contato. \nObrigado.",
      "Olá Gostaria de saber mais sobre o imóvel ref.: 17454 valor dessa casa?",
    ]
    for (const t of templatesOficiais) {
      expect(ehTemplateExatoDeAnuncio(t)).toBe(true)
      const res = detectAd({}, t)
      expect(res.veioDeAnuncio).toBe(true)
    }
  })

  it("NUNCA considera conversas orgânicas, correntes ou mensagens casuais como Tráfego Pago", () => {
    const conversasOrganicas = [
      "Oi Levi, tudo bem? Estamos pensando em começar a procurar, rs\nO Jequitiba ainda esta disponivel?",
      "Bom dia Levi, como vai? Esse imóvel ainda está disponível?",
      "Olá Jessica, tudo bem? Vi uma casa no condomínio e queria saber o valor",
      "https://www.instagram.com/p/Dc7USpyHHK5/?srtk=cHg1dG9iN3k2MHYw",
      "Ref - 17607 Vendida por mim",
      "Ref 17428 Permuta.",
      "bom dia, gostaria de saber em qual região é essa casa e qual o valor",
      "Oi Aline, meu marido e eu estamos procurando um terreno",
      "quanto custa esse apartamento?",
      "onde fica essa casa?",
      "tranquilo",
      "bele",
      "Muito obrigada por sua disponibilidade",
      "Hoje, todos nós temos 2.026 anos de idade! Você sabia que hoje a idade de todo mundo é a mesma?",
      "Boa tarde tudo bem?",
    ]
    for (const texto of conversasOrganicas) {
      expect(ehTemplateExatoDeAnuncio(texto)).toBe(false)
      expect(pareceTextoDeAnuncio(texto)).toBe(false)
      const res = detectAd({}, texto)
      expect(res.veioDeAnuncio).toBe(false)
    }
  })

  it("não marca como anúncio se apenas entryPointConversionApp for instagram sem conversionSource ad", () => {
    const msg = {
      contextInfo: {
        entryPointConversionApp: "instagram",
      },
    }
    const res = detectAd(msg, "Oi boa tarde")
    expect(res.veioDeAnuncio).toBe(false)
  })

  it("extrai referências numéricas e alfanuméricas do texto quando for anúncio", () => {
    expect(extrairReferenciaDoTexto("Olá, gostaria de saber mais sobre o ref: 17454")).toBe("17454")
    expect(extrairReferenciaDoTexto("ref. 17176")).toBe("17176")
    expect(extrairReferenciaDoTexto("Código: 12345")).toBe("12345")
    expect(extrairReferenciaDoTexto("ref Umuarama")).toBe("Umuarama")
  })
})
