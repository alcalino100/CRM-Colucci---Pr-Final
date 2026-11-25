import { NextResponse } from "next/server"
import { logger } from "@/lib/logger"
import { assinaturaValida } from "@/lib/whatsapp-oficial/assinatura"
import { segredoApp, tokenVerificacao } from "@/lib/whatsapp-oficial/config"
import { parsearWebhook } from "@/lib/whatsapp-oficial/parse"
import { registrarMensagemRecebida, registrarStatusOficial } from "@/lib/whatsapp-oficial/recebimento"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

// Verificação do webhook (a Meta chama uma vez ao cadastrar a URL): hub.verify_token precisa bater com o configurado.
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams
  const esperado = tokenVerificacao()
  if (p.get("hub.mode") === "subscribe" && esperado && p.get("hub.verify_token") === esperado) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 })
  }
  return NextResponse.json({ erro: "verificação recusada" }, { status: 403 })
}

// Eventos: protegido pela assinatura x-hub-signature-256 (HMAC com o App Secret). Sem assinatura válida, nada é processado.
export async function POST(request: Request) {
  const bruto = await request.text()
  if (!assinaturaValida(bruto, request.headers.get("x-hub-signature-256"), segredoApp())) {
    logger.warn("[whatsapp-oficial] webhook recusado: assinatura ausente ou inválida")
    return NextResponse.json({ erro: "assinatura inválida" }, { status: 401 })
  }
  let payload: unknown
  try { payload = JSON.parse(bruto) } catch { return NextResponse.json({ ok: true }) }

  for (const ev of parsearWebhook(payload)) {
    // Um evento com problema não pode derrubar os demais; a Meta reentrega se respondermos erro, então sempre 200.
    try {
      if (ev.tipo === "mensagem") await registrarMensagemRecebida(ev)
      else await registrarStatusOficial(ev)
    } catch (e) {
      logger.error("[whatsapp-oficial] falha ao processar evento", { tipo: ev.tipo, wamid: ev.wamid, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return NextResponse.json({ ok: true })
}
