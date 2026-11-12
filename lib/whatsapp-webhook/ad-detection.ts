// Anti-patterns: palavras, saudações pessoais e expressões conversacionais
// que PROVAM de forma definitiva que a mensagem é humana/orgânica, e NÃO um anúncio pago.
export const CONVERSATIONAL_PATTERNS = [
  // Menção a corretores (templates de anúncios do Meta NUNCA sabem o nome do corretor no texto pré-preenchido)
  /\b(levi|luciana|lu|daline|dali|jessica|jéssica|aline|brayon|guilherme|joao|joão|gabriel|abraao|abraão|kleber|diego)\b/i,
  // Saudações/perguntas conversacionais pessoais
  /\b(tudo bem|tudo bom|tudo joia|como vai|como voce|como você|como ces|como vocês)\b/i,
  // Expressões informais/humanas
  /\b(rs|kkk|haha|hehe|rsrs|valeu|abrac|abraç|obrigad)\b/i,
  // Intenção formulada pelo próprio lead em primeira pessoa
  /\b(estou|estamos|queria|queria saber|queria ver|gostaria de saber se|pensando em|comecar a procurar|começar a procurar)\b/i,
  // Menção a parentes/terceiros
  /\b(minha mae|minha mãe|meu pai|meu marido|minha esposa|meu noivo|minha noiva|meus filhos|meu filho|minha filha)\b/i,
  // Perguntas sobre condições/preço/localização formuladas livremente
  /\b(quanto custa|qual o valor|aceita permuta|aceita financiamento|ainda esta disponivel|ainda está disponível|onde fica|qual regiao|qual região)\b/i,
]

