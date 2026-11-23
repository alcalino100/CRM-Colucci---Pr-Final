import bcrypt from "bcryptjs"
import { exigirSessao } from "@/lib/auth/sessao"
import { validarCriacao } from "@/lib/auth/usuarios-regras"
import { CriarUsuarioSchema } from "@/lib/auth/usuarios-schema"
import { fail, ok } from "@/lib/api/response"
import { parseBody } from "@/lib/api/validate"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { logger } from "@/lib/logger"
import type { Role } from "@/lib/mock-data"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/usuarios — cria usuário. Regras de permissão no servidor; a senha é gravada só como hash (bcrypt). */
export async function POST(req: Request) {
  const auth = exigirSessao(req)
  if (!auth.ok) return fail(auth.erro, auth.status)
  const parsed = await parseBody(req, CriarUsuarioSchema)
  if (!parsed.success) return parsed.response
  const v = parsed.data

  const recusa = validarCriacao(auth.sessao.role as Role, v.role as Role)
  if (recusa) return fail(recusa, 403)

  try {
    const admin = getSupabaseAdmin() as any
    const { data: igual } = await admin.from("usuarios").select("id").eq("email", v.email).maybeSingle()
    if (igual) return fail("E-mail já cadastrado.", 409)
    const senha_hash = await bcrypt.hash(v.senha, 10)
    const { data, error } = await admin.from("usuarios").insert({ nome: v.nome, email: v.email, senha_hash, role: v.role, status: v.ativo ? "ativo" : "inativo" }).select("id,nome,email,role,status").single()
    if (error) throw error
    logger.info("usuarios: criado", { por: auth.sessao.id, id: data.id, role: v.role })
    return ok({ usuario: { id: data.id, nome: data.nome, email: data.email, role: data.role, ativo: data.status === "ativo" } })
  } catch (e) {
    logger.error("usuarios: erro ao criar", { error: e instanceof Error ? e.message : String(e) })
    return fail("Não foi possível salvar. Tente novamente.", 500)
  }
}
