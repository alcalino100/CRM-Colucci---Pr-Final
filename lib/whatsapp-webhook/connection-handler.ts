import { mapConnectionState, notifyDisconnection, onlyDigits, wsupabase } from "@/lib/whatsapp/server"
import { registrarStatusEntrega } from "@/lib/automation-services"

export function getInstanceName(payload: Record<string, unknown> | null | undefined): string | null {
  const pData = payload?.data as Record<string, unknown> | undefined
  const inst = payload?.instance ?? payload?.instanceName ?? pData?.instance
  return typeof inst === "string" ? inst : null
}

export async function handleConnectionUpdate(payload: Record<string, unknown> | null | undefined): Promise<void> {
  const instanceName = getInstanceName(payload)
  if (!instanceName) return
  const pData = payload?.data as Record<string, unknown> | undefined
  const state = (pData?.state ?? pData?.connection ?? payload?.state) as string
  const status = mapConnectionState(state)
  const numeroRaw = pData?.wuid ?? pData?.number ?? payload?.wuid ?? null
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

// Recibo de entrega/leitura (evento messages.update da Evolution). A Evolution reporta o
// status como número (Baileys: 3=entregue, 4=lido, 5=reproduzido) ou string equivalente.
export function mapStatusEntrega(s: unknown): "delivered" | "read" | null {
  if (s === 3 || s === "3" || s === "DELIVERY_ACK") return "delivered"
  if (s === 4 || s === "4" || s === "READ" || s === 5 || s === "5" || s === "PLAYED") return "read"
  return null
}

export async function handleMessageStatusUpdate(payload: Record<string, unknown> | null | undefined): Promise<void> {
  const itens = Array.isArray(payload?.data) ? payload.data : [payload?.data]
  for (const item of itens) {
    if (!item) continue
    const key = (item as Record<string, unknown>)?.key as Record<string, unknown> | undefined
    const upd = (item as Record<string, unknown>)?.update as Record<string, unknown> | undefined
    const providerMessageId: string | null = (typeof key?.id === "string" ? key.id : null) ??
      (typeof (item as Record<string, unknown>)?.keyId === "string" ? ((item as Record<string, unknown>).keyId as string) : null)
    if (!providerMessageId) continue
    const tipo = mapStatusEntrega(upd?.status ?? (item as Record<string, unknown>)?.status)
    if (!tipo) continue
    await registrarStatusEntrega(providerMessageId, tipo)
  }
}
