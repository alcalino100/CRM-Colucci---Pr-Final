// Diagnóstico: envia UM teste SOMENTE para o Kleber (5518991975661) e retorna a
// resposta crua da Evolution. Opcional: ?nome&valor&corretorNome&refProposta
// montam uma mensagem no formato de negociação. Protegido por CRON_SECRET.
import { NextResponse } from "next/server"
import { evolutionConfig, resolveNotifyTarget } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const KLEBER = "5518991975661"

const brl = (v: unknown) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return "—"
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const url = new URL(req.url)
  const auth = req.headers.get("authorization")
  const qs = url.searchParams.get("secret")
  const autorizado = !!secret && (auth === `Bearer ${secret}` || qs === secret)
  if (!autorizado) return NextResponse.json({ erro: "não autorizado" }, { status: 401 })

  const alvo = await resolveNotifyTarget()
  if (!alvo) return NextResponse.json({ ok: false, erro: "Instância do gestor não encontrada." })

  const cfg = evolutionConfig()
  if (!cfg.ok) return NextResponse.json({ ok: false, erro: "Evolution não configurada." })

  const nome = url.searchParams.get("nome") || "Lead Teste Negociação"
  const valor = url.searchParams.get("valor") || ""
  const corretorNome = url.searchParams.get("corretorNome") || "Teste"
  const refProposta = url.searchParams.get("refProposta") || ""

  const linhas = [
    "🤝 LEAD EM NEGOCIAÇÃO 🤝",
    "",
    `👤 Cliente: ${nome}`,
    `💰 Valor: ${brl(valor)}`,
    `🧑‍💼 Corretor: ${corretorNome ?? "—"}`,
  ]
  if (refProposta?.trim()) linhas.push(`🏷️ Ref: ${refProposta.trim()}`)

  const res = await fetch(`${cfg.url}/message/sendText/${encodeURIComponent(alvo.instanceName)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: cfg.key },
    body: JSON.stringify({ number: KLEBER, text: linhas.join("\n") }),
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
