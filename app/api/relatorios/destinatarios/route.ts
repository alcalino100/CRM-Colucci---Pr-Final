// app/api/relatorios/destinatarios/route.ts
// Listagem e criação de destinatários do relatório diário (números ou grupos)

import { z } from "zod"
import { ok, fail } from "@/lib/api/response"
import { parseBody } from "@/lib/api/validate"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { logger } from "@/lib/logger"
import { onlyDigits } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const destinatarioCreateSchema = z.object({
  nome: z.string().trim().min(2, "Nome deve ter pelo menos 2 caracteres"),
  tipo: z.enum(["numero", "grupo"]),
  destino: z.string().trim().min(5, "Destino inválido"),
  ativo: z.boolean().optional().default(true),
  secoes: z.object({
    trafego: z.boolean().optional(),
    automacao: z.boolean().optional(),
    ia: z.boolean().optional(),
    arquivados: z.boolean().optional(),
    tempo: z.boolean().optional(),
  }).nullable().optional(),
}).refine((data) => {
  if (data.tipo === "numero") {
    const dig = onlyDigits(data.destino)
    return dig.startsWith("55") && dig.length >= 12 && dig.length <= 13
  }
  // Grupo do WhatsApp deve ter JID com @g.us ou ao menos identificador numérico
  return data.destino.includes("@g.us") || onlyDigits(data.destino).length > 8
}, {
  message: "Para telefone use DDI 55 + DDD + número (somente dígitos, ex: 5518991234567). Para grupo, use o JID que termina em @g.us.",
  path: ["destino"],
})

export async function GET() {
  if (!process.env.SUPABASE_SECRET_KEY) {
    return fail("configure SUPABASE_SECRET_KEY", 500)
  }

  try {
    const admin = getSupabaseAdmin()
    const { data, error } = await admin
      .from("relatorio_destinatarios")
      .select("*")
      .order("created_at", { ascending: true })

    if (error) {
      logger.error("Erro ao listar relatorio_destinatarios", { error: error.message })
      return fail(error.message, 500)
    }

    return ok({ destinatarios: data ?? [] })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return fail(`Erro ao buscar destinatários: ${msg}`, 500)
  }
}

export async function POST(request: Request) {
  if (!process.env.SUPABASE_SECRET_KEY) {
    return fail("configure SUPABASE_SECRET_KEY", 500)
  }

  const parsed = await parseBody(request, destinatarioCreateSchema)
  if (!parsed.success) return parsed.response

  try {
    const admin = getSupabaseAdmin()
    const { nome, tipo, destino, ativo, secoes } = parsed.data

    // Sanitiza destino se for telefone
    const destinoSanitizado = tipo === "numero" ? onlyDigits(destino) : destino.trim()

    const { data, error } = await admin
      .from("relatorio_destinatarios")
      .insert({
        nome,
        tipo,
        destino: destinoSanitizado,
        ativo,
        secoes: secoes ?? null,
      })
      .select("*")
      .single()

    if (error) {
      logger.error("Erro ao criar relatorio_destinatario", { error: error.message })
      return fail(error.message, 500)
    }

    logger.info("Novo destinatário de relatório cadastrado", { id: data.id, tipo })
    return ok({ destinatario: data }, 201)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return fail(`Erro ao cadastrar destinatário: ${msg}`, 500)
  }
}
