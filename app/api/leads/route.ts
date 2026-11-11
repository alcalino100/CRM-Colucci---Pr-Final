import { z } from "zod"
import { wsupabase } from "@/lib/whatsapp/server"
import { ok, fail } from "@/lib/api/response"
import { parseBody } from "@/lib/api/validate"
import { sanitizePostgrestFilter } from "@/lib/supabase/postgrest"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const createLeadSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório."),
  telefone: z.string().trim().min(1, "Telefone é obrigatório."),
  email: z.string().trim().email("E-mail inválido.").optional().or(z.literal("")),
  origem: z.enum(["Instagram", "Tráfego Pago", "WhatsApp", "Marketplace", "Indicação", "Outro"]).default("WhatsApp"),
  status: z.string().default("novo"),
  temperatura: z.enum(["quente", "morno", "frio"]).default("morno"),
  referenciaImovel: z.string().optional(),
  referencias: z.array(z.string()).optional(),
  observacoes: z.string().optional().default(""),
  corretorId: z.string().nullable().optional(),
})

// Lista/busca leads (usado pelo Inbox para vincular uma conversa ao lead por telefone).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const rawSearch = searchParams.get("search") ?? ""
  const search = sanitizePostgrestFilter(rawSearch)
  const digits = search.replace(/\D/g, "")

  let query = wsupabase.from("leads").select("id,nome,telefone,status,origem,referencias").limit(50)
  if (digits) {
    query = query.or(`telefone.ilike.%${search}%,telefone.ilike.%${digits}%`)
  } else if (search) {
    query = query.or(`nome.ilike.%${search}%`)
  }
  query = query.order("atualizado_em", { ascending: false })

  const { data, error } = await query
  if (error) {
    logger.error("Erro ao buscar leads via API", { error: error.message })
    return fail(error.message, 500)
  }
  return ok({ leads: data ?? [] })
}

// Cria um lead a partir do Inbox (conversa sem lead ainda).
export async function POST(request: Request) {
  const parsed = await parseBody(request, createLeadSchema)
  if (!parsed.success) return parsed.response

  const body = parsed.data
  const nome = body.nome
  const telefone = body.telefone

  const tags: string[] = (body.referencias ?? []).filter(Boolean)
  const referencias = tags.map((t, i) => ({ ref: String(t), principal: i === 0 }))
  const origem = body.origem

  const { data, error } = await wsupabase.from("leads").insert({
    nome,
    telefone,
    email: body.email ?? "",
    origem,
    status: body.status,
    temperatura: body.temperatura,
    referencia_imovel: body.referenciaImovel ?? tags[0] ?? "inbox",
    referencias,
    observacoes: body.observacoes ?? "",
    corretor_id: body.corretorId ?? null,
  }).select("id").maybeSingle()

  if (error) {
    logger.error("Erro ao criar lead pelo Inbox", { error: error.message, nome })
    return fail(error.message, 500)
  }

  try {
    await wsupabase.from("automation_logs").insert({
      event_type: "lead_criado_inbox",
      event_title: `Lead criado pelo Inbox (${nome})`,
      event_description: `Lead ${nome} criado com origem "${origem}" e tags [${tags.join(", ") || "—"}].`,
      actor_type: "gestor",
      lead_id: data?.id ?? null,
    })
  } catch (logErr) {
    // Log operacional é best-effort; nunca falha a criação do lead
    logger.warn("Falha ao registrar log de criação de lead no Inbox", { error: logErr })
  }

  logger.info("Lead criado com sucesso via Inbox", { leadId: data?.id, origem })
  return ok({ lead: { id: data?.id } })
}
