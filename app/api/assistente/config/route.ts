import { z } from "zod"
import { exigirGestor } from "@/lib/auth/sessao"
import { fail, ok } from "@/lib/api/response"
import { parseBody } from "@/lib/api/validate"
import { CAPACIDADES, normalizarCapacidades } from "@/lib/assistente/capacidades"
import { CONFIG_PADRAO } from "@/lib/assistente/repositorio"
import { resolverClaude } from "@/lib/assistente/ia-claude"
import { obterProvider } from "@/lib/assistente/provider-factory"
import { repositorioSupabase, tabelaAusente } from "@/lib/assistente/repositorio-supabase"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { providerFromModel } from "@/lib/ai/generateResponse"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const digitos = (s: string) => s.replace(/\D/g, "")

const Corpo = z.object({
  ativo: z.boolean().optional(),
  instancias: z.array(z.string().min(1).max(80)).max(30).optional(),
  numerosTeste: z.array(z.string().max(20).transform(digitos).refine((d) => d.length >= 10 && d.length <= 13, "Número inválido")).max(20).optional(),
  capacidades: z.object(Object.fromEntries(CAPACIDADES.map((c) => [c.id, z.boolean()])) as Record<string, z.ZodBoolean>).partial().optional(),
  usarIa: z.boolean().optional(),
  aiAgentId: z.string().max(80).optional(),
})

async function opcoes() {
  const out = { instancias: [] as string[], agentesClaude: [] as { id: string; nome: string }[] }
  try {
    const admin = getSupabaseAdmin() as any
    const { data: inst } = await admin.from("whatsapp_instancias").select("instance_name").limit(100)
    out.instancias = (inst ?? []).map((i: { instance_name: string }) => i.instance_name).filter(Boolean)
    const { data: ag } = await admin.from("ai_agents").select("id,name,model_name").limit(50)
    out.agentesClaude = (ag ?? []).filter((a: { model_name?: string }) => providerFromModel(a.model_name) === "claude").map((a: { id: string; name: string }) => ({ id: a.id, nome: a.name }))
  } catch { /* opções são auxiliares */ }
  return out
}

async function estado(aiAgentId?: string) {
  const res = await resolverClaude(aiAgentId)
  return { provedor: obterProvider().nome, iaDisponivel: !!res, iaOrigem: res?.cred.origem ?? null, iaModelo: res?.cred.modeloAgente ?? null, iaAgente: res?.persona?.nome ?? null, ...(await opcoes()) }
}

export async function GET(req: Request) {
  const auth = exigirGestor(req)
  if (!auth.ok) return fail(auth.erro, auth.status)
  if (!process.env.SUPABASE_SECRET_KEY) return ok({ fonte: "demonstracao", config: CONFIG_PADRAO, provedor: obterProvider().nome, iaDisponivel: false, iaOrigem: null, instancias: [], agentesClaude: [] })
  try {
    const config = await repositorioSupabase.obterConfig()
    return ok({ fonte: "banco", config, ...(await estado(config.aiAgentId)) })
  } catch (e) {
    if (!tabelaAusente(e)) logger.error("assistente: erro ao ler config", { error: e instanceof Error ? e.message : String(e) })
    return ok({ fonte: "demonstracao", config: CONFIG_PADRAO, ...(await estado()) })
  }
}

export async function PUT(req: Request) {
  const auth = exigirGestor(req)
  if (!auth.ok) return fail(auth.erro, auth.status)
  const parsed = await parseBody(req, Corpo)
  if (!parsed.success) return parsed.response
  if (!process.env.SUPABASE_SECRET_KEY) return fail("Servidor sem SUPABASE_SECRET_KEY configurada.", 500)
  try {
    const atual = await repositorioSupabase.obterConfig()
    const { capacidades, ...resto } = parsed.data
    const config = await repositorioSupabase.salvarConfig({ ...resto, ...(capacidades ? { capacidades: normalizarCapacidades({ ...atual.capacidades, ...capacidades }) } : {}) })
    return ok({ fonte: "banco", config })
  } catch (e) {
    if (tabelaAusente(e)) return fail("As tabelas do assistente ainda não existem. Aplique a migration 20261119120000_assistente_virtual.sql no Supabase.", 503)
    logger.error("assistente: erro ao salvar config", { error: e instanceof Error ? e.message : String(e) })
    return fail("Não foi possível salvar.", 500)
  }
}
