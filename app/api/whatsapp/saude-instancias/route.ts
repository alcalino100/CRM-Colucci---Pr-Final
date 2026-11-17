// Cron de saúde das instâncias WhatsApp: avisa quando uma linha está presa em "conectando"
// ou aparece "conectada" mas parou de receber mensagens (leads de anúncio se perdem nesse caso).
// Com ?simulacao=1 apenas lista os problemas, sem enviar nada.
import { NextResponse } from "next/server"
import { verificarSaudeInstancias } from "@/lib/whatsapp/saude-instancias-runner"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

async function tratar(req: Request) {
  // O Vercel Cron envia "Authorization: Bearer <CRON_SECRET>" quando a variável existe no projeto.
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get("authorization")
    const qs = new URL(req.url).searchParams.get("secret")
    if (auth !== `Bearer ${secret}` && qs !== secret) {
      return NextResponse.json({ erro: "não autorizado" }, { status: 401 })
    }
  }
  const simulacao = new URL(req.url).searchParams.get("simulacao") === "1"
  try {
    const resultado = await verificarSaudeInstancias({ simulacao })
    return NextResponse.json({ ok: true, ...resultado })
  } catch (error) {
    return NextResponse.json({ ok: false, erro: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

export async function GET(req: Request) {
  return tratar(req)
}

export async function POST(req: Request) {
  return tratar(req)
}
