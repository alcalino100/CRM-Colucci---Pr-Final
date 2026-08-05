import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  const autorizado = !!secret && auth === `Bearer ${secret}`
  if (!autorizado) return NextResponse.json({ erro: "não autorizado" }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ erro: "json inválido" }, { status: 400 })
  }

  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter(Boolean) : []
  if (!ids.length) return NextResponse.json({ erro: "ids é obrigatório" }, { status: 400 })

  const motivos = body?.motivos ?? null

  try {
    const { data: removidos } = await wsupabase
      .from("leads")
      .select("id, nome, telefone, corretor_id")
      .in("id", ids)

    if (removidos?.length) {
      await wsupabase.from("auditoria").insert(
        removidos.map((l) => ({
          lead_id: l.id,
          lead_nome: l.nome,
          usuario_nome: "Sistema (admin)",
          tipo: "exclusao",
          descricao: "Lead interno excluído via admin (não pode virar lead)",
          motivo: motivos || "Contato interno (esposa/parente de corretor)",
        })),
      )
    }

    const { error } = await wsupabase.from("leads").delete().in("id", ids)
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      removidos: removidos?.length ?? 0,
      ids,
      detalhes: removidos ?? [],
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 })
  }
}
