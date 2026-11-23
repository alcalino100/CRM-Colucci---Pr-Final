// app/api/relatorios/corretores/route.ts
// Lista corretores/gestores ativos para escolher quem aparece no relatório de cada destinatário.

import { ok, fail } from "@/lib/api/response"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { exigirGestor, negarAcesso } from "@/lib/auth/sessao"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const auth = exigirGestor(request)
  if (!auth.ok) return negarAcesso(auth)

  if (!process.env.SUPABASE_SECRET_KEY) return fail("configure SUPABASE_SECRET_KEY", 500)
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from("usuarios")
    .select("id, nome, role")
    .eq("status", "ativo")
    .in("role", ["corretor", "corretor_vendas", "corretor_locacao", "gestor_vendas", "gestor_locacao"])
    .order("nome")
  if (error) return fail(error.message, 500)
  return ok({ corretores: data ?? [] })
}
