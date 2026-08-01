import { NextResponse } from "next/server"
import { mapConnectionState, onlyDigits, wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

// Sempre responde 200 para não interromper o fluxo da Evolution
const ok = () => NextResponse.json({ received: true })

function getInstanceName(payload: any): string | null {
  return payload?.instance ?? payload?.instanceName ?? payload?.data?.instance ?? null
}

async function handleConnectionUpdate(payload: any) {
  const instanceName = getInstanceName(payload)
  if (!instanceName) return
  const state = payload?.data?.state ?? payload?.data?.connection ?? payload?.state
  const status = mapConnectionState(state)
  const numeroRaw = payload?.data?.wuid ?? payload?.data?.number ?? payload?.wuid ?? null
  const numero = numeroRaw ? onlyDigits(String(numeroRaw).split("@")[0]) : null

  const patch: Record<string, unknown> = { status, atualizado_em: new Date().toISOString() }
  if (status === "conectado" && numero) patch.numero = numero
  if (status === "conectado") patch.qr_code = null
  await wsupabase.from("whatsapp_instancias").update(patch).eq("instance_name", instanceName)
}

// Detecta se a mensagem nasceu de um clique em anúncio (Click-to-WhatsApp).
// A Meta injeta esse contexto na 1ª mensagem; a Evolution repassa em campos que
// variam por versão, então tentamos todos, em ordem de prioridade.
function detectAd(msg: any): { veioDeAnuncio: boolean; anuncioId: string | null; anuncioTitulo: string | null } {
  const ctx = msg?.contextInfo ?? msg?.message?.contextInfo ?? msg?.message?.extendedTextMessage?.contextInfo
  const externalAd = ctx?.externalAdReplyInfo
  const referral = msg?.message?.referral ?? msg?.referral

  // Sinal forte: referral com source_type === "ad" (campo oficial da Meta)
  if (referral?.source_type === "ad") {
    return {
      veioDeAnuncio: true,
      anuncioId: referral.source_id ?? null,
      anuncioTitulo: referral.headline ?? referral.body ?? null,
    }
  }

  // Sinal forte: externalAdReplyInfo presente (Click-to-WhatsApp / anúncios com mídia)
  if (externalAd && (externalAd.sourceId || externalAd.sourceUrl || externalAd.title || externalAd.body || externalAd.mediaType)) {
    return {
      veioDeAnuncio: true,
      anuncioId: externalAd.sourceId ?? null,
      anuncioTitulo: externalAd.title ?? externalAd.body ?? null,
    }
  }

  // Sinal da Evolution para Click-to-WhatsApp: contextInfo.conversionSource
  // (não carrega ID do anúncio, mas é o que a Evolution repassa de fato)
  if (ctx?.conversionSource) {
    return { veioDeAnuncio: true, anuncioId: null, anuncioTitulo: null }
  }

  // Fallback: referral genérico com qualquer campo de anúncio
  if (referral && (referral.source_id || referral.source_type || referral.headline || referral.body)) {
    return {
      veioDeAnuncio: true,
      anuncioId: referral.source_id ?? null,
      anuncioTitulo: referral.headline ?? referral.body ?? null,
    }
  }

  return { veioDeAnuncio: false, anuncioId: null, anuncioTitulo: null }
}

async function handleMessageUpsert(payload: any) {
  const instanceName = getInstanceName(payload)
  if (!instanceName) return
  const msg = Array.isArray(payload?.data) ? payload.data[0] : payload?.data
  if (!msg || msg?.key?.fromMe === true) return

  const remoteJid: string = msg?.key?.remoteJid ?? ""
  // Ignora grupos e transmissões
  if (remoteJid.includes("@g.us") || remoteJid.includes("broadcast")) return
  const telefone = onlyDigits(remoteJid.split("@")[0])
  if (!telefone) return
  const nome = msg?.pushName || telefone
  const corpo =
    msg?.message?.conversation ??
    msg?.message?.extendedTextMessage?.text ??
    "[mídia]"

  // Descobre o corretor dono da instância
  const { data: inst } = await wsupabase
    .from("whatsapp_instancias")
    .select("corretor_id")
    .eq("instance_name", instanceName)
    .maybeSingle()
  const corretorId = inst?.corretor_id
  if (!corretorId) return

  const { veioDeAnuncio, anuncioId, anuncioTitulo } = detectAd(msg)

  // Mensagem orgânica: só registra para referência, não cria lead nem notifica.
  if (!veioDeAnuncio) {
    await wsupabase.from("whatsapp_mensagens").insert({
      instance_name: instanceName,
      telefone,
      nome_contato: nome,
      corpo,
      lead_id: null,
      veio_de_anuncio: false,
    })
    return
  }

  // A partir daqui: mensagem confirmadamente vinda de anúncio (Click-to-WhatsApp).
  // Busca informações de rastreamento Meta a partir do anúncio detectado
  let metaCampaignId: string | null = null
  let metaAdsetId: string | null = null
  let metaAdId: string | null = anuncioId
  let nomeAnuncio: string | null = null
  let nomeCampanha: string | null = null
  let nomeConjunto: string | null = null

  if (anuncioId) {
    const { data: metaAd } = await wsupabase
      .from("meta_ads")
      .select("campanha_id, adset_id, nome")
      .eq("id", anuncioId)
      .maybeSingle()
    if (metaAd) {
      metaCampaignId = metaAd.campanha_id ?? null
      metaAdsetId = metaAd.adset_id ?? null
      nomeAnuncio = metaAd.nome ?? null
    }
  }

  if (metaCampaignId) {
    const { data: campanha } = await wsupabase
      .from("meta_campanhas")
      .select("nome")
      .eq("id", metaCampaignId)
      .maybeSingle()
    nomeCampanha = campanha?.nome ?? null
  }

  if (metaAdsetId) {
    const { data: conjunto } = await wsupabase
      .from("meta_adsets")
      .select("nome")
      .eq("id", metaAdsetId)
      .maybeSingle()
    nomeConjunto = conjunto?.nome ?? null
  }

  const { data: candidatos } = await wsupabase.from("leads").select("id, telefone, corretor_id, status")
  const existente = (candidatos ?? []).find((l) => onlyDigits(l.telefone) === telefone)

  let leadId: string | null = existente?.id ?? null

  // Nome do corretor da instância (para as notificações)
  const { data: corretor } = await wsupabase.from("usuarios").select("nome").eq("id", corretorId).maybeSingle()
  const corretorNome = corretor?.nome ?? "corretor"

  if (!existente) {
    // Caso A: novo lead via tráfego pago
    const partesObs: string[] = ["Lead criado automaticamente via WhatsApp (Click-to-WhatsApp)"]
    if (nomeAnuncio || anuncioTitulo) partesObs.push(`Anúncio: ${nomeAnuncio || anuncioTitulo}`)
    if (nomeCampanha) partesObs.push(`Campanha: ${nomeCampanha}`)
    if (nomeConjunto) partesObs.push(`Conjunto: ${nomeConjunto}`)
    const obs = partesObs.join("\n")
    const { data: novo, error } = await wsupabase
      .from("leads")
      .insert({
        nome,
        telefone,
        email: "",
        referencia_imovel: "",
        referencias: [],
        temperatura: "morno",
        origem: "Tráfego Pago",
        observacoes: obs,
        status: "novo",
        corretor_id: corretorId,
        meta_campaign_id: metaCampaignId,
        meta_adset_id: metaAdsetId,
        meta_ad_id: metaAdId,
      })
      .select("id")
      .maybeSingle()
    if (error) {
      // Corrida (unique 23505): telefone inserido em paralelo — trata como existente
      const { data: candidatos2 } = await wsupabase.from("leads").select("id, telefone, corretor_id, status")
      const again = (candidatos2 ?? []).find((l) => onlyDigits(l.telefone) === telefone)
      leadId = again?.id ?? null
      if (again && again.corretor_id && again.corretor_id !== corretorId) {
        await wsupabase.from("notificacoes").insert({
          mensagem: `Possível lead duplicado: ${telefone} clicou em anúncio e escreveu para o WhatsApp de ${corretorNome}, mas já é lead de outro corretor (status: ${again.status}).`,
          tipo: "possivel_duplicado",
          usuario_id: corretorId,
          para_role: "gestor",
          lead_id: again.id,
        })
      }
    } else {
      leadId = novo?.id ?? null
      await wsupabase.from("notificacoes").insert({
        mensagem: `Novo lead via tráfego pago (WhatsApp): ${nome} (via ${corretorNome})`,
        tipo: "lead_novo",
        usuario_id: corretorId,
        para_role: "gestor",
        lead_id: leadId,
      })
    }
  } else if (existente.corretor_id && existente.corretor_id !== corretorId) {
    // Caso B: telefone já pertence a outro corretor
    const { data: dono } = await wsupabase.from("usuarios").select("nome").eq("id", existente.corretor_id).maybeSingle()
    await wsupabase.from("notificacoes").insert({
      mensagem: `Possível lead duplicado: ${telefone} clicou em anúncio e escreveu para o WhatsApp de ${corretorNome}, mas já é lead de ${dono?.nome ?? "outro corretor"} (status: ${existente.status}).`,
      tipo: "possivel_duplicado",
      usuario_id: corretorId,
      para_role: "gestor",
      lead_id: existente.id,
    })
    // Mesmo sendo duplicado, enriquece os dados do lead original com as informações do anúncio
    const partesAd: string[] = []
    if (nomeAnuncio || anuncioTitulo) partesAd.push(`Anúncio: ${nomeAnuncio || anuncioTitulo}`)
    if (nomeCampanha) partesAd.push(`Campanha: ${nomeCampanha}`)
    if (nomeConjunto) partesAd.push(`Conjunto: ${nomeConjunto}`)
    if (partesAd.length) {
      const obsExtra = `[${new Date().toLocaleString("pt-BR")} - Clique em anúncio]\n${partesAd.join("\n")}`
      await wsupabase
        .from("leads")
        .update({
          meta_campaign_id: metaCampaignId || existente.meta_campaign_id || null,
          meta_adset_id: metaAdsetId || existente.meta_adset_id || null,
          meta_ad_id: metaAdId || existente.meta_ad_id || null,
          observacoes: (existente.observacoes || "") + "\n\n" + obsExtra,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", existente.id)
    }
  }

  // Registra a mensagem recebida (com contexto do anúncio)
  await wsupabase.from("whatsapp_mensagens").insert({
    instance_name: instanceName,
    telefone,
    nome_contato: nome,
    corpo,
    lead_id: leadId,
    veio_de_anuncio: true,
    anuncio_id: anuncioId,
    anuncio_titulo: anuncioTitulo,
  })
}

export async function POST(request: Request) {
  try {
    // Se um segredo estiver configurado, exige-o na query ou header
    const secret = process.env.WHATSAPP_WEBHOOK_SECRET
    if (secret) {
      const url = new URL(request.url)
      const provided = url.searchParams.get("secret") ?? request.headers.get("x-webhook-secret")
      if (provided !== secret) return ok()
    }

    const payload = await request.json().catch(() => null)
    if (!payload) return ok()

    const event: string = payload.event ?? payload.type ?? ""
    if (event.includes("connection")) await handleConnectionUpdate(payload)
    else if (event.includes("messages")) await handleMessageUpsert(payload)

    return ok()
  } catch (error) {
    console.log("[v0] whatsapp webhook error:", error instanceof Error ? error.message : String(error))
    return ok()
  }
}