// Validação de template de anúncio (Meta CTWA).
// Suporta todos os formatos oficiais da Colucci (numéricos, alfanuméricos com nome de bairro/condomínio,
// locação ou perguntas de anúncios oficiais) sem confundir com conversas humanas normais.
export function ehTemplateExatoDeAnuncio(corpo: string): boolean {
  if (!corpo) return false
  const t = corpo.trim()

  // Se contiver links (ex.: https://instagram.com, https://facebook.com), é link colado organicamente
  if (/https?:\/\//i.test(t)) return false

  // Se contiver menção direta aos nomes dos corretores (templates oficiais do Meta NUNCA sabem o nome do corretor no texto pré-preenchido)
  if (/\b(levi|luciana|lu\b|daline|dali\b|jessica|jéssica|aline|brayon|guilherme|joao|joão|gabriel|abraao|abraão|kleber|diego)\b/i.test(t)) {
    return false
  }

  // Se contiver qualquer marcador conversacional humano forte ou menção a parentes
  if (/\b(minha mae|minha mãe|meu pai|meu marido|minha esposa|meu noivo|minha noiva|meus filhos|meu filho|minha filha)\b/i.test(t)) {
    return false
  }
  if (/\b(kkk|haha|hehe|rsrs|valeu|abrac|abraç)\b/i.test(t)) {
    return false
  }

  const normalizado = t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  // Template 1 oficial da Colucci no Meta Ads:
  // "Olá Gostaria de saber mais sobre o imóvel..."
  // Ex: "Olá Gostaria de saber mais sobre o imóvel ref.: 16430"
  // Ex: "Olá Gostaria de saber mais sobre o imóvel ref.: Bairro Umuarama"
  // Ex: "Olá Gostaria de saber mais sobre o imóvel ref.: Habiana 1"
  // Ex: "Olá Gostaria de saber mais sobre o imóvel ref.: Alphaville!"
  // Ex: "Olá Gostaria de saber mais sobre o imóvel disponível para locação"
  // Ex: "Olá Gostaria de saber mais sobre o imóvel"
  if (/^ol[aá]\s+gostaria\s+(de\s+)?saber\s+mais\s+sobre\s+o\s+imovel/i.test(normalizado)) {
    return true
  }

  // Template 2 padrão oficial do Meta Ads CTWA:
  // "Olá! Posso ter mais informações sobre isso?" / "tenho interesse nisso" / "gostaria de mais informações sobre isso"
  if (/^ol[aá]\s+(posso\s+ter\s+mais\s+informac|gostaria\s+de\s+saber\s+mais\s+sobre\s+isso|tenho\s+interesse\s+nisso|gostaria\s+de\s+mais\s+informac)/i.test(normalizado)) {
    return true
  }

  // Template 3: Saudação com referência numérica ou código Colucci
  // Ex: "Olá gostaria de saber mais sobre a casa ref 17454", "Boa tarde, tenho interesse no imóvel ref: 17454"
  if (/^(ol[aá]|bom\s+dia|boa\s+tarde|boa\s+noite)\b/i.test(normalizado)) {
    if (/\b(ref|codigo|referencia)\s*[:.]?\s*[0-9]{3,}/i.test(t)) {
      return true
    }
  }

  return false
}

// Mantém retrocompatibilidade delegando para a validação estrita
export function pareceTextoDeAnuncio(texto: string): boolean {
  return ehTemplateExatoDeAnuncio(texto)
}

// Extrai referência do imóvel a partir do texto da mensagem (ex.: ref.: 17454, ref: 17454, ref 17454)
export function extrairReferenciaDoTexto(texto: string): string {
  if (!texto) return ""
  const mNum = texto.match(/ref[.:\s]+([0-9]{3,}[a-z0-9\-]*)/i)
  if (mNum?.[1]) return mNum[1].trim()
  const mAlfa = texto.match(/ref[.:\s]+([^,\n.!]+)/i)
  if (mAlfa?.[1]) return mAlfa[1].trim().slice(0, 50)
  const mCod = texto.match(/c[oó]digo[.:\s]+([0-9]{3,})/i)
  if (mCod?.[1]) return mCod[1].trim()
  return ""
}

export function detectAd(
  msg: Record<string, unknown> | null | undefined,
  corpo: string
): { veioDeAnuncio: boolean; anuncioId: string | null; anuncioTitulo: string | null } {
  const mObj = msg?.message as Record<string, unknown> | undefined
  const ephem = mObj?.ephemeralMessage as Record<string, unknown> | undefined
  const viewOnce = mObj?.viewOnceMessage as Record<string, unknown> | undefined
  const m = (ephem?.message as Record<string, unknown> | undefined) ?? (viewOnce?.message as Record<string, unknown> | undefined) ?? mObj ?? msg

  const extTxt = (m as Record<string, unknown>)?.extendedTextMessage as Record<string, unknown> | undefined
  const imgMsg = (m as Record<string, unknown>)?.imageMessage as Record<string, unknown> | undefined
  const vidMsg = (m as Record<string, unknown>)?.videoMessage as Record<string, unknown> | undefined
  const docMsg = (m as Record<string, unknown>)?.documentMessage as Record<string, unknown> | undefined

  const anyM = m as Record<string, any> | undefined
  const anyMsg = msg as Record<string, any> | undefined

  const ctx: Record<string, any> | null =
    anyMsg?.contextInfo ??
    anyM?.contextInfo ??
    (extTxt as Record<string, any> | undefined)?.contextInfo ??
    (imgMsg as Record<string, any> | undefined)?.contextInfo ??
    (vidMsg as Record<string, any> | undefined)?.contextInfo ??
    (docMsg as Record<string, any> | undefined)?.contextInfo ??
    null

  const externalAd: Record<string, any> | null = ctx?.externalAdReplyInfo ?? ctx?.externalAdReply ?? null
  const referral: Record<string, any> | null = anyM?.referral ?? anyMsg?.referral ?? ctx?.referral ?? null

  // 1. Sinal forte: referral com source_type === "ad" (campo oficial da Meta)
  if (referral?.source_type === "ad") {
    return {
      veioDeAnuncio: true,
      anuncioId: typeof referral.source_id === "string" ? referral.source_id : null,
      anuncioTitulo: (typeof referral.headline === "string" ? referral.headline : null) ?? (typeof referral.body === "string" ? referral.body : null),
    }
  }

  // 2. Sinal forte: externalAdReplyInfo presente (Click-to-WhatsApp / anúncios com mídia)
  if (externalAd && (externalAd.sourceId || externalAd.sourceUrl || externalAd.title || externalAd.body || externalAd.mediaType)) {
    return {
      veioDeAnuncio: true,
      anuncioId: typeof externalAd.sourceId === "string" ? externalAd.sourceId : null,
      anuncioTitulo: (typeof externalAd.title === "string" ? externalAd.title : null) ?? (typeof externalAd.body === "string" ? externalAd.body : null),
    }
  }

  // 3. Sinal da Evolution/Baileys para Click-to-WhatsApp:
  // - contextInfo.entryPointConversionSource (ex: "ad")
  // - contextInfo.conversionSource
  const src = String(ctx?.entryPointConversionSource || ctx?.conversionSource || "").toLowerCase()
  if (src.includes("ad")) {
    return { veioDeAnuncio: true, anuncioId: null, anuncioTitulo: "Anúncio Meta CTWA" }
  }

  // 4. Fallback: referral genérico com qualquer campo de anúncio
  if (referral && (referral.source_id || referral.source_type || referral.headline || referral.body)) {
    return {
      veioDeAnuncio: true,
      anuncioId: typeof referral.source_id === "string" ? referral.source_id : null,
      anuncioTitulo: (typeof referral.headline === "string" ? referral.headline : null) ?? (typeof referral.body === "string" ? referral.body : null),
    }
  }

  // 5. Fallback por conteúdo: APENAS template estrito e exato de anúncio do Meta Ads (CTWA)
  // Mensagens conversacionais, perguntas livres, links colados ou papo humano NUNCA são anúncios.
  if (corpo && ehTemplateExatoDeAnuncio(corpo)) {
    return { veioDeAnuncio: true, anuncioId: null, anuncioTitulo: "Anúncio Meta CTWA" }
  }

  return { veioDeAnuncio: false, anuncioId: null, anuncioTitulo: null }
}
