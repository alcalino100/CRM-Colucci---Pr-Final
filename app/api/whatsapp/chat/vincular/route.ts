import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Persiste o vínculo conversa ↔ lead: atualiza lead_id de TODAS as mensagens da
// instância com aquele telefone. Necessário porque o webhook só vincula no insert
// e, para uma conversa que existia antes do lead, o lead_id ficava nulo — o que
// fazia o vínculo sumir após recarregar o Inbox. Com `unlink: true`, desfaz o
// vínculo (lead_id = null) sem excluir nem o lead nem as mensagens.
export async function POST(request: Request) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, erro: "Dados inválidos." }, { status: 400 })
  }

  const instanceName = String(body.instanceName ?? "").trim()
  const telefone = String(body.telefone ?? "").trim()
  const leadId = String(body.leadId ?? "").trim()
  const unlink = body.unlink === true
  if (!instanceName || !telefone || (!leadId && !unlink)) {
    return NextResponse.json({ ok: false, erro: "instanceName, telefone e leadId são obrigatórios." }, { status: 400 })
  }

  const digits = telefone.replace(/\D/g, "")
  const variantes = [`55${digits}`, digits]
  const { error } = await wsupabase
    .from("whatsapp_mensagens")
    .update(unlink ? { lead_id: null } : { lead_id: leadId })
    .eq("instance_name", instanceName)
    .in("telefone", variantes)

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}