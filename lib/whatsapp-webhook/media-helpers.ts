import { baixarEArmazenarMidia, wsupabase, type MidiaDetectada } from "@/lib/whatsapp/server"

// Colunas de mídia para o insert (a URL entra depois, quando o arquivo termina de baixar).
export function camposMidia(midia: MidiaDetectada | null): Record<string, unknown> {
  if (!midia) return {}
  return { tipo_midia: midia.tipo, mime_type: midia.mimeType, nome_arquivo: midia.nomeArquivo }
}

// Baixa mídia com retry (a Evolution pode levar segundos para sincronizar o
// arquivo após o upsert — a 1ª tentativa imediata costuma falhar).
export async function baixarMidiaComRetry(
  instanceName: string,
  mensagemId: string | null,
  tentativas = 3
): Promise<{ base64: string; mimeType: string | null } | null> {
  const { obterAudioBase64 } = await import("@/lib/whatsapp/server")
  for (let i = 0; i < tentativas; i++) {
    const b = await obterAudioBase64(instanceName, mensagemId).catch(() => null)
    if (b) return b
    if (i < tentativas - 1) await new Promise((r) => setTimeout(r, 3000))
  }
  return null
}

export async function auditarMidia(
  evento: "ia_midia_download_falhou" | "ia_audio_transcrito" | "ia_imagem_descrita",
  titulo: string,
  descricao: string
): Promise<void> {
  try {
    await wsupabase.from("automation_logs").insert({
      event_type: evento,
      event_title: titulo,
      event_description: descricao,
      actor_type: "ia",
    })
  } catch {
    /* best-effort */
  }
}

// Após inserir a mensagem, baixa o arquivo da Evolution e preenche midia_url (best-effort).
// A conversa já mostrou a mensagem; a mídia aparece assim que o upload conclui (via Realtime).
export async function preencherMidiaUrl(
  instanceName: string,
  mensagemId: string | null,
  midia: MidiaDetectada | null
): Promise<void> {
  if (!midia || !mensagemId) return
  const armazenado = await baixarEArmazenarMidia(instanceName, mensagemId, midia)
  if (!armazenado) return
  await wsupabase
    .from("whatsapp_mensagens")
    .update({ midia_url: armazenado.url, mime_type: armazenado.mimeType ?? midia.mimeType })
    .eq("mensagem_id", mensagemId)
}

// Extrai o texto da mensagem e processa transcrição de áudio ou descrição de imagem se necessário
export async function processarCorpoMidia(params: {
  msg: Record<string, unknown>
  midia: MidiaDetectada | null
  instanceName: string
  telefone: string
  mensagemId: string | null
  deveProcessarMidiaIA: boolean
}): Promise<string> {
  const { msg, midia, instanceName, telefone, mensagemId, deveProcessarMidiaIA } = params

  const mObj = msg?.message as Record<string, unknown> | undefined
  const ephem = mObj?.ephemeralMessage as Record<string, unknown> | undefined
  const viewOnce = mObj?.viewOnceMessage as Record<string, unknown> | undefined
  const mInner = (ephem?.message as Record<string, unknown> | undefined) ?? (viewOnce?.message as Record<string, unknown> | undefined) ?? mObj ?? {}

  const extTxt = mInner?.extendedTextMessage as Record<string, unknown> | undefined
  const imgMsg = mInner?.imageMessage as Record<string, unknown> | undefined
  const vidMsg = mInner?.videoMessage as Record<string, unknown> | undefined
  const docMsg = mInner?.documentMessage as Record<string, unknown> | undefined
  const btnResp = mInner?.buttonsResponseMessage as Record<string, unknown> | undefined
  const tmplBtn = mInner?.templateButtonReplyMessage as Record<string, unknown> | undefined
  const listResp = mInner?.listResponseMessage as Record<string, unknown> | undefined

  let corpo: string =
    (typeof mInner?.conversation === "string" ? mInner.conversation : null) ??
    (typeof extTxt?.text === "string" ? extTxt.text : null) ??
    (typeof imgMsg?.caption === "string" ? imgMsg.caption : null) ??
    (typeof vidMsg?.caption === "string" ? vidMsg.caption : null) ??
    (typeof docMsg?.caption === "string" ? docMsg.caption : null) ??
    (typeof btnResp?.selectedDisplayText === "string" ? btnResp.selectedDisplayText : null) ??
    (typeof tmplBtn?.selectedDisplayText === "string" ? tmplBtn.selectedDisplayText : null) ??
    (typeof listResp?.title === "string" ? listResp.title : null) ??
    (midia ? (midia.legenda ?? "") : "")

  if (!corpo && midia) corpo = "[mídia]"

  // ÁUDIO: transcreve (Claude do agente primeiro, Gemini como fallback) e segue o fluxo NORMAL
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
        } catch {
          /* log é best-effort */
        }
      }
    }
  }

  // IMAGEM sem legenda: descreve via IA para o Inbox e IA
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
        } catch {
          /* log é best-effort */
        }
      }
    }
  }

  return corpo
}
