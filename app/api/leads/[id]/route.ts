import { z } from "zod"
import { wsupabase } from "@/lib/whatsapp/server"
import { ok, fail } from "@/lib/api/response"
import { parseBody } from "@/lib/api/validate"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const deleteLeadSchema = z.object({
  motivo: z.string().trim().min(1, "Informe o motivo da exclusão."),
  detalhe: z.string().trim().min(1, "Informe o detalhe da exclusão."),
  usuario: z.string().trim().optional().default("Inbox"),
})

const patchLeadSchema = z.object({
  status: z.string().optional(),
  tags: z.array(z.union([z.string(), z.object({ ref: z.string(), principal: z.boolean().optional() })])).optional(),
  observacoes: z.string().optional(),
})

// Exclui um lead (usado pelo Inbox). Exige motivo + detalhe, grava auditoria e
// desvincula as mensagens do WhatsApp (lead_id = null) para a conversa continuar
// no Inbox, apenas sem lead associado.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) return fail("ID ausente.", 400)

  const parsed = await parseBody(request, deleteLeadSchema)
  if (!parsed.success) return parsed.response

  const { motivo, detalhe, usuario } = parsed.data

  const { data: lead } = await wsupabase.from("leads").select("id, nome").eq("id", id).maybeSingle()
  if (!lead) return fail("Lead não encontrado.", 404)

  const auditErr = await wsupabase.from("auditoria").insert({
    lead_id: id,
    lead_nome: lead.nome,
    usuario_nome: usuario,
    tipo: "exclusao",
    descricao: `Lead excluído pelo Inbox — ${motivo}`,
    motivo,
    motivo_detalhe: detalhe,
  })
  if (auditErr.error) {
    logger.error("Erro ao registrar auditoria de exclusão", { error: auditErr.error.message, leadId: id })
    return fail(auditErr.error.message, 500)
  }

  const { error } = await wsupabase.from("leads").delete().eq("id", id)
  if (error) {
    logger.error("Erro ao excluir lead", { error: error.message, leadId: id })
    return fail(error.message, 500)
  }

  await wsupabase.from("whatsapp_mensagens").update({ lead_id: null }).eq("lead_id", id)

  logger.info("Lead excluído com sucesso via Inbox", { leadId: id, motivo })
  return ok()
}

// Atualiza campos permitidos de um lead (usado pelo Inbox para salvar tags/estágio).
// Aceita somente campos controlados — nunca sobrescreve telefone/corretor.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) return fail("ID ausente.", 400)

  const parsed = await parseBody(request, patchLeadSchema)
  if (!parsed.success) return parsed.response

  const body = parsed.data
  const patch: Record<string, unknown> = {}

  if (body.status !== undefined) patch.status = body.status
  if (body.tags !== undefined) {
    patch.referencias = body.tags.map((t, i) => {
      if (typeof t === "object" && t !== null && "ref" in t) return t
      return { ref: String(t), principal: i === 0 }
    })
  }
  if (body.observacoes !== undefined) patch.observacoes = body.observacoes

  const { error } = await wsupabase.from("leads").update(patch).eq("id", id)
  if (error) {
    logger.error("Erro ao atualizar lead", { error: error.message, leadId: id })
    return fail(error.message, 500)
  }

  try {
    const mudancas: string[] = []
    if (body.status !== undefined) mudancas.push(`etapa → ${body.status}`)
    if (body.tags !== undefined) mudancas.push(`tags → [${body.tags.map((t) => typeof t === "string" ? t : t.ref).join(", ") || "—"}]`)
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
  } catch (logErr) {
    // Log operacional é best-effort
    logger.warn("Falha ao registrar log de atualização do lead no Inbox", { error: logErr, leadId: id })
  }

  return ok()
}
