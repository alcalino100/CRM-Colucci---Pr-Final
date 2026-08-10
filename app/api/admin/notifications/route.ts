import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config"

type Payload = {
  senderId?: string
  titulo?: string
  mensagem?: string
  prioridade?: "informativo" | "aviso" | "urgente"
  modulo?: "vendas" | "locacao" | null
  paraRole?: "gestor" | "corretor" | null
  paraUsuarioId?: string | null
  agendadaPara?: string | null
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

function fail(status: number, code: string, error: string, details?: string) {
  return NextResponse.json({ ok: false, code, error, details }, { status })
}

export async function POST(request: Request) {
  let body: Payload
  try {
    body = await request.json()
  } catch {
    return fail(400, "VALIDATION_ERROR", "Dados inválidos.")
  }

  const mensagem = body.mensagem?.trim() ?? ""
  if (!body.senderId || !mensagem) return fail(400, "VALIDATION_ERROR", "Preencha a mensagem.")
  if (mensagem.length > 2000) return fail(400, "VALIDATION_ERROR", "A mensagem excede o limite permitido.")
  if (body.paraRole && !["gestor", "corretor"].includes(body.paraRole)) return fail(400, "VALIDATION_ERROR", "Público inválido.")

  const { data: sender, error: senderError } = await supabase
    .from("usuarios")
    .select("id,nome,role,status")
    .eq("id", body.senderId)
    .maybeSingle()
  if (senderError) return fail(500, "DATABASE_ERROR", "Não foi possível validar o remetente.", senderError.message)
  if (!sender || sender.role !== "gestor" || sender.status !== "ativo") return fail(403, "AUTHORIZATION_ERROR", "Acesso restrito a gestores ativos.")

  if (body.paraUsuarioId) {
    const { data: recipient, error } = await supabase.from("usuarios").select("id,status").eq("id", body.paraUsuarioId).maybeSingle()
    if (error) return fail(500, "DATABASE_ERROR", "Não foi possível validar o destinatário.", error.message)
    if (!recipient || recipient.status !== "ativo") return fail(400, "VALIDATION_ERROR", "O usuário selecionado não está ativo.")
  }

  // Agendamento desativado: o banco não possui a tabela notificacoes_agendadas.
  if (body.agendadaPara) return fail(400, "SCHEDULING_ERROR", "O agendamento de notificações não está disponível.")

  const { data, error } = await supabase.from("notificacoes").insert({
    mensagem,
    tipo: "comunicado_gestao",
    modulo: body.modulo ?? null,
    usuario_id: sender.id,
    para_role: body.paraRole ?? null,
    para_usuario_id: body.paraUsuarioId ?? null,
  }).select("*").single()
  if (error) return fail(500, "DATABASE_ERROR", "Não foi possível enviar a notificação.", error.message)
  return NextResponse.json({ ok: true, data })
}
