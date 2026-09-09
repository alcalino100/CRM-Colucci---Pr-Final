import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Exclui um lead (usado pelo Inbox). Exige motivo + detalhe, grava auditoria e
// desvincula as mensagens do WhatsApp (lead_id = null) para a conversa continuar
// no Inbox, apenas sem lead associado.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) return NextResponse.json({ ok: false, erro: "ID ausente." }, { status: 400 })

  let body: { motivo?: string; detalhe?: string; usuario?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, erro: "Dados inválidos." }, { status: 400 })
  }

  const motivo = String(body?.motivo ?? "").trim()
  const detalhe = String(body?.detalhe ?? "").trim()
  const usuario = String(body?.usuario ?? "").trim() || "Inbox"
  if (!motivo || !detalhe) {
    return NextResponse.json({ ok: false, erro: "Informe o motivo e o detalhe da exclusão." }, { status: 400 })
  }

  const { data: lead } = await wsupabase.from("leads").select("id, nome").eq("id", id).maybeSingle()
  if (!lead) return NextResponse.json({ ok: false, erro: "Lead não encontrado." }, { status: 404 })

  const auditErr = await wsupabase.from("auditoria").insert({
    lead_id: id,
    lead_nome: lead.nome,
    usuario_nome: usuario,
    tipo: "exclusao",
    descricao: `Lead excluído pelo Inbox — ${motivo}`,
    motivo,
    motivo_detalhe: detalhe,
  })
  if (auditErr.error) return NextResponse.json({ ok: false, erro: auditErr.error.message }, { status: 500 })

  const { error } = await wsupabase.from("leads").delete().eq("id", id)
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })

  await wsupabase.from("whatsapp_mensagens").update({ lead_id: null }).eq("lead_id", id)

  return NextResponse.json({ ok: true })
}

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
  if (body.tags !== undefined) {
    const arr = Array.isArray(body.tags) ? body.tags.filter(Boolean) : []
    patch.referencias = arr.map((t: any, i: number) => {
      if (typeof t === "object" && t !== null && typeof t.ref === "string") return t
      return { ref: String(t), principal: i === 0 }
    })
  }
  if (body.observacoes !== undefined) patch.observacoes = body.observacoes

  const { error } = await wsupabase.from("leads").update(patch).eq("id", id)
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })

  try {
    const mudancas: string[] = []
    if (body.status !== undefined) mudancas.push(`etapa → ${body.status}`)
    if (body.tags !== undefined) mudancas.push(`tags → [${(Array.isArray(body.tags) ? body.tags : []).filter(Boolean).join(", ") || "—"}]`)
    if (body.observacoes !== undefined) mudancas.push("observações atualizadas")
    if (mudancas.length) {
      await wsupabase.from("automation_logs").insert({
        event_type: "lead_atualizado_inbox",
        event_title: "Lead atualizado pelo Inbox",
        event_description: mudancas.join(" · "),
        actor_type: "gestor",
        lead_id: id,
      })
    }
  } catch { /* log é best-effort */ }

  return NextResponse.json({ ok: true })
}