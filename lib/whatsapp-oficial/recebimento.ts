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

async function canalAtivo(phoneNumberId: string): Promise<boolean> {
  const { data } = await canaisDb.from("whatsapp_oficial_canais").select("ativo").eq("phone_number_id", phoneNumberId).maybeSingle()
  return !!data && data.ativo !== false
}

async function armazenarMidia(instanceName: string, wamid: string, mediaId: string, mimeFallback: string | null) {
  const baixado = await baixarMidiaOficial(mediaId)
  if (!baixado) return
  const mime = (baixado.mimeType ?? mimeFallback ?? "application/octet-stream").split(";")[0].trim()
  const caminho = `${instanceName.replace(/[^a-z0-9_-]/gi, "_")}/${wamid.replace(/[^a-z0-9_.-]/gi, "_")}.${EXT[mime] ?? "bin"}`
  const storage = createClient(SUPABASE_URL, SUPABASE_SERVER_KEY, { auth: { persistSession: false } })
  const { error } = await storage.storage.from(BUCKET).upload(caminho, baixado.buffer, { contentType: mime, upsert: true })
  if (error) {
    logger.warn("[whatsapp-oficial] falha ao armazenar mídia", { error: error.message })
    return
  }
  const { data } = storage.storage.from(BUCKET).getPublicUrl(caminho)
  await wsupabase.from("whatsapp_mensagens").update({ midia_url: data.publicUrl, mime_type: mime }).eq("mensagem_id", wamid)
}

/** Grava uma mensagem recebida. Idempotente pelo wamid (a Meta reentrega o mesmo evento em falhas). */
export async function registrarMensagemRecebida(ev: EventoMensagem): Promise<void> {
  if (!(await canalAtivo(ev.phoneNumberId))) {
    logger.warn("[whatsapp-oficial] mensagem de número não cadastrado/ativo ignorada", { phoneNumberId: ev.phoneNumberId })
    return
  }
  const instanceName = instanceDoCanal(ev.phoneNumberId)
  const { data: jaExiste } = await wsupabase.from("whatsapp_mensagens").select("id").eq("mensagem_id", ev.wamid).maybeSingle()
  if (jaExiste) return
  const { error } = await wsupabase.from("whatsapp_mensagens").insert({
    instance_name: instanceName,
    canal: "oficial",
    telefone: ev.telefone,
    nome_contato: ev.nome,
    corpo: ev.corpo || (ev.midia ? "[mídia]" : ""),
    lead_id: await encontrarLeadPorTelefone(ev.telefone, null),
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
  if (ev.midia) await armazenarMidia(instanceName, ev.wamid, ev.midia.mediaId, ev.midia.mimeType)
}

/** Atualiza o status de entrega (enviada → entregue → lida | falhou) da mensagem enviada. */
export async function registrarStatusOficial(ev: EventoStatus): Promise<void> {
  await wsupabase.from("whatsapp_mensagens").update({ status_entrega: ev.status, erro_entrega: ev.erro }).eq("mensagem_id", ev.wamid)
  if (ev.status === "delivered" || ev.status === "read") await registrarStatusEntrega(ev.wamid, ev.status).catch(() => {})
}

export { marcarComoLida }
