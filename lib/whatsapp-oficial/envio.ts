import { wsupabase } from "@/lib/whatsapp/server"
import { encontrarLeadPorTelefone } from "@/lib/whatsapp-webhook/lead-attribution"
import { logger } from "@/lib/logger"

/** Grava a mensagem enviada pelo Inbox no canal oficial (o wamid permite casar com os status de entrega). */
export async function registrarEnvioOficial(p: { instanceName: string; telefone: string; texto: string; wamid: string }): Promise<void> {
  try {
    const { data: jaExiste } = await wsupabase.from("whatsapp_mensagens").select("id").eq("mensagem_id", p.wamid).maybeSingle()
    if (jaExiste) return
    const { error } = await wsupabase.from("whatsapp_mensagens").insert({
      instance_name: p.instanceName,
      canal: "oficial",
      telefone: p.telefone,
      nome_contato: null,
      corpo: p.texto,
      lead_id: await encontrarLeadPorTelefone(p.telefone, null),
      de_mim: true,
      mensagem_id: p.wamid,
      status_entrega: "sent",
    })
    if (error) logger.warn("[whatsapp-oficial] falha ao gravar mensagem enviada", { error: error.message })
  } catch (err) {
    logger.warn("[whatsapp-oficial] erro ao registrar envio", { error: err instanceof Error ? err.message : String(err) })
  }
}
