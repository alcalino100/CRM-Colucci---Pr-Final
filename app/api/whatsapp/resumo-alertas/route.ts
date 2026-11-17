// Cron do resumo de alertas de WhatsApp (08h, 12h e 18h de Brasília): manda ao gestor UMA mensagem
// com as linhas desconectadas / travadas. Com ?simulacao=1 só mostra o texto, sem enviar.
import { NextResponse } from "next/server"
import { enviarResumoAlertasWhatsApp } from "@/lib/whatsapp/saude-instancias-runner"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

async function tratar(req: Request) {
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
    const resultado = await enviarResumoAlertasWhatsApp({ simulacao })
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
