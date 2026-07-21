import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config"

type Payload = {
  senderId?: string
  titulo?: string
  mensagem?: string
  prioridade?: "informativo" | "aviso" | "urgente"
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

  const titulo = body.titulo?.trim() ?? ""
  const mensagem = body.mensagem?.trim() ?? ""
  if (!body.senderId || !titulo || !mensagem) return fail(400, "VALIDATION_ERROR", "Preencha título e mensagem.")
  if (titulo.length > 120 || mensagem.length > 2000) return fail(400, "VALIDATION_ERROR", "O título ou a mensagem excede o limite permitido.")
  if (!body.prioridade || !["informativo", "aviso", "urgente"].includes(body.prioridade)) return fail(400, "VALIDATION_ERROR", "Selecione um tipo válido.")
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

  if (body.agendadaPara) {
    const scheduledAt = new Date(body.agendadaPara)
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) return fail(400, "SCHEDULING_ERROR", "Escolha uma data e hora futuras.")
    const { data, error } = await supabase.from("notificacoes_agendadas").insert({
      titulo,
      mensagem,
      prioridade: body.prioridade,
      para_role: body.paraRole ?? null,
      para_usuario_id: body.paraUsuarioId ?? null,
      agendada_para: scheduledAt.toISOString(),
      criado_por: sender.id,
      criado_por_nome: sender.nome,
    }).select("*").single()
    if (error) return fail(500, "DATABASE_ERROR", "Não foi possível agendar a notificação.", error.message)
    return NextResponse.json({ ok: true, data })
  }

  const { data, error } = await supabase.from("notificacoes").insert({
    titulo,
    texto: mensagem,
    tipo: "comunicado_gestao",
    prioridade: body.prioridade,
    origem: "gestao",
    criado_por: sender.id,
    criado_por_nome: sender.nome,
    para_role: body.paraRole ?? null,
    para_usuario_id: body.paraUsuarioId ?? null,
  }).select("*").single()
  if (error) return fail(500, "DATABASE_ERROR", "Não foi possível enviar a notificação.", error.message)
  return NextResponse.json({ ok: true, data })
}
