// Avisa no WhatsApp do gestor (grupo ou direto) sobre uma venda fechada.
// POST best-effort: nunca derruba o fluxo de fechamento do CRM.
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
  const { nome, valor, corretorNome, refFechamento } = body ?? {}
  if (!nome) return NextResponse.json({ ok: false, erro: "nome é obrigatório" })

  const texto = [
    "🎉 VENDA FECHADA! 🎉",
    "",
    `👤 Cliente: ${nome}`,
    `💰 Valor: ${brl(valor)}`,
    `🧑‍💼 Corretor: ${corretorNome ?? "—"}`,
    `🏷️ Ref: ${refFechamento ?? "—"}`,
  ].join("\n")

  const res = await notifyGestorWhatsApp(texto, "todos")
  return NextResponse.json({ ok: res.ok, erro: res.erro ?? null })
}
