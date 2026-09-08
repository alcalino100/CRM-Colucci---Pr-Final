import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Atualiza campos permitidos de um lead (usado pelo Inbox para salvar tags/estágio).
// Aceita somente campos controlados — nunca sobrescreve telefone/corretor.
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) return NextResponse.json({ ok: false, erro: "ID ausente." }, { status: 400 })

  let body: { status?: string; tags?: string[]; observacoes?: string }
  try {
    body = await _request.json()
  } catch {
    return NextResponse.json({ ok: false, erro: "Dados inválidos." }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (body.status !== undefined) patch.status = body.status
  if (body.tags !== undefined) patch.referencias = body.tags
  if (body.observacoes !== undefined) patch.observacoes = body.observacoes

  const { error } = await wsupabase.from("leads").update(patch).eq("id", id)
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}