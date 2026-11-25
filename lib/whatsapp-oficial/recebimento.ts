import { createClient } from "@supabase/supabase-js"
import { wsupabase } from "@/lib/whatsapp/server"
import { SUPABASE_URL } from "@/lib/supabase/config"
import { SUPABASE_SERVER_KEY } from "@/lib/supabase/server-key"
import { encontrarLeadPorTelefone } from "@/lib/whatsapp-webhook/lead-attribution"
import { registrarStatusEntrega } from "@/lib/automation-services"
import { logger } from "@/lib/logger"
import { baixarMidiaOficial, marcarComoLida } from "./client"
import { instanceDoCanal } from "./config"
import type { EventoMensagem, EventoStatus } from "./parse"

// Tabela nova (fora dos tipos gerados do Supabase até regenerá-los).
const canaisDb = wsupabase as unknown as { from: (t: string) => any }

const BUCKET = "whatsapp-midia"
const EXT: Record<string, string> = { "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/amr": "amr", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "application/pdf": "pdf" }

type CanalInfo = { ativo: boolean; modo: "manual" | "assistente" | "ia" }

async function canalInfo(phoneNumberId: string): Promise<CanalInfo | null> {
  // "modo" vem da migration da fase 2; sem ela, cai para só "ativo" (modo manual).
  let { data, error } = await canaisDb.from("whatsapp_oficial_canais").select("ativo, modo").eq("phone_number_id", phoneNumberId).maybeSingle()
  if (error) ({ data } = await canaisDb.from("whatsapp_oficial_canais").select("ativo").eq("phone_number_id", phoneNumberId).maybeSingle())
  if (!data) return null
  return { ativo: data.ativo !== false, modo: data.modo === "assistente" || data.modo === "ia" ? data.modo : "manual" }
}

/** Registro de diagnóstico: o que a Meta mandou (ou que foi recusado). Best-effort — nunca derruba o fluxo. */
export async function registrarEvento(e: { tipo: "mensagem" | "status" | "verificacao" | "recusado" | "erro"; phoneNumberId?: string; wamid?: string; resumo?: string; assinaturaOk?: boolean }): Promise<void> {
  try {
    await canaisDb.from("whatsapp_oficial_eventos").insert({ tipo: e.tipo, phone_number_id: e.phoneNumberId ?? null, wamid: e.wamid ?? null, resumo: (e.resumo ?? "").slice(0, 300), assinatura_ok: e.assinaturaOk ?? null })
  } catch { /* tabela pode não existir ainda */ }
}

/** Mensagens simuladas pelo painel de testes: gravadas normalmente, mas NUNCA acionam IA/assistente. */
export const ehEventoDeTeste = (wamid: string) => wamid.startsWith("wamid.TESTE.")

async function armazenarMidia(instanceName: string, wamid: string, mediaId: string, mimeFallback: string | null): Promise<{ buffer: Buffer; mime: string } | null> {
  const baixado = await baixarMidiaOficial(mediaId)
  if (!baixado) return null
  const mime = (baixado.mimeType ?? mimeFallback ?? "application/octet-stream").split(";")[0].trim()
  const caminho = `${instanceName.replace(/[^a-z0-9_-]/gi, "_")}/${wamid.replace(/[^a-z0-9_.-]/gi, "_")}.${EXT[mime] ?? "bin"}`
  const storage = createClient(SUPABASE_URL, SUPABASE_SERVER_KEY, { auth: { persistSession: false } })
  const { error } = await storage.storage.from(BUCKET).upload(caminho, baixado.buffer, { contentType: mime, upsert: true })
  if (error) {
    logger.warn("[whatsapp-oficial] falha ao armazenar mídia", { error: error.message })
    return { buffer: baixado.buffer, mime }
  }
  const { data } = storage.storage.from(BUCKET).getPublicUrl(caminho)
  await wsupabase.from("whatsapp_mensagens").update({ midia_url: data.publicUrl, mime_type: mime }).eq("mensagem_id", wamid)
  return { buffer: baixado.buffer, mime }
}

