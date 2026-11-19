import { ok } from "@/lib/api/response"
import { atendimentosDemo } from "@/lib/assistente/demo-data"
import { repositorioSupabase, tabelaAusente } from "@/lib/assistente/repositorio-supabase"
import type { StatusConversa } from "@/lib/assistente/repositorio"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const STATUS: StatusConversa[] = ["ativa", "resolvida_ia", "transferida", "humano", "encerrada"]

/** Lista de atendimentos (telefone sempre mascarado). Sem a migration aplicada, devolve demonstração sinalizada. */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const s = url.searchParams.get("status") as StatusConversa | null
  const limite = Math.min(Math.max(Number(url.searchParams.get("limite")) || 50, 1), 200)
  if (!process.env.SUPABASE_SECRET_KEY) return ok({ fonte: "demonstracao", atendimentos: atendimentosDemo() })
  try {
    const atendimentos = await repositorioSupabase.listarAtendimentos({ limite, status: s && STATUS.includes(s) ? s : undefined })
    return ok({ fonte: "banco", atendimentos })
  } catch (e) {
    if (!tabelaAusente(e)) logger.error("assistente: erro ao listar atendimentos", { error: e instanceof Error ? e.message : String(e) })
    return ok({ fonte: "demonstracao", atendimentos: atendimentosDemo() })
  }
}
