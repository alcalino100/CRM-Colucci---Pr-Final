import { NextResponse } from "next/server"
import { TAG_FOLLOWUP, TAG_NAO_RESPONDEU_AUTOMACAO, TAG_RESPONDEU_AUTOMACAO, comRef, normalizePhone, semRef } from "@/lib/labels"
import { baixarEArmazenarMidia, detectarMidia, mapConnectionState, notifyDisconnection, onlyDigits, wsupabase, type MidiaDetectada } from "@/lib/whatsapp/server"
import { registrarRespostaDeLead, registrarStatusEntrega } from "@/lib/automation-services"
import { enviarLeadCapi } from "@/lib/meta/capi"
import { TELEFONES_BLOQUEADOS, isTelefoneBloqueado as isBlockedCentral } from "@/lib/telefones-bloqueados"
import { agenteParaInstancia, handlePatriciaInbound, isNumeroTesteIA, pausarIaMensagemManual, saudarLeadCTWA } from "@/lib/ai/inboxHandler"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// Mídia (download/transcrição) + debounce + geração Claude + envio podem passar
// dos 30s padrão — 60s dão folga sem estourar o limite do plano.
export const maxDuration = 60

// Sempre responde 200 para não interromper o fluxo da Evolution
const ok = () => NextResponse.json({ received: true })

// Números internos que NUNCA podem virar lead — lista centralizada em lib/telefones-bloqueados.ts
// Mantém compatibilidade com WHATSAPP_BLOCKED_NUMBERS via env (merge)
const ENV_BLOCKED = new Set(
  (process.env.WHATSAPP_BLOCKED_NUMBERS || "")
    .split(",")
    .map((s) => s.trim().replace(/\D/g, ""))
    .filter(Boolean)
)
const BLOCKED_NUMBERS = new Set<string>([...TELEFONES_BLOQUEADOS, ...ENV_BLOCKED])
const isBlocked = (telefone: string) => BLOCKED_NUMBERS.has(telefone.replace(/\D/g, "")) || isBlockedCentral(telefone)

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

