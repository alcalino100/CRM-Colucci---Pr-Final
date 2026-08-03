// Listagem dos eventos enviados à Meta (CAPI) — logs persistentes.
// GET ?usuario_id=... — valida que o solicitante é um gestor ativo.
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const usuarioId = url.searchParams.get("usuario_id")

  if (!usuarioId) return NextResponse.json({ ok: false, erro: "usuario_id é obrigatório" }, { status: 400 })

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
  const { data: usuario, error: ue } = await supabase
    .from("usuarios")
    .select("id,role,status")
    .eq("id", usuarioId)
    .maybeSingle()
  if (ue) return NextResponse.json({ ok: false, erro: ue.message }, { status: 500 })
  if (!usuario || usuario.role !== "gestor" || usuario.status !== "ativo")
    return NextResponse.json({ ok: false, erro: "Acesso restrito a gestores ativos" }, { status: 403 })

  const limite = Math.min(Math.max(Number(url.searchParams.get("limite") ?? 100), 1), 500)
  const { data, error } = await supabase
    .from("meta_event_logs")
    .select("*")
    .order("criado_em", { ascending: false })
    .limit(limite)

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, total: data?.length ?? 0, logs: data ?? [] })
}