/** Aciona o atendimento automático conforme o modo do canal. Cada camada tem as próprias travas (ligado/números de teste/regra de ouro). */
async function acionarAtendimentoAutomatico(canal: CanalInfo, ev: EventoMensagem, instanceName: string, corpo: string, leadId: string | null): Promise<void> {
  if (canal.modo === "manual" || ehEventoDeTeste(ev.wamid) || !corpo.trim()) return
  void marcarComoLida(ev.phoneNumberId, ev.wamid)
  try {
    if (canal.modo === "assistente") {
      const { handleAssistenteInbound } = await import("@/lib/assistente/whatsapp")
      await handleAssistenteInbound({ telefone: ev.telefone, texto: corpo, instanceName, mensagemId: ev.wamid })
    } else {
      const { handlePatriciaInbound } = await import("@/lib/ai/inboxHandler")
      await handlePatriciaInbound({ telefone: ev.telefone, texto: corpo, leadId: leadId ?? undefined, instanceName, mensagemId: ev.wamid })
    }
  } catch (e) {
    logger.error("[whatsapp-oficial] falha no atendimento automático", { modo: canal.modo, error: e instanceof Error ? e.message : String(e) })
  }
}

/** Grava uma mensagem recebida. Idempotente pelo wamid (a Meta reentrega o mesmo evento em falhas). */
export async function registrarMensagemRecebida(ev: EventoMensagem): Promise<void> {
  const canal = await canalInfo(ev.phoneNumberId)
  if (!canal || !canal.ativo) {
    logger.warn("[whatsapp-oficial] mensagem de número não cadastrado/ativo ignorada", { phoneNumberId: ev.phoneNumberId })
    return
  }
  const instanceName = instanceDoCanal(ev.phoneNumberId)
  const { data: jaExiste } = await wsupabase.from("whatsapp_mensagens").select("id").eq("mensagem_id", ev.wamid).maybeSingle()
  if (jaExiste) return
  const leadId = await encontrarLeadPorTelefone(ev.telefone, null)
  const { error } = await wsupabase.from("whatsapp_mensagens").insert({
    instance_name: instanceName,
    canal: "oficial",
    telefone: ev.telefone,
    nome_contato: ev.nome,
    corpo: ev.corpo || (ev.midia ? "[mídia]" : ""),
    lead_id: leadId,
    de_mim: false,
    mensagem_id: ev.wamid,
    criado_em: ev.em,
    veio_de_anuncio: !!ev.anuncio,
    anuncio_titulo: ev.anuncio?.titulo ?? null,
    tipo_midia: ev.midia?.tipo ?? null,
    mime_type: ev.midia?.mimeType ?? null,
    nome_arquivo: ev.midia?.nomeArquivo ?? null,
  })
  if (error) {
    logger.error("[whatsapp-oficial] falha ao gravar mensagem recebida", { error: error.message })
    return
  }
  let corpo = ev.corpo
  if (ev.midia) {
    const arq = await armazenarMidia(instanceName, ev.wamid, ev.midia.mediaId, ev.midia.mimeType)
    // Áudio sem legenda: transcreve (Whisper) só quando alguém automático vai ler o texto.
    if (arq && ev.midia.tipo === "audio" && !corpo.trim() && canal.modo !== "manual" && !ehEventoDeTeste(ev.wamid)) {
      try {
        const { transcreverAudioSmart } = await import("@/lib/ai/midia")
        const t = await transcreverAudioSmart(instanceName, arq.buffer.toString("base64"), arq.mime)
        if (t.texto.trim()) {
          corpo = t.texto.trim()
          await wsupabase.from("whatsapp_mensagens").update({ corpo }).eq("mensagem_id", ev.wamid)
        }
      } catch (e) {
        logger.warn("[whatsapp-oficial] áudio não transcrito", { error: e instanceof Error ? e.message : String(e) })
      }
    }
  }
  await acionarAtendimentoAutomatico(canal, ev, instanceName, corpo, leadId)
}

/** Atualiza o status de entrega (enviada → entregue → lida | falhou) da mensagem enviada. */
export async function registrarStatusOficial(ev: EventoStatus): Promise<void> {
  await wsupabase.from("whatsapp_mensagens").update({ status_entrega: ev.status, erro_entrega: ev.erro }).eq("mensagem_id", ev.wamid)
  if (ev.status === "delivered" || ev.status === "read") await registrarStatusEntrega(ev.wamid, ev.status).catch(() => {})
}

export { marcarComoLida }
