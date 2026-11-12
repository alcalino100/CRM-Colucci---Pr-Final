import { logger } from "@/lib/logger"
import { detectarMidia, wsupabase } from "@/lib/whatsapp/server"
import { registrarRespostaDeLead } from "@/lib/automation-services"
import { agenteParaInstancia, handlePatriciaInbound, isNumeroTesteIA, pausarIaMensagemManual, saudarLeadCTWA } from "@/lib/ai/inboxHandler"
import { isBlocked, isBlockedName, extrairTelefoneContato } from "./contact-filters"
import { detectAd } from "./ad-detection"
import { camposMidia, preencherMidiaUrl, processarCorpoMidia } from "./media-helpers"
import { encontrarLeadPorTelefone, transicaoRespostaAutomacao, reengajarOuCriarLeadTráfego } from "./lead-attribution"
import { getInstanceName } from "./connection-handler"

export async function handleMessageUpsert(payload: Record<string, unknown> | null | undefined): Promise<void> {
  const instanceName = getInstanceName(payload)
  if (!instanceName) return
  const msg = (Array.isArray(payload?.data) ? payload.data[0] : payload?.data) as Record<string, unknown> | undefined
  if (!msg) return

  const { telefone } = extrairTelefoneContato(msg)
  if (!telefone) return

  // Descobre o corretor dono da instância logo no início (busca case-insensitive e sem espaços)
  const { data: inst } = await wsupabase
    .from("whatsapp_instancias")
    .select("corretor_id, instance_name")
    .ilike("instance_name", instanceName.trim())
    .maybeSingle()
  const corretorId = inst?.corretor_id ?? null

  const bloqueado = isBlocked(telefone) && !(await isNumeroTesteIA(telefone))
  const key = msg?.key as Record<string, unknown> | undefined
  const mensagemId: string | null = typeof key?.id === "string" ? key.id : null

  // Idempotência: Evolution reentrega o mesmo evento em retry/timeout
  if (mensagemId) {
    const { data: jaProcessada } = await wsupabase
      .from("whatsapp_mensagens")
      .select("id")
      .eq("mensagem_id", mensagemId)
      .maybeSingle()
    if (jaProcessada) return
  }

  const midia = detectarMidia(msg?.message)
  const deveProcessarMidiaIA =
    !!midia &&
    key?.fromMe !== true &&
    ((await agenteParaInstancia(instanceName)) !== null || (await isNumeroTesteIA(telefone)))

  const corpo = await processarCorpoMidia({
    msg,
    midia,
    instanceName,
    telefone,
    mensagemId,
    deveProcessarMidiaIA,
  })

  // Bloqueado (e não é teste): só registra para fidelidade com o Evolution
  if (bloqueado && key?.fromMe !== true) {
    await wsupabase.from("whatsapp_mensagens").insert({
      instance_name: instanceName,
      telefone,
      nome_contato: typeof msg?.pushName === "string" ? msg.pushName : telefone,
      corpo,
      lead_id: null,
      veio_de_anuncio: false,
      mensagem_id: mensagemId,
      ...camposMidia(midia),
    })
    await preencherMidiaUrl(instanceName, mensagemId, midia)
    return
  }

  // Mensagem enviada pelo corretor (outbound)
  if (key?.fromMe === true) {
    const { data: jaExiste } = mensagemId
      ? await wsupabase.from("whatsapp_mensagens").select("id").eq("mensagem_id", mensagemId).maybeSingle()
      : { data: null }
    if (jaExiste) return

    await wsupabase.from("whatsapp_mensagens").insert({
      instance_name: instanceName,
      telefone,
      nome_contato: null,
      corpo,
      lead_id: await encontrarLeadPorTelefone(telefone, corretorId),
      de_mim: true,
      mensagem_id: mensagemId,
      ...camposMidia(midia),
    })
    await preencherMidiaUrl(instanceName, mensagemId, midia)
    await pausarIaMensagemManual({ telefone, instanceName, textoOutbound: corpo }).catch(() => {})
    return
  }

  const nome = typeof msg?.pushName === "string" ? msg.pushName : telefone

  // Nomes internos (familiares): registra para fidelidade, mas sem lead/IA
  if (isBlockedName(nome)) {
    await wsupabase.from("whatsapp_mensagens").insert({
      instance_name: instanceName,
      telefone,
      nome_contato: nome,
      corpo,
      lead_id: null,
      veio_de_anuncio: false,
      mensagem_id: mensagemId,
      ...camposMidia(midia),
    })
    await preencherMidiaUrl(instanceName, mensagemId, midia)
    return
  }

  // Lead já existente?
  const leadIdExistente = await encontrarLeadPorTelefone(telefone, corretorId)
  if (leadIdExistente) await registrarRespostaDeLead(leadIdExistente, new Date().toISOString())

  if (leadIdExistente && key?.fromMe !== true) {
    await transicaoRespostaAutomacao(leadIdExistente, corpo).catch(() => {})
  }

  // Código de rastreio (ponte /r)
  const codigo = /(?:codigo|código)[:.\s-]*([A-Z0-9]{6,10})\s*[.!]?\s*$/i.exec(corpo.trim())?.[1] ?? null
  const { data: clique } = codigo
    ? await wsupabase
        .from("rastreio_cliques")
        .select("*")
        .eq("click_id", codigo)
        .gt("expira_em", new Date().toISOString())
        .maybeSingle()
    : { data: null }

  if (!corretorId) {
    logger.warn("Instância sem corretor_id associado em whatsapp_instancias", { instanceName })
    return
  }

  const { veioDeAnuncio, anuncioId, anuncioTitulo } = detectAd(msg, corpo)
  const veioDeAnuncioEfetivo = veioDeAnuncio || !!clique

  // Mensagem orgânica
  if (!veioDeAnuncioEfetivo) {
    await wsupabase.from("whatsapp_mensagens").insert({
      instance_name: instanceName,
      telefone,
      nome_contato: nome,
      corpo,
      lead_id: leadIdExistente,
      veio_de_anuncio: false,
      mensagem_id: mensagemId,
      ...camposMidia(midia),
    })
    await preencherMidiaUrl(instanceName, mensagemId, midia)
    if (!key?.fromMe) {
      await handlePatriciaInbound({
        telefone,
        texto: corpo,
        leadId: leadIdExistente || undefined,
        instanceName,
        mensagemId: mensagemId || undefined,
      }).catch(() => {})
    }
    return
  }

  // Mensagem vinda de anúncio
  const { leadId } = await reengajarOuCriarLeadTráfego({
    telefone,
    nome,
    corpo,
    corretorId,
    anuncioId,
    anuncioTitulo,
    clique: clique as Record<string, any> | null,
  })

  // Marca clique consumido
  if (clique) {
    await wsupabase
      .from("rastreio_cliques")
      .update({
        telefone,
        lead_id: leadId,
        consumido: true,
      })
      .eq("id", clique.id)
  }

  // Registra mensagem recebida com anúncio
  await wsupabase.from("whatsapp_mensagens").insert({
    instance_name: instanceName,
    telefone,
    nome_contato: nome,
    corpo,
    lead_id: leadId,
    veio_de_anuncio: true,
    anuncio_id: anuncioId,
    anuncio_titulo: anuncioTitulo,
    mensagem_id: mensagemId,
    ...camposMidia(midia),
  })
  await preencherMidiaUrl(instanceName, mensagemId, midia)

  if (!key?.fromMe) {
    if (!corpo.trim()) {
      await saudarLeadCTWA({ telefone, leadId: leadId || leadIdExistente || undefined, instanceName }).catch(() => {})
    } else {
      await handlePatriciaInbound({
        telefone,
        texto: corpo,
        leadId: leadId || leadIdExistente || undefined,
        instanceName,
        mensagemId: mensagemId || undefined,
      }).catch(() => {})
    }
  }
}
