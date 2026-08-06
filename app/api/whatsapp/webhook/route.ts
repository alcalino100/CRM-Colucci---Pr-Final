import { NextResponse } from "next/server"
import { normalizePhone } from "@/lib/labels"
import { mapConnectionState, notifyDisconnection, onlyDigits, wsupabase } from "@/lib/whatsapp/server"
import { enviarLeadCapi } from "@/lib/meta/capi"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

// Sempre responde 200 para não interromper o fluxo da Evolution
const ok = () => NextResponse.json({ received: true })

// Números internos que NUNCA podem virar lead (ex.: setor de vendas da empresa, WhatsApp do gestor
// e esposa/parentes de corretores — Ketrine e Fran). Configurável via WHATSAPP_BLOCKED_NUMBERS.
// Comparação só por dígitos.
const BLOCKED_NUMBERS = new Set(
  (process.env.WHATSAPP_BLOCKED_NUMBERS || "5518991976332,5518996647087,5518997472139,5518997857464")
    .split(",")
    .map((s) => s.trim().replace(/\D/g, ""))
    .filter(Boolean)
)
const isBlocked = (telefone: string) => BLOCKED_NUMBERS.has(telefone)

// Nomes internos que NUNCA podem virar lead (ex.: esposa/parentes de corretores).
// Configurável via WHATSAPP_BLOCKED_NAMES (separado por vírgula). Comparação normalizada
// (sem acentos/emoji) — "Fran 🌹" e "Fran" são tratados como o mesmo nome.
function normalizeName(v: string): string {
  return (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
const BLOCKED_NAMES = new Set(
  (process.env.WHATSAPP_BLOCKED_NAMES || "ketrine cristiane,fran")
    .split(",")
    .map((s) => normalizeName(s))
    .filter(Boolean)
)
function isBlockedName(nome: string): boolean {
  const n = normalizeName(nome)
  if (!n) return false
  return Array.from(BLOCKED_NAMES).some((b) => n === b || n.startsWith(`${b} `))
}

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

  // Estado anterior para detectar a transição (evita spam de alertas de desconexão)
  const { data: anterior } = await wsupabase
    .from("whatsapp_instancias")
    .select("status")
    .eq("instance_name", instanceName)
    .maybeSingle()

  const patch: Record<string, unknown> = { status, atualizado_em: new Date().toISOString() }
  if (status === "conectado" && numero) patch.numero = numero
  if (status === "conectado") patch.qr_code = null
  await wsupabase.from("whatsapp_instancias").update(patch).eq("instance_name", instanceName)

  // Instância que estava conectada e caiu: avisa o gestor via WhatsApp
  if (status === "desconectado" && anterior?.status === "conectado") {
    void notifyDisconnection(instanceName)
  }
}

// Detecta se a mensagem nasceu de um clique em anúncio (Click-to-WhatsApp).
// A Meta injeta esse contexto na 1ª mensagem; a Evolution repassa em campos que
// variam por versão, então tentamos todos, em ordem de prioridade.
// Alguns cliques chegam SEM contexto (Evolution inconsistente) — nesse caso,
// cai no fallback por conteúdo (texto pré-preenchido do anúncio).
function pareceTextoDeAnuncio(texto: string): boolean {
  const t = (texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  // Texto pré-preenchido padrão dos anúncios Click-to-WhatsApp da Meta
  return /^ola\s+gostaria\s+de\s+saber\s+mais\s+sobre\s+o\s+imovel/.test(t)
}

function detectAd(msg: any, corpo: string): { veioDeAnuncio: boolean; anuncioId: string | null; anuncioTitulo: string | null } {
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

  // Fallback por conteúdo: texto pré-preenchido do anúncio (mesmo sem contexto CTWA)
  if (corpo && pareceTextoDeAnuncio(corpo)) {
    return { veioDeAnuncio: true, anuncioId: null, anuncioTitulo: corpo }
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
  // Números internos bloqueados: ignora completamente (sem lead, sem mensagem, sem notificação)
  if (isBlocked(telefone)) return
  const nome = msg?.pushName || telefone
  // Nomes internos (esposa/parentes de corretores): ignora completamente — sem lead, sem mensagem, sem notificação
  if (isBlockedName(nome)) return
  const corpo =
    msg?.message?.conversation ??
    msg?.message?.extendedTextMessage?.text ??
    "[mídia]"

  // Código de rastreio (ponte /r): o texto pré-preenchido termina com "Código: XXXXXXXX".
  // Mesmo sem contexto CTWA da Meta, o código casa o clique com o lead.
  const codigo = /(?:codigo|código)[:.\s-]*([A-Z0-9]{6,10})\s*[.!]?\s*$/i.exec(corpo.trim())?.[1] ?? null
  const { data: clique } = codigo
    ? await wsupabase
        .from("rastreio_cliques")
        .select("*")
        .eq("click_id", codigo)
        .gt("expira_em", new Date().toISOString())
        .maybeSingle()
    : { data: null }

  // Descobre o corretor dono da instância
  const { data: inst } = await wsupabase
    .from("whatsapp_instancias")
    .select("corretor_id")
    .eq("instance_name", instanceName)
    .maybeSingle()
  const corretorId = inst?.corretor_id
  if (!corretorId) return

  const { veioDeAnuncio, anuncioId, anuncioTitulo } = detectAd(msg, corpo)
  const veioDeAnuncioEfetivo = veioDeAnuncio || !!clique

  // Mensagem orgânica: só registra para referência, não cria lead nem notifica.
  if (!veioDeAnuncioEfetivo) {
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

  // A partir daqui: mensagem confirmadamente vinda de anúncio (Click-to-WhatsApp ou ponte /r).
  // Busca informações de rastreamento Meta a partir do anúncio detectado.
  // Prioridade: contexto CTWA (anuncioId) > dados da ponte de rastreio (clique) > null.
  let metaCampaignId: string | null = clique?.meta_campaign_id ?? null
  let metaAdsetId: string | null = clique?.meta_adset_id ?? null
  let metaAdId: string | null = anuncioId ?? clique?.meta_ad_id ?? null
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
  const existente = (candidatos ?? []).find((l) => normalizePhone(l.telefone) === normalizePhone(telefone))

  // Nome do corretor da instância (para as notificações)
  const { data: corretor } = await wsupabase.from("usuarios").select("nome").eq("id", corretorId).maybeSingle()
  const corretorNome = corretor?.nome ?? "corretor"

  // Telefone que já é do MESMO corretor: não duplica, apenas anexa a mensagem ao lead existente
  const mesmoCorretor = existente && existente.corretor_id === corretorId
  let leadId: string | null = mesmoCorretor ? existente.id : null

  // Lead já existente: enriquece com o rastreio do clique (utm/fbc/fbp)
  if (mesmoCorretor && clique) {
    await wsupabase.from("leads").update({
      utm_campaign: clique.utm_campaign ?? null,
      utm_adset: clique.utm_adset ?? null,
      utm_ad: clique.utm_ad ?? null,
      fbc: clique.fbc ?? null,
      fbp: clique.fbp ?? null,
      client_ip: clique.ip ?? null,
      client_ua: clique.user_agent ?? null,
    }).eq("id", existente.id)
  }

  if (!mesmoCorretor) {
    // Cria lead para o corretor que recebeu o clique — mesmo que o telefone já exista para outro corretor.
    // Assim o lead do tráfego nunca fica "invisível" para quem recebeu a mensagem.
    const partesObs: string[] = ["Lead criado automaticamente via WhatsApp (Click-to-WhatsApp)"]
    if (nomeAnuncio || anuncioTitulo) partesObs.push(`Anúncio: ${nomeAnuncio || anuncioTitulo}`)
    if (nomeCampanha) partesObs.push(`Campanha: ${nomeCampanha}`)
    if (nomeConjunto) partesObs.push(`Conjunto: ${nomeConjunto}`)
    if (clique?.utm_campaign) partesObs.push(`UTM campanha: ${clique.utm_campaign}`)
    if (clique?.utm_adset) partesObs.push(`UTM conjunto: ${clique.utm_adset}`)
    const obs = partesObs.join("\n")
    // Se o anúncio não carregou contexto (detecção por conteúdo), tenta extrair o Ref. do imóvel do texto
    const referenciaExtraida = !anuncioId ? (corpo.match(/ref[.:]?\s*(\d{3,})/i)?.[1] ?? "") : ""
    const baseLead = {
      nome,
      telefone,
      email: "",
      referencia_imovel: referenciaExtraida,
      referencias: referenciaExtraida ? [referenciaExtraida] : [],
      temperatura: "morno",
      origem: "Tráfego Pago",
      observacoes: obs,
      status: "novo",
      corretor_id: corretorId,
      meta_campaign_id: metaCampaignId,
      meta_adset_id: metaAdsetId,
      meta_ad_id: metaAdId,
    }
    const rastreioLead = {
      utm_campaign: clique?.utm_campaign ?? null,
      utm_adset: clique?.utm_adset ?? null,
      utm_ad: clique?.utm_ad ?? null,
      fbc: clique?.fbc ?? null,
      fbp: clique?.fbp ?? null,
      client_ip: clique?.ip ?? null,
      client_ua: clique?.user_agent ?? null,
    }
    // Colunas de rastreio dependem da migration 013: se ainda não existirem, insere sem elas
    let { data: novo, error } = await wsupabase
      .from("leads")
      .insert({ ...baseLead, ...rastreioLead })
      .select("id")
      .maybeSingle()
    if (error && String(error.message).includes("does not exist")) {
      ;({ data: novo, error } = await wsupabase
        .from("leads")
        .insert(baseLead)
        .select("id")
        .maybeSingle())
    }
    if (error) {
      // Corrida: telefone inserido em paralelo — trata como existente
      const { data: candidatos2 } = await wsupabase.from("leads").select("id, telefone, corretor_id, status")
      const again = (candidatos2 ?? []).find((l) => normalizePhone(l.telefone) === normalizePhone(telefone))
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
      // Envia o evento Lead (CAPI) com os identificadores capturados na ponte de rastreio.
      // Melhora a "match quality" e atribui o lead à campanha/conjunto real. Best-effort.
      if (leadId) {
        try {
          await enviarLeadCapi({
            lead_id: leadId,
            telefone,
            nome,
            email: "",
            valor: 0,
            corretor_id: corretorId,
            campanha_id: metaCampaignId,
            adset_id: metaAdsetId,
            ad_id: metaAdId,
            utm_campaign: clique?.utm_campaign ?? null,
            utm_adset: clique?.utm_adset ?? null,
            utm_ad: clique?.utm_ad ?? null,
            fbc: clique?.fbc ?? null,
            fbp: clique?.fbp ?? null,
            ip: clique?.ip ?? null,
            ua: clique?.user_agent ?? null,
          })
        } catch {
          // nunca derruba o processamento do webhook
        }
      }
      // Telefone já cadastrado para outro corretor: avisa o gestor, mas o lead do clique é de quem recebeu
      if (existente && existente.corretor_id && existente.corretor_id !== corretorId) {
        const { data: dono } = await wsupabase.from("usuarios").select("nome").eq("id", existente.corretor_id).maybeSingle()
        await wsupabase.from("notificacoes").insert({
          mensagem: `Possível lead duplicado: ${telefone} clicou em anúncio e escreveu para o WhatsApp de ${corretorNome}, mas já é lead de ${dono?.nome ?? "outro corretor"} (status: ${existente.status}).`,
          tipo: "possivel_duplicado",
          usuario_id: corretorId,
          para_role: "gestor",
          lead_id: existente.id,
        })
      }
    }
  }

  // Marca o clique como consumido e liga ao lead criado/encontrado
  if (clique) {
    await wsupabase.from("rastreio_cliques").update({
      telefone,
      lead_id: leadId,
      consumido: true,
    }).eq("id", clique.id)
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
    else if (event.includes("messages")) {
      // Processa TODAS as mensagens do lote (não só data[0])
      const itens = Array.isArray(payload?.data) ? payload.data : [payload?.data]
      for (const item of itens) {
        if (!item) continue
        await handleMessageUpsert({ ...payload, data: item })
      }
    }

    return ok()
  } catch (error) {
    console.log("[v0] whatsapp webhook error:", error instanceof Error ? error.message : String(error))
    return ok()
  }
}