// Anti-patterns: palavras, saudações pessoais e expressões conversacionais
// que PROVAM de forma definitiva que a mensagem é humana/orgânica, e NÃO um anúncio pago.
const CONVERSATIONAL_PATTERNS = [
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

export function detectAd(msg: any, corpo: string): { veioDeAnuncio: boolean; anuncioId: string | null; anuncioTitulo: string | null } {
  const m = msg?.message?.ephemeralMessage?.message ?? msg?.message?.viewOnceMessage?.message ?? msg?.message ?? msg
  const ctx = msg?.contextInfo ?? m?.contextInfo ?? m?.extendedTextMessage?.contextInfo ?? m?.imageMessage?.contextInfo ?? m?.videoMessage?.contextInfo ?? m?.documentMessage?.contextInfo
  const externalAd = ctx?.externalAdReplyInfo ?? ctx?.externalAdReply
  const referral = m?.referral ?? msg?.referral ?? ctx?.referral

  // 1. Sinal forte: referral com source_type === "ad" (campo oficial da Meta)
  if (referral?.source_type === "ad") {
    return {
      veioDeAnuncio: true,
      anuncioId: referral.source_id ?? null,
      anuncioTitulo: referral.headline ?? referral.body ?? null,
    }
  }

  // 2. Sinal forte: externalAdReplyInfo presente (Click-to-WhatsApp / anúncios com mídia)
  if (externalAd && (externalAd.sourceId || externalAd.sourceUrl || externalAd.title || externalAd.body || externalAd.mediaType)) {
    return {
      veioDeAnuncio: true,
      anuncioId: externalAd.sourceId ?? null,
      anuncioTitulo: externalAd.title ?? externalAd.body ?? null,
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
      anuncioId: referral.source_id ?? null,
      anuncioTitulo: referral.headline ?? referral.body ?? null,
    }
  }

  // 5. Fallback por conteúdo: APENAS template estrito e exato de anúncio do Meta Ads (CTWA)
  // Mensagens conversacionais, perguntas livres, links colados ou papo humano NUNCA são anúncios.
  if (corpo && ehTemplateExatoDeAnuncio(corpo)) {
    return { veioDeAnuncio: true, anuncioId: null, anuncioTitulo: "Anúncio Meta CTWA" }
  }

  return { veioDeAnuncio: false, anuncioId: null, anuncioTitulo: null }
}

// Acha o lead cujo telefone bate com o do contato (para vincular a mensagem ao registro do CRM).
// Prioriza o lead pertencente ao corretor da instância, evitando vincular mensagens cruzadas entre corretores.
async function encontrarLeadPorTelefone(telefone: string, corretorId?: string | null): Promise<string | null> {
  const digits = onlyDigits(telefone)
  if (!digits) return null
  const semDdi = digits.startsWith("55") ? digits.slice(2) : digits
  const ultimos8 = digits.slice(-8)
  const variantes = Array.from(new Set([digits, `55${semDdi}`, semDdi, ultimos8]))
  const { data: candidatos } = await wsupabase
    .from("leads")
    .select("id, telefone, corretor_id, criado_em")
    .or(variantes.map((v) => `telefone.ilike.%${v}%`).join(","))
    .order("criado_em", { ascending: false })
    .limit(30)

  const comp = normalizePhone(telefone)
  const matches = (candidatos ?? []).filter((l) => normalizePhone(l.telefone) === comp)
  if (!matches.length) return null

  if (corretorId) {
    const doCorretor = matches.find((l) => l.corretor_id === corretorId)
    if (doCorretor) return doCorretor.id
  }

  return matches[0].id
}

// Transições por resposta (fluxo automação → IA): quando um lead parado em
// "em_automacao" ou "em_followup" RESPONDE, ele sai da automação sozinho.
// - "NÃO" (recusa curta) em em_automacao → em_followup (nova tentativa depois)
// - qualquer outra resposta (inclusive em em_followup) → atendimento_ia
//   (Patricia assume a conversa). Best-effort: nunca derruba o webhook.
//   Não envia mensagem — só move a etapa + registra + avisa o gestor.
const RESPOSTA_NAO_PATTERNS = [
  "nao", "não", "nao quero", "não quero", "nao tenho interesse", "não tenho interesse",
  "sem interesse", "nao obrigado", "não obrigado", "nao obrigada", "não obrigada",
  "pare", "para", "stop", "sair", "remover", "excluir", "cancela", "cancelar",
  "nao me interessa", "não me interessa", "deixa pra la", "deixa pra lá",
  "agora nao", "agora não", "nao precisa", "não precisa",
]
function pareceRespostaNao(texto: string): boolean {
  const t = (texto || "").toLowerCase().trim()
  if (!t || t.length > 40) return false
  return RESPOSTA_NAO_PATTERNS.some((p) => t === p || t.startsWith(`${p} `) || t.startsWith(`${p}.`) || t.startsWith(`${p}!`))
}
async function transicaoRespostaAutomacao(leadId: string, texto: string): Promise<void> {
  try {
    const { data: lead } = await wsupabase
      .from("leads")
      .select("id,nome,status,corretor_id,observacoes,referencias")
      .eq("id", leadId)
      .maybeSingle()
    if (!lead) return
    const status = String((lead as { status?: unknown }).status ?? "")
    if (status !== "em_automacao" && status !== "em_followup" && status !== "em_atendimento") return
    // em_atendimento: só entra se for RESPOSTA a mensagem de automação enviada
    // (reativação/follow-up) nos últimos 30d — mesma regra da resposta em automação.
    // Sem job enviado, é conversa orgânica do humano: não mexe.
    let recusa = false
    if (status === "em_atendimento") {
      const corte = new Date(Date.now() - 30 * 86400000).toISOString()
      const { data: jobEnviado } = await wsupabase.from("automation_jobs").select("id").eq("lead_id", leadId).in("status", ["sent", "delivered", "read"]).gte("sent_at", corte).limit(1)
      if (!jobEnviado?.length) return
    } else {
      recusa = status === "em_automacao" && pareceRespostaNao(texto)
    }
    const destino = recusa ? "em_followup" : "atendimento_ia"
    const destinoLabel = recusa ? "Em Follow-up" : "Atendimento IA"
    const evento = recusa ? "lead_respondeu_nao_followup" : "lead_respondeu_atendimento_ia"
    // Tags de estágio: NÃO → nao-respondeu-automacao + followup; SIM/resposta →
    // respondeu-automacao (limpa nao-respondeu/followup, mantém automacao).
    const refsBase = (lead as { referencias?: unknown }).referencias
    const novasRefs = recusa
      ? comRef(comRef(refsBase as { ref: string }[], { ref: TAG_NAO_RESPONDEU_AUTOMACAO }), { ref: TAG_FOLLOWUP })
      : comRef(semRef(semRef(refsBase as { ref: string }[], TAG_NAO_RESPONDEU_AUTOMACAO), TAG_FOLLOWUP), { ref: TAG_RESPONDEU_AUTOMACAO })
    const { error: upErr } = await wsupabase
      .from("leads")
      .update({ status: destino, referencias: novasRefs, atualizado_em: new Date().toISOString() })
      .eq("id", (lead as { id: string }).id)
      .eq("status", status)
    if (upErr) return

    // Resposta do lead interrompe os próximos passos de follow-up (D+2, D+3)
    try {
      await wsupabase
        .from("automation_jobs")
        .update({ status: "responded", responded_at: new Date().toISOString() })
        .eq("lead_id", (lead as { id: string }).id)
        .in("status", ["sent", "delivered", "read"])

      await wsupabase
        .from("automation_jobs")
        .update({ status: "cancelled_lead_replied" })
        .eq("lead_id", (lead as { id: string }).id)
        .in("status", ["scheduled", "retrying", "blocked_hour"])
    } catch { /* best-effort */ }
    const nome = String((lead as { nome?: unknown }).nome ?? "Lead")
    const motivo = recusa
      ? `respondeu "NÃO" à reativação — vai para nova tentativa (follow-up)`
      : `respondeu à automação — Patricia assume em "Atendimento IA"`
    try {
      const obs = `${String((lead as { observacoes?: unknown }).observacoes ?? "").trim()}\n[Automação] ${nome} ${motivo}.`.trim().slice(-6000)
      await wsupabase.from("leads").update({ observacoes: obs }).eq("id", (lead as { id: string }).id)
    } catch { /* obs é best-effort */ }
    try {
      await wsupabase.from("automation_logs").insert({
        lead_id: (lead as { id: string }).id,
        event_type: evento,
        event_title: `${nome} respondeu — foi para "${destinoLabel}"`,
        event_description: `Lead em "${status}" respondeu "${texto.slice(0, 120)}" e foi movido para "${destino}".`,
        actor_type: "system",
      })
    } catch { /* log é best-effort */ }
    try {
      const notif: Record<string, unknown> = {
        mensagem: `${nome} respondeu à automação e foi para "${destinoLabel}"`,
        tipo: "pipeline",
        modulo: "vendas",
        para_role: "gestor",
        lead_id: (lead as { id: string }).id,
      }
      const dono = (lead as { corretor_id?: unknown }).corretor_id
      if (typeof dono === "string" && dono) notif.usuario_id = dono
      await wsupabase.from("notificacoes").insert(notif)
    } catch { /* notify é best-effort */ }
  } catch { /* nunca derruba o webhook */ }
}

// Baixa mídia com retry (a Evolution pode levar segundos para sincronizar o
// arquivo após o upsert — a 1ª tentativa imediata costuma falhar).
async function baixarMidiaComRetry(instanceName: string, mensagemId: string | null, tentativas = 3) {
  const { obterAudioBase64 } = await import("@/lib/whatsapp/server")
  for (let i = 0; i < tentativas; i++) {
    const b = await obterAudioBase64(instanceName, mensagemId).catch(() => null)
    if (b) return b
    if (i < tentativas - 1) await new Promise((r) => setTimeout(r, 3000))
  }
  return null
}

async function auditarMidia(evento: "ia_midia_download_falhou" | "ia_audio_transcrito" | "ia_imagem_descrita", titulo: string, descricao: string) {
  try {
    await wsupabase.from("automation_logs").insert({ event_type: evento, event_title: titulo, event_description: descricao, actor_type: "ia" })
  } catch { /* best-effort */ }
}

// Colunas de mídia para o insert (a URL entra depois, quando o arquivo termina de baixar).
function camposMidia(midia: MidiaDetectada | null) {
  if (!midia) return {}
  return { tipo_midia: midia.tipo, mime_type: midia.mimeType, nome_arquivo: midia.nomeArquivo }
}

// Após inserir a mensagem, baixa o arquivo da Evolution e preenche midia_url (best-effort).
// A conversa já mostrou a mensagem; a mídia aparece assim que o upload conclui (via Realtime).
async function preencherMidiaUrl(instanceName: string, mensagemId: string | null, midia: MidiaDetectada | null) {
  if (!midia || !mensagemId) return
  const armazenado = await baixarEArmazenarMidia(instanceName, mensagemId, midia)
  if (!armazenado) return
  await wsupabase
    .from("whatsapp_mensagens")
    .update({ midia_url: armazenado.url, mime_type: armazenado.mimeType ?? midia.mimeType })
    .eq("mensagem_id", mensagemId)
}

// Extrai o telefone real do contato resolvendo identificadores de grupo, transmissão
// e o modo LID (Linked Identity Device) do WhatsApp / Baileys.
export function extrairTelefoneContato(msg: any): { telefone: string; remoteJid: string } {
  const key = msg?.key ?? {}
  const remoteJid: string = key.remoteJid ?? msg?.remoteJid ?? ""
  const remoteJidAlt: string = key.remoteJidAlt ?? msg?.remoteJidAlt ?? ""
  const participantAlt: string = key.participantAlt ?? msg?.participantAlt ?? ""
  const participant: string = key.participant ?? msg?.participant ?? ""
  const sender: string = msg?.sender ?? ""

  // Ignora grupos e transmissões
  if (remoteJid.includes("@g.us") || remoteJid.includes("broadcast")) {
    return { telefone: "", remoteJid }
  }

  // Priorização para descobrir o telefone real (evitando identificador interno LID):
  // 1. Se remoteJidAlt contiver @s.whatsapp.net (padrão Baileys v6+ quando addressingMode === 'lid')
  // 2. Se remoteJid contiver @s.whatsapp.net e NÃO for @lid
  // 3. Se participantAlt contiver @s.whatsapp.net
  // 4. Se sender contiver @s.whatsapp.net
  // 5. Fallback para remoteJidAlt ou participant ou remoteJid
  let jidAlvo = ""
  if (remoteJidAlt && remoteJidAlt.includes("@s.whatsapp.net")) {
    jidAlvo = remoteJidAlt
  } else if (remoteJid && remoteJid.includes("@s.whatsapp.net") && !remoteJid.includes("@lid")) {
    jidAlvo = remoteJid
  } else if (participantAlt && participantAlt.includes("@s.whatsapp.net")) {
    jidAlvo = participantAlt
  } else if (sender && sender.includes("@s.whatsapp.net")) {
    jidAlvo = sender
  } else if (remoteJidAlt && !remoteJidAlt.includes("@lid")) {
    jidAlvo = remoteJidAlt
  } else {
    jidAlvo = remoteJid
  }

  const digits = onlyDigits(jidAlvo.split("@")[0])
  return { telefone: digits, remoteJid }
}

async function handleMessageUpsert(payload: any) {
  const instanceName = getInstanceName(payload)
  if (!instanceName) return
  const msg = Array.isArray(payload?.data) ? payload.data[0] : payload?.data
  if (!msg) return

  const { telefone, remoteJid } = extrairTelefoneContato(msg)
  if (!telefone) return

  // Descobre o corretor dono da instância logo no início (busca case-insensitive e sem espaços)
  const { data: inst } = await wsupabase
    .from("whatsapp_instancias")
    .select("corretor_id, instance_name")
    .ilike("instance_name", instanceName.trim())
    .maybeSingle()
  const corretorId = inst?.corretor_id ?? null

  // Números internos bloqueados: NÃO descarta mais — registra para o Inbox refletir
  // o Evolution de verdade, mas sem vincular lead, sem criar lead e sem acionar IA
  // (a menos que seja número de teste de IA ativa, que segue o fluxo completo).
  // Sem esse registro, contatos bloqueados "não existiam" no CRM.
  const bloqueado = isBlocked(telefone) && !(await isNumeroTesteIA(telefone))
  const mensagemId: string | null = msg?.key?.id ?? null
  // Idempotência: Evolution reentrega o mesmo evento em retry/timeout. Sem esse
  // guarda, a mesma mensagem geraria 2 linhas + 2 respostas da IA.
  if (mensagemId) {
    const { data: jaProcessada } = await wsupabase.from("whatsapp_mensagens").select("id").eq("mensagem_id", mensagemId).maybeSingle()
    if (jaProcessada) return
  }
  const midia = detectarMidia(msg?.message)
  // Transcrição/descrição de mídia só roda quando alguém vai consumir (agente de IA
  // ativo na instância ou número de teste). Instâncias sem agente (ex.: corretores)
  // apenas registram a mídia, sem gastar cota de IA.
  const deveProcessarMidiaIA =
    !!midia &&
    msg?.key?.fromMe !== true &&
    ((await agenteParaInstancia(instanceName)) !== null || (await isNumeroTesteIA(telefone)))
  // Corpo: texto puro, ou a legenda da mídia (imagem/vídeo/documento podem ter legenda).
  const mInner = msg?.message?.ephemeralMessage?.message ?? msg?.message?.viewOnceMessage?.message ?? msg?.message ?? {}
  let corpo =
    mInner?.conversation ??
    mInner?.extendedTextMessage?.text ??
    mInner?.imageMessage?.caption ??
    mInner?.videoMessage?.caption ??
    mInner?.documentMessage?.caption ??
    mInner?.buttonsResponseMessage?.selectedDisplayText ??
    mInner?.templateButtonReplyMessage?.selectedDisplayText ??
    mInner?.listResponseMessage?.title ??
    (midia ? (midia.legenda ?? "") : "")
  if (!corpo && midia) corpo = "[mídia]"

  // ÁUDIO: transcreve (Claude do agente primeiro, Gemini como fallback) e segue o
  // fluxo NORMAL (vínculo, regras, IA, escalação, auditoria).
  // Pula bloqueados (sem lead/teste não há quem consuma a transcrição).
  if (midia?.tipo === "audio" && !corpo.trim() && mensagemId && deveProcessarMidiaIA) {
    const b64 = await baixarMidiaComRetry(instanceName, mensagemId)
    if (!b64) {
      await auditarMidia("ia_midia_download_falhou", "Áudio não baixado", `Áudio de ${telefone} (${instanceName}) após 3 tentativas — registrado sem transcrição.`)
    } else {
      try {
        const { transcreverAudioSmart } = await import("@/lib/ai/midia")
        const t = await transcreverAudioSmart(instanceName, b64.base64, b64.mimeType ?? midia.mimeType)
        if (t.texto.trim()) {
          corpo = t.texto.trim()
          await auditarMidia("ia_audio_transcrito", "Áudio transcrito", `Áudio de ${telefone} (${instanceName}) via ${t.provedor}/${t.modelo} (${t.texto.length} chars).`)
        }
      } catch (e: unknown) {
        try {
          await wsupabase.from("automation_logs").insert({
            event_type: "ia_audio_nao_transcrito",
            event_title: "Áudio não transcrito",
            event_description: `Áudio de ${telefone} (${instanceName}) registrado sem transcrição: ${e instanceof Error ? e.message : String(e)}.`,
            actor_type: "ia",
          })
        } catch { /* log é best-effort */ }
      }
    }
  }

  // IMAGEM sem legenda: descreve via IA (Claude vision primeiro) para a IA e o
  // Inbox entenderem o conteúdo. Com legenda, mantém a legenda (sem custo extra).
  // Pula bloqueados pelo mesmo motivo do áudio acima.
  if (midia?.tipo === "image" && !corpo.trim() && mensagemId && deveProcessarMidiaIA) {
    const b64 = await baixarMidiaComRetry(instanceName, mensagemId)
    if (!b64) {
      await auditarMidia("ia_midia_download_falhou", "Imagem não baixada", `Imagem de ${telefone} (${instanceName}) após 3 tentativas — registrada sem descrição.`)
    } else {
      try {
        const { descreverImagemSmart } = await import("@/lib/ai/midia")
        const d = await descreverImagemSmart(instanceName, b64.base64, b64.mimeType ?? midia.mimeType)
        if (d.texto.trim()) {
          corpo = `📷 ${d.texto.trim()}`
          await auditarMidia("ia_imagem_descrita", "Imagem descrita", `Imagem de ${telefone} (${instanceName}) via ${d.provedor}/${d.modelo}.`)
        }
      } catch (e: unknown) {
        try {
          await wsupabase.from("automation_logs").insert({
            event_type: "ia_imagem_nao_descrita",
            event_title: "Imagem não descrita",
            event_description: `Imagem de ${telefone} (${instanceName}) registrada sem descrição: ${e instanceof Error ? e.message : String(e)}.`,
            actor_type: "ia",
          })
        } catch { /* log é best-effort */ }
      }
    }
  }

  // Bloqueado (e não é teste): só registra para fidelidade com o Evolution.
  // Não vincula lead, não detecta anúncio, não cria lead, não aciona IA.
  if (bloqueado && msg?.key?.fromMe !== true) {
    await wsupabase.from("whatsapp_mensagens").insert({
      instance_name: instanceName,
      telefone,
      nome_contato: msg?.pushName || telefone,
      corpo,
      lead_id: null,
      veio_de_anuncio: false,
      mensagem_id: mensagemId,
      ...camposMidia(midia),
    })
    await preencherMidiaUrl(instanceName, mensagemId, midia)
    return
  }

  // Mensagem enviada pelo corretor (pelo CRM ou pelo próprio celular): só registra para
  // aparecer no chat do gestor, ligada ao lead quando o telefone bate. Não passa pela
  // detecção de anúncio nem cria lead — essa lógica é só para mensagens recebidas.
  if (msg?.key?.fromMe === true) {
    // Eco de uma resposta já registrada pela IA (key_id correlaciona): não duplica.
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
    // Atendimento manual: pausa a conversa IA deste contato (ai_responding=false) e
    // move o lead para em_atendimento — o corretor assumiu o papo. (Ecos da própria IA
    // são ignorados dentro de pausarIaMensagemManual via textoOutbound.)
    // Aguardado (não fire-and-forget): se a resposta voltar antes, a Vercel pode
    // congelar o trabalho em background e a pausa nunca acontece.
    await pausarIaMensagemManual({ telefone, instanceName, textoOutbound: corpo }).catch(() => {})
    return
  }

  const nome = msg?.pushName || telefone
  // Nomes internos (familiares): registra para fidelidade, mas sem lead/IA (como acima).
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

  // Este contato já é um lead? Se sim e houver automação enviada a ele, ESTA mensagem é a
  // resposta — liga a resposta ao job. Prioriza lead do próprio corretor se houver.
  const leadIdExistente = await encontrarLeadPorTelefone(telefone, corretorId)
  if (leadIdExistente) await registrarRespostaDeLead(leadIdExistente, new Date().toISOString())
  // Transição por resposta (fluxo automação → IA): lead em "em_automacao"/"em_followup"
  // que responde sai da automação sozinho. Só mensagem do lead — nunca eco próprio.
  // Best-effort com catch: jamais derruba o webhook.
  if (leadIdExistente && msg?.key?.fromMe !== true) {
    await transicaoRespostaAutomacao(leadIdExistente, corpo).catch(() => {})
  }

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

  // Se não foi possível mapear o corretor da instância, avisa e não prossegue
  if (!corretorId) {
    console.warn(`[whatsapp-webhook] Instância "${instanceName}" sem corretor_id associado em whatsapp_instancias.`)
    return
  }

  const { veioDeAnuncio, anuncioId, anuncioTitulo } = detectAd(msg, corpo)
  const veioDeAnuncioEfetivo = veioDeAnuncio || !!clique

  // Mensagem orgânica: não cria lead nem notifica, mas vincula ao lead existente
  // (se o telefone bater com algum já cadastrado) para aparecer no chat do gestor.
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
    if (!msg?.key?.fromMe) {
      // Aguardado de propósito: fire-and-forget (void) pode ser congelado pela
      // Vercel ao retornar a resposta — a IA "morre" no meio do caminho sem rastro.
      // Com idempotência por mensagem_id acima, retry da Evolution é seguro.
      // mensagemId alimenta o debounce no handler (rajada vira 1 resposta).
      await handlePatriciaInbound({ telefone, texto: corpo, leadId: leadIdExistente || undefined, instanceName, mensagemId: mensagemId || undefined }).catch(() => {})
    }
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

  const digitsTel = onlyDigits(telefone)
  const semDdiTel = digitsTel.startsWith("55") ? digitsTel.slice(2) : digitsTel
  const ultimos8Tel = digitsTel.slice(-8)
  const variantesTel = Array.from(new Set([digitsTel, `55${semDdiTel}`, semDdiTel, ultimos8Tel]))
  const { data: candidatos } = await wsupabase
    .from("leads")
    .select("id, telefone, corretor_id, status, observacoes, referencias, referencia_imovel")
    .or(variantesTel.map((v) => `telefone.ilike.%${v}%`).join(","))
    .limit(30)

  const compTel = normalizePhone(telefone)
  const matchesTel = (candidatos ?? []).filter((l) => normalizePhone(l.telefone) === compTel)
  // Prioriza encontrar o lead já vinculado a ESTE corretor da instância
  const existenteDoCorretor = matchesTel.find((l) => l.corretor_id === corretorId)
  const existente = existenteDoCorretor ?? matchesTel[0] ?? null
  const mesmoCorretor = Boolean(existenteDoCorretor)
  let leadId: string | null = existenteDoCorretor ? existenteDoCorretor.id : null

  // Nome do corretor da instância (para as notificações e observações)
  let corretorNome = "corretor"
  if (corretorId) {
    const { data: corretor } = await wsupabase.from("usuarios").select("nome").eq("id", corretorId).maybeSingle()
    if (corretor?.nome) corretorNome = corretor.nome
  }

  // Extração de referência do imóvel a partir do texto (ex.: ref.: 17454, ref: 17176, ref 17455)
  const referenciaExtraida = extrairReferenciaDoTexto(corpo)

  // Monta as tags (referencias) com a tag obrigatória "Tráfego Pago"
  const tagsLead: { ref: string; principal?: boolean }[] = []
  if (referenciaExtraida) {
    tagsLead.push({ ref: referenciaExtraida, principal: true })
    tagsLead.push({ ref: "Tráfego Pago", principal: false })
  } else {
    tagsLead.push({ ref: "Tráfego Pago", principal: true })
  }

  // Lead já existente DO MESMO CORRETOR: Reativa o lead se inativo, move para "novo", temperatura "morno",
  // carimba a tag "Tráfego Pago", enriquece as observações com o anúncio e notifica o corretor!
  if (mesmoCorretor && existenteDoCorretor) {
    const refsAtuais = Array.isArray(existenteDoCorretor.referencias) ? existenteDoCorretor.referencias : []
    const refsAtualizadas = comRef(
      referenciaExtraida ? comRef(refsAtuais, { ref: referenciaExtraida, principal: true }) : refsAtuais,
      { ref: "Tráfego Pago" }
    )

    const agoraBr = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    const reengajamentoMsg = `\n\n[${agoraBr}] Lead reengajado através do anúncio vinculado ao Tráfego Pago no WhatsApp de ${corretorNome}.${referenciaExtraida ? ` Imóvel ref. ${referenciaExtraida}.` : ""}${nomeCampanha ? ` Campanha: ${nomeCampanha}.` : ""}${clique?.utm_campaign ? ` UTM: ${clique.utm_campaign}.` : ""}`
    const obsAtualizada = `${existenteDoCorretor.observacoes || ""}${reengajamentoMsg}`.trim()

    // Status: se estava perdido, frio, em_followup, em_automacao ou arquivado, reativa para "novo"
    const statusReativar = ["perdido", "frio", "em_followup", "em_automacao", "arquivado"].includes(existenteDoCorretor.status)
      ? "novo"
      : existenteDoCorretor.status

    await wsupabase.from("leads").update({
      status: statusReativar,
      temperatura: "morno",
      origem: "Tráfego Pago",
      referencia_imovel: referenciaExtraida || existenteDoCorretor.referencia_imovel || "",
      referencias: refsAtualizadas,
      observacoes: obsAtualizada,
      meta_campaign_id: metaCampaignId || undefined,
      meta_adset_id: metaAdsetId || undefined,
      meta_ad_id: metaAdId || undefined,
      utm_campaign: clique?.utm_campaign ?? undefined,
      utm_adset: clique?.utm_adset ?? undefined,
      utm_ad: clique?.utm_ad ?? undefined,
      fbc: clique?.fbc ?? undefined,
      fbp: clique?.fbp ?? undefined,
      client_ip: clique?.ip ?? undefined,
      client_ua: clique?.user_agent ?? undefined,
      atualizado_em: new Date().toISOString(),
    }).eq("id", existenteDoCorretor.id)

    // Notifica o corretor e o gestor sobre o reengajamento do lead
    await wsupabase.from("notificacoes").insert({
      mensagem: `Lead reengajado via Tráfego Pago (WhatsApp): ${nome} escreveu para ${corretorNome}${referenciaExtraida ? ` (Ref. ${referenciaExtraida})` : ""}`,
      tipo: "lead_reengajado",
      modulo: "vendas",
      usuario_id: corretorId,
      para_role: "gestor",
      lead_id: existenteDoCorretor.id,
    })

    // Dispara CAPI para registrar a nova conversão de lead (timeout de 2s para nunca travar o webhook)
    try {
      await Promise.race([
        enviarLeadCapi({
          lead_id: existenteDoCorretor.id,
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
        }),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ])
    } catch {}
  }

  if (!mesmoCorretor) {
    // Cria lead para o corretor que recebeu o clique — mesmo que o telefone já exista para outro corretor.
    // Assim o lead do tráfego nunca fica "invisível" para quem recebeu a mensagem.
    const partesObs: string[] = [
      `Lead criado automaticamente através do anúncio vinculado ao Tráfego Pago no WhatsApp de ${corretorNome}.`,
    ]
    if (referenciaExtraida) partesObs.push(`Imóvel de interesse: ref. ${referenciaExtraida}`)
    if (nomeAnuncio || anuncioTitulo) partesObs.push(`Anúncio: ${nomeAnuncio || anuncioTitulo}`)
    if (nomeCampanha) partesObs.push(`Campanha: ${nomeCampanha}`)
    if (nomeConjunto) partesObs.push(`Conjunto: ${nomeConjunto}`)
    if (clique?.utm_campaign) partesObs.push(`UTM campanha: ${clique.utm_campaign}`)
    if (clique?.utm_adset) partesObs.push(`UTM conjunto: ${clique.utm_adset}`)
    const obs = partesObs.join("\n")

    const baseLead = {
      nome,
      telefone,
      email: "",
      referencia_imovel: referenciaExtraida || "",
      referencias: tagsLead,
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

    let { data: novo, error: errInsert } = await wsupabase
      .from("leads")
      .insert({ ...baseLead, ...rastreioLead })
      .select("id")
      .maybeSingle()

    if (errInsert) {
      console.error("[whatsapp-webhook] Erro ao inserir lead com rastreio:", errInsert)
      const resFallback = await wsupabase
        .from("leads")
        .insert(baseLead)
        .select("id")
        .maybeSingle()
      novo = resFallback.data
      if (resFallback.error) {
        console.error("[whatsapp-webhook] Erro ao inserir lead fallback:", resFallback.error)
        const resMin = await wsupabase
          .from("leads")
          .insert({
            nome,
            telefone,
            email: "",
            referencia_imovel: referenciaExtraida || "",
            referencias: tagsLead,
            temperatura: "morno",
            origem: "Tráfego Pago",
            observacoes: obs,
            status: "novo",
            corretor_id: corretorId,
          })
          .select("id")
          .maybeSingle()
        novo = resMin.data
      }
    }

    leadId = novo?.id ?? null

    if (leadId) {
      await wsupabase.from("notificacoes").insert({
        mensagem: `Novo lead via Tráfego Pago (WhatsApp): ${nome} (via ${corretorNome})${referenciaExtraida ? ` - Ref. ${referenciaExtraida}` : ""}`,
        tipo: "lead_novo",
        modulo: "vendas",
        usuario_id: corretorId,
        para_role: "gestor",
        lead_id: leadId,
      })

      // Envia o evento Lead (CAPI) com os identificadores capturados na ponte de rastreio (timeout 2s).
      try {
        await Promise.race([
          enviarLeadCapi({
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
          }),
          new Promise((resolve) => setTimeout(resolve, 2000)),
        ])
      } catch {}

      // Telefone já cadastrado para outro corretor: avisa o gestor, mas o lead do clique é de quem recebeu
      if (existente && existente.corretor_id && existente.corretor_id !== corretorId) {
        const { data: dono } = await wsupabase.from("usuarios").select("nome").eq("id", existente.corretor_id).maybeSingle()
        await wsupabase.from("notificacoes").insert({
          mensagem: `Lead compartilhado: ${telefone} clicou em anúncio de Tráfego Pago no WhatsApp de ${corretorNome}, mas já possui lead com ${dono?.nome ?? "outro corretor"} (status: ${existente.status}). O novo lead foi criado para ${corretorNome}.`,
          tipo: "possivel_duplicado",
          modulo: "vendas",
          usuario_id: corretorId,
          para_role: "gestor",
          lead_id: leadId,
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
    mensagem_id: mensagemId,
    ...camposMidia(midia),
  })
  await preencherMidiaUrl(instanceName, mensagemId, midia)

  // IA: dispara resposta automática (Patrícia ou Guilherme - teste). Aguardado pelo
  // mesmo motivo acima (nada de void): sem await, a resposta pode morrer sem rastro.
  // Sem texto (só clique): saudação proativa em vez de silêncio.
  if (!msg?.key?.fromMe) {
    if (!corpo.trim()) {
      await saudarLeadCTWA({ telefone, leadId: leadId || leadIdExistente || undefined, instanceName }).catch(() => {})
    } else {
      await handlePatriciaInbound({ telefone, texto: corpo, leadId: leadId || leadIdExistente || undefined, instanceName, mensagemId: mensagemId || undefined }).catch(() => {})
    }
  }
}

// Recibo de entrega/leitura (evento messages.update da Evolution). A Evolution reporta o
// status como número (Baileys: 3=entregue, 4=lido, 5=reproduzido) ou string equivalente.
function mapStatusEntrega(s: unknown): "delivered" | "read" | null {
  if (s === 3 || s === "3" || s === "DELIVERY_ACK") return "delivered"
  if (s === 4 || s === "4" || s === "READ" || s === 5 || s === "5" || s === "PLAYED") return "read"
  return null
}

async function handleMessageStatusUpdate(payload: any) {
  const itens = Array.isArray(payload?.data) ? payload.data : [payload?.data]
  for (const item of itens) {
    if (!item) continue
    const providerMessageId: string | null = item?.key?.id ?? item?.keyId ?? null
    if (!providerMessageId) continue
    const tipo = mapStatusEntrega(item?.update?.status ?? item?.status)
    if (!tipo) continue
    await registrarStatusEntrega(providerMessageId, tipo)
  }
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

    const event: string = (payload.event ?? payload.type ?? "").toLowerCase()
    if (event.includes("connection")) await handleConnectionUpdate(payload)
    else if (event.includes("messages") && event.includes("update")) await handleMessageStatusUpdate(payload)
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
