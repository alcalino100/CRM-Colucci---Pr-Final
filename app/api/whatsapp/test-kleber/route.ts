// Diagnóstico: envia UM teste SOMENTE para o Kleber (5518991975661) e retorna a
// resposta crua da Evolution para investigar por que a mensagem não chegou.
// Protegido por CRON_SECRET.
import { NextResponse } from "next/server"
import { evolutionConfig, resolveNotifyTarget } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const KLEBER = "5518991975661"

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  const qs = new URL(req.url).searchParams.get("secret")
  const autorizado = !!secret && (auth === `Bearer ${secret}` || qs === secret)
  if (!autorizado) return NextResponse.json({ erro: "não autorizado" }, { status: 401 })

  const alvo = await resolveNotifyTarget()
  if (!alvo) return NextResponse.json({ ok: false, erro: "Instância do gestor não encontrada." })

  const cfg = evolutionConfig()
  if (!cfg.ok) return NextResponse.json({ ok: false, erro: "Evolution não configurada." })

  const texto = "🧪 TESTE Kleber (Colucci): você deve receber apenas esta mensagem. Enviada em " +
    new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })

  const res = await fetch(`${cfg.url}/message/sendText/${encodeURIComponent(alvo.instanceName)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: cfg.key },
    body: JSON.stringify({ number: KLEBER, text: texto }),
  })

  const raw = await res.text().catch(() => "")
  return NextResponse.json({
    ok: res.ok,
    httpStatus: res.status,
    instance: alvo.instanceName,
    numero: KLEBER,
    raw: raw.slice(0, 500),
  })
}
