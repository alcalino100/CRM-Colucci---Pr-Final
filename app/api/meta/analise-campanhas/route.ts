import { NextResponse } from "next/server"
import { exigirGestor, negarAcesso } from "@/lib/auth/sessao"
import { gerarAnaliseIA } from "@/lib/meta/analise-ia"
import { montarAnaliseCampanhas } from "@/lib/meta/relatorios"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 90

const DATA = /^\d{4}-\d{2}-\d{2}$/

// Análise de campanhas: números reconciliados Meta × CRM, comparação com o período anterior, ação sugerida por campanha e (opcional) texto da IA.
export async function POST(request: Request) {
  const auth = exigirGestor(request)
  if (!auth.ok) return negarAcesso(auth)
  let b: { since?: string; until?: string; ia?: boolean }
  try { b = await request.json() } catch { return NextResponse.json({ ok: false, erro: "Dados inválidos." }, { status: 400 }) }
  if (!b.since || !b.until || !DATA.test(b.since) || !DATA.test(b.until) || b.since > b.until) return NextResponse.json({ ok: false, erro: "Informe um período válido (since/until em AAAA-MM-DD)." }, { status: 400 })
  try {
    const dados = await montarAnaliseCampanhas(b.since, b.until)
    if (!b.ia) return NextResponse.json({ ok: true, ...dados })
    const ia = await gerarAnaliseIA("campanhas", dados)
    return NextResponse.json({ ok: true, ...dados, analiseIA: ia.ok ? ia.texto : null, erroIA: ia.ok ? null : ia.erro })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : "Falha na análise." }, { status: 502 })
  }
}
