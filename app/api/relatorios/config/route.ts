// app/api/relatorios/config/route.ts
// Gerenciamento de configurações do relatório diário (liga/desliga, seções, horário, instância)

import { ok, fail } from "@/lib/api/response"
import { parseBody } from "@/lib/api/validate"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { logger } from "@/lib/logger"
import { SECOES_PADRAO } from "@/lib/relatorios/montar"
import { configUpdateSchema } from "@/lib/relatorios/config-schema"
import { exigirGestor, negarAcesso } from "@/lib/auth/sessao"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const auth = exigirGestor(request)
  if (!auth.ok) return negarAcesso(auth)

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
  const auth = exigirGestor(request)
  if (!auth.ok) return negarAcesso(auth)

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
