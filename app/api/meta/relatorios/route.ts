import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL } from "@/lib/supabase/config"
import { SUPABASE_SERVER_KEY } from "@/lib/supabase/server-key"
import { exigirGestor, negarAcesso } from "@/lib/auth/sessao"
import { gerarRelatorioMensal, type TipoRelatorio } from "@/lib/meta/relatorios"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

const db = () => createClient(SUPABASE_URL, SUPABASE_SERVER_KEY) as unknown as { from: (t: string) => any }

// Histórico (sem ?id) ou um relatório completo (?id=).
export async function GET(request: Request) {
  const auth = exigirGestor(request)
  if (!auth.ok) return negarAcesso(auth)
  const p = new URL(request.url).searchParams
  const id = p.get("id")
  if (id) {
    const { data, error } = await db().from("meta_relatorios").select("*").eq("id", id).maybeSingle()
    if (error || !data) return NextResponse.json({ ok: false, erro: "Relatório não encontrado." }, { status: 404 })
    return NextResponse.json({ ok: true, relatorio: data })
  }
  const { data, error } = await db().from("meta_relatorios").select("id, tipo, mes, gerado_em, gerado_por").order("mes", { ascending: false }).limit(60)
  if (error) return NextResponse.json({ ok: true, relatorios: [], aviso: "Rode a migration 20261126120000_meta_relatorios.sql no Supabase para guardar o histórico." })
  return NextResponse.json({ ok: true, relatorios: data ?? [] })
}

// Gera (ou regenera) o relatório de um mês.
export async function POST(request: Request) {
  const auth = exigirGestor(request)
  if (!auth.ok) return negarAcesso(auth)
  let b: { tipo?: string; mes?: string }
  try { b = await request.json() } catch { return NextResponse.json({ ok: false, erro: "Dados inválidos." }, { status: 400 }) }
  if ((b.tipo !== "instagram" && b.tipo !== "campanhas") || !/^\d{4}-(0[1-9]|1[0-2])$/.test(b.mes ?? "")) return NextResponse.json({ ok: false, erro: "Informe tipo (instagram|campanhas) e mês (AAAA-MM)." }, { status: 400 })
  try {
    const r = await gerarRelatorioMensal(b.tipo as TipoRelatorio, b.mes!, auth.sessao.id)
    return NextResponse.json({ ok: true, aviso: r.aviso })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : "Falha ao gerar o relatório." }, { status: 502 })
  }
}
