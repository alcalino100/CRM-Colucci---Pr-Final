import { wsupabase } from "@/lib/whatsapp/server"
import { enviarTextoOficial } from "./client"
import { phoneNumberIdDoCanal } from "./config"
import { dentroDaJanela, MSG_JANELA_EXPIRADA } from "./janela"

/**
 * Envio de texto por um canal oficial, para QUALQUER chamador (Inbox, IA, assistente, automações):
 * confere a janela de 24h e devolve o mesmo formato de sendWhatsAppText (keyId = wamid).
 * Quem chama é quem grava a mensagem no Inbox (como já faz com a Evolution).
 */
export async function enviarTextoPorCanalOficial(instanceName: string, telefone: string, texto: string): Promise<{ ok: boolean; erro?: string; keyId?: string }> {
  const { data: ultima } = await wsupabase
    .from("whatsapp_mensagens")
    .select("criado_em")
    .eq("instance_name", instanceName)
    .eq("telefone", telefone)
    .eq("de_mim", false)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!dentroDaJanela(ultima?.criado_em)) return { ok: false, erro: MSG_JANELA_EXPIRADA }
  const r = await enviarTextoOficial(phoneNumberIdDoCanal(instanceName), telefone, texto)
  return r.ok ? { ok: true, keyId: r.wamid } : { ok: false, erro: r.erro }
}
