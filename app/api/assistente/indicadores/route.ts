import { exigirGestor } from "@/lib/auth/sessao"
import { fail, ok } from "@/lib/api/response"
import { indicadoresDemo } from "@/lib/assistente/demo-data"
import { repositorioSupabase, tabelaAusente } from "@/lib/assistente/repositorio-supabase"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const auth = exigirGestor(req)
  if (!auth.ok) return fail(auth.erro, auth.status)
  const dias = Math.min(Math.max(Number(new URL(req.url).searchParams.get("dias")) || 1, 1), 90)
  if (!process.env.SUPABASE_SECRET_KEY) return ok({ fonte: "demonstracao", dias, indicadores: indicadoresDemo() })
  try {
    const indicadores = await repositorioSupabase.calcularIndicadores(new Date(Date.now() - dias * 86_400_000))
    return ok({ fonte: "banco", dias, indicadores })
  } catch (e) {
    if (!tabelaAusente(e)) logger.error("assistente: erro nos indicadores", { error: e instanceof Error ? e.message : String(e) })
    return ok({ fonte: "demonstracao", dias, indicadores: indicadoresDemo() })
  }
}
