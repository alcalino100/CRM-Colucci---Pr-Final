import { wsupabase } from "@/lib/whatsapp/server"
import { pausarIaMensagemManual } from "@/lib/ai/inboxHandler"
import { encontrarLeadPorTelefone } from "./lead-attribution"
import { logger } from "@/lib/logger"

/**
 * Registra no banco uma mensagem enviada pelo Inbox do CRM.
 * A Evolution nem sempre devolve o "eco" (fromMe) de envios feitos pela API, então a gravação não pode depender do webhook.
 * Idempotente: usa o id da mensagem (keyId); se o eco chegar depois, o webhook reconhece o id e não duplica.
 * Também aplica o mesmo "handoff humano" do webhook: resposta de pessoa pausa a IA e silencia o assistente.
 */
export async function registrarEnvioManual(p: { instanceName: string; telefone: string; texto: string; keyId?: string }): Promise<void> {
  const { instanceName, telefone, texto, keyId } = p
  // Sem o id da Evolution não dá para evitar duplicata com o eco; nesse caso quem grava é o webhook.
  if (!keyId) return
  try {
    const { data: jaExiste } = await wsupabase.from("whatsapp_mensagens").select("id").eq("mensagem_id", keyId).maybeSingle()
    if (jaExiste) return
    const { data: insts } = await wsupabase.from("whatsapp_instancias").select("corretor_id").ilike("instance_name", instanceName.trim()).limit(1)
    const corretorId = insts?.[0]?.corretor_id ?? null
    const { error } = await wsupabase.from("whatsapp_mensagens").insert({
      instance_name: instanceName,
      telefone,
      nome_contato: null,
      corpo: texto,
      lead_id: await encontrarLeadPorTelefone(telefone, corretorId),
      de_mim: true,
      mensagem_id: keyId,
    })
    if (error) {
      logger.warn("[inbox] falha ao gravar mensagem enviada", { error: error.message })
      return
    }
    await pausarIaMensagemManual({ telefone, instanceName, textoOutbound: texto }).catch(() => {})
    try {
      await (await import("@/lib/assistente/whatsapp")).handleAssistenteMensagemHumana({ telefone, texto, instanceName })
    } catch (err) {
      logger.warn("[inbox] assistente não registrou resposta humana", { error: err instanceof Error ? err.message : String(err) })
    }
  } catch (err) {
    logger.warn("[inbox] erro ao registrar envio manual", { error: err instanceof Error ? err.message : String(err) })
  }
}
