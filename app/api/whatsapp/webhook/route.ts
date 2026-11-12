import { NextResponse } from "next/server"
import { logger } from "@/lib/logger"
import { handleConnectionUpdate, handleMessageStatusUpdate } from "@/lib/whatsapp-webhook/connection-handler"
import { handleMessageUpsert } from "@/lib/whatsapp-webhook/inbound-handler"

// Re-exporta funções públicas para retrocompatibilidade com testes e módulos do projeto
export {
  ehTemplateExatoDeAnuncio,
  pareceTextoDeAnuncio,
  extrairReferenciaDoTexto,
  detectAd,
} from "@/lib/whatsapp-webhook/ad-detection"
export { extrairTelefoneContato } from "@/lib/whatsapp-webhook/contact-filters"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// Mídia (download/transcrição) + debounce + geração Claude + envio podem passar
// dos 30s padrão — 60s dão folga sem estourar o limite do plano.
export const maxDuration = 60

// Sempre responde 200 para não interromper o fluxo da Evolution
const ok = () => NextResponse.json({ received: true })

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
    if (event.includes("connection")) {
      await handleConnectionUpdate(payload)
    } else if (event.includes("messages") && event.includes("update")) {
      await handleMessageStatusUpdate(payload)
    } else if (event.includes("messages")) {
      // Processa TODAS as mensagens do lote (não só data[0])
      const itens = Array.isArray(payload?.data) ? payload.data : [payload?.data]
      for (const item of itens) {
        if (!item) continue
        await handleMessageUpsert({ ...payload, data: item })
      }
    }

    return ok()
  } catch (error) {
    logger.error("Erro no webhook WhatsApp", { error: error instanceof Error ? error.message : String(error) })
    return ok()
  }
}
