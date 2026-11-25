import { NextResponse } from "next/server"
import { exigirGestor, negarAcesso } from "@/lib/auth/sessao"
import { gerarAnaliseIA } from "@/lib/meta/analise-ia"
import { montarAnaliseInstagram } from "@/lib/meta/relatorios"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 90

const iso = (d: Date) => d.toISOString().slice(0, 10)

// Análise do Instagram pela IA (conteúdo, formatos, horários e recomendações).
export async function POST(request: Request) {
  const auth = exigirGestor(request)
  if (!auth.ok) return negarAcesso(auth)
  let b: { conta?: string; dias?: number } = {}
  try { b = await request.json() } catch { /* usa padrões */ }
  const dias = Math.min(180, Math.max(7, Number(b.dias) || 30))
  try {
    const { lista: _lista, ...dados } = await montarAnaliseInstagram(b.conta ?? null, iso(new Date(Date.now() - (dias - 1) * 864e5)), iso(new Date()))
    const ia = await gerarAnaliseIA("instagram", dados)
    return ia.ok ? NextResponse.json({ ok: true, texto: ia.texto, modelo: ia.modelo }) : NextResponse.json({ ok: false, erro: ia.erro }, { status: 502 })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : "Falha na análise." }, { status: 502 })
  }
}
