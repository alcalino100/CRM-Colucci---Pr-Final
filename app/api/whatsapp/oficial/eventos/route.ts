import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"
import { exigirGestor, negarAcesso } from "@/lib/auth/sessao"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Últimos eventos que a Meta mandou ao webhook (inclusive os recusados) — para saber se a integração está viva.
export async function GET(request: Request) {
  const auth = exigirGestor(request)
  if (!auth.ok) return negarAcesso(auth)
  const { data, error } = await (wsupabase as unknown as { from: (t: string) => any })
    .from("whatsapp_oficial_eventos")
    .select("id, recebido_em, tipo, phone_number_id, wamid, resumo, assinatura_ok")
    .order("recebido_em", { ascending: false })
    .limit(40)
  if (error) return NextResponse.json({ ok: true, eventos: [], aviso: "Rode a migration 20261125130000_whatsapp_oficial_fase2.sql para ver o histórico." })
  return NextResponse.json({ ok: true, eventos: data ?? [] })
}
