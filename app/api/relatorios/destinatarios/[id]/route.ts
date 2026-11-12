// app/api/relatorios/destinatarios/[id]/route.ts
// Atualização e exclusão de destinatário específico do relatório diário

import { z } from "zod"
import { ok, fail } from "@/lib/api/response"
import { parseBody } from "@/lib/api/validate"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { logger } from "@/lib/logger"
import { onlyDigits } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const destinatarioPatchSchema = z.object({
  nome: z.string().trim().min(2, "Nome deve ter pelo menos 2 caracteres").optional(),
  tipo: z.enum(["numero", "grupo"]).optional(),
  destino: z.string().trim().min(5, "Destino inválido").optional(),
  ativo: z.boolean().optional(),
  secoes: z.object({
    trafego: z.boolean().optional(),
    automacao: z.boolean().optional(),
    ia: z.boolean().optional(),
    arquivados: z.boolean().optional(),
    tempo: z.boolean().optional(),
  }).nullable().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!process.env.SUPABASE_SECRET_KEY) {
    return fail("configure SUPABASE_SECRET_KEY", 500)
  }

  const { id } = await params
  if (!id) return fail("ID do destinatário é obrigatório", 400)

  const parsed = await parseBody(request, destinatarioPatchSchema)
  if (!parsed.success) return parsed.response

  try {
    const admin = getSupabaseAdmin()
    const patchData: Record<string, unknown> = {
      ...parsed.data,
      updated_at: new Date().toISOString(),
    }

    if (parsed.data.destino && parsed.data.tipo === "numero") {
      patchData.destino = onlyDigits(parsed.data.destino)
    }

    const { data, error } = await admin
      .from("relatorio_destinatarios")
      .update(patchData)
      .eq("id", id)
      .select("*")
      .maybeSingle()

    if (error) {
      logger.error("Erro ao atualizar destinatário", { id, error: error.message })
      return fail(error.message, 500)
    }

    if (!data) return fail("Destinatário não encontrado", 404)

    return ok({ destinatario: data })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return fail(`Erro ao salvar alterações: ${msg}`, 500)
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!process.env.SUPABASE_SECRET_KEY) {
    return fail("configure SUPABASE_SECRET_KEY", 500)
  }

  const { id } = await params
  if (!id) return fail("ID do destinatário é obrigatório", 400)

  try {
    const admin = getSupabaseAdmin()
    const { error } = await admin
      .from("relatorio_destinatarios")
      .delete()
      .eq("id", id)

    if (error) {
      logger.error("Erro ao excluir destinatário", { id, error: error.message })
      return fail(error.message, 500)
    }

    logger.info("Destinatário excluído", { id })
    return ok({ removido: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return fail(`Erro ao excluir destinatário: ${msg}`, 500)
  }
}
