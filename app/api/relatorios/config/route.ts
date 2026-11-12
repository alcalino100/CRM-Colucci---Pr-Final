// app/api/relatorios/config/route.ts
// Gerenciamento de configurações do relatório diário (liga/desliga, seções, horário, instância)

import { z } from "zod"
import { ok, fail } from "@/lib/api/response"
import { parseBody } from "@/lib/api/validate"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { logger } from "@/lib/logger"
import { SECOES_PADRAO } from "@/lib/relatorios/montar"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const configUpdateSchema = z.object({
  ativo: z.boolean().optional(),
  hora_envio: z.string().regex(/^\d{2}:\d{2}$/, "Formato de hora deve ser HH:mm").optional(),
  dias_semana: z.array(z.number().int().min(0).max(6)).min(1, "Selecione ao menos um dia da semana").optional(),
  instance_name: z.string().nullable().optional(),
  secoes: z.object({
    trafego: z.boolean().optional(),
    automacao: z.boolean().optional(),
    ia: z.boolean().optional(),
    arquivados: z.boolean().optional(),
    tempo: z.boolean().optional(),
  }).optional(),
  incluir_gestores_no_tempo: z.boolean().optional(),
  listar_nomes_leads: z.boolean().optional(),
  resumo_ia: z.boolean().optional(),
  limite_tentativa: z.string().regex(/^\d{2}:\d{2}$/, "Formato de hora deve ser HH:mm").optional(),
  updated_by: z.string().nullable().optional(),
})

export async function GET() {
  if (!process.env.SUPABASE_SECRET_KEY) {
    return fail("configure SUPABASE_SECRET_KEY", 500)
  }

  try {
    const admin = getSupabaseAdmin()
    const { data, error } = await admin
      .from("relatorio_config")
      .select("*")
      .eq("id", "main")
      .maybeSingle()

    if (error) {
      logger.error("Erro ao carregar relatorio_config", { error: error.message })
      return fail(error.message, 500)
    }

    const config = data ?? {
      id: "main",
      ativo: true,
      hora_envio: "08:00",
      dias_semana: [0, 1, 2, 3, 4, 5, 6],
      instance_name: null,
      secoes: SECOES_PADRAO,
      incluir_gestores_no_tempo: false,
      listar_nomes_leads: false,
      resumo_ia: false,
      limite_tentativa: "12:00",
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    }

    return ok({ config })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return fail(`Erro ao buscar configurações: ${msg}`, 500)
  }
}

export async function PATCH(request: Request) {
  if (!process.env.SUPABASE_SECRET_KEY) {
    return fail("configure SUPABASE_SECRET_KEY", 500)
  }

  const parsed = await parseBody(request, configUpdateSchema)
  if (!parsed.success) return parsed.response

  try {
    const admin = getSupabaseAdmin()
    const patch = {
      ...parsed.data,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await admin
      .from("relatorio_config")
      .upsert({ id: "main", ...patch })
      .select("*")
      .single()

    if (error) {
      logger.error("Erro ao atualizar relatorio_config", { error: error.message })
      return fail(error.message, 500)
    }

    logger.info("Configuração de relatórios atualizada com sucesso", { patch })
    return ok({ config: data })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return fail(`Erro ao salvar configurações: ${msg}`, 500)
  }
}
