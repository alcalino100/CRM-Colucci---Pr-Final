// Avisa no WhatsApp (gestor + Pati) quando um lead entra em negociação com valor.
// POST best-effort: nunca derruba o fluxo do CRM.
import { NextResponse } from "next/server"
import { notifyGestorWhatsApp } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const brl = (v: unknown) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return "—"
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
}

export async function POST(request: Request) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false })
  }
  const { nome, valor, corretorNome, refProposta } = body ?? {}
  if (!nome) return NextResponse.json({ ok: false, erro: "nome é obrigatório" })

  const linhas = [
    "🤝 LEAD EM NEGOCIAÇÃO 🤝",
    "",
    `👤 Cliente: ${nome}`,
    `💰 Valor: ${brl(valor)}`,
    `🧑‍💼 Corretor: ${corretorNome ?? "—"}`,
  ]
  if (refProposta?.trim()) linhas.push(`🏷️ Ref: ${refProposta.trim()}`)

  const res = await notifyGestorWhatsApp(linhas.join("\n"), "todos")
  return NextResponse.json({ ok: res.ok, erro: res.erro ?? null })
}
