import bcrypt from "bcryptjs"
import { exigirSessao } from "@/lib/auth/sessao"
import { validarAlteracao } from "@/lib/auth/usuarios-regras"
import { AlterarUsuarioSchema } from "@/lib/auth/usuarios-schema"
import { fail, ok } from "@/lib/api/response"
import { parseBody } from "@/lib/api/validate"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { logger } from "@/lib/logger"
import type { Role } from "@/lib/mock-data"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** PATCH /api/usuarios/[id] — altera nome, e-mail, senha, perfil, status ou foto. Regras no servidor (ver usuarios-regras.ts). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = exigirSessao(req)
  if (!auth.ok) return fail(auth.erro, auth.status)
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("Usuário inválido.", 400)
  const parsed = await parseBody(req, AlterarUsuarioSchema)
  if (!parsed.success) return parsed.response
  const v = parsed.data

  try {
    const admin = getSupabaseAdmin() as any
    const { data: alvo } = await admin.from("usuarios").select("id,role").eq("id", id).maybeSingle()
    if (!alvo) return fail("Usuário não encontrado.", 404)

    const recusa = validarAlteracao({ id: auth.sessao.id, role: auth.sessao.role as Role }, { id: alvo.id, role: alvo.role as Role }, { ...v, role: v.role as Role | undefined })
    if (recusa) return fail(recusa, 403)

    if (v.email) {
      const { data: igual } = await admin.from("usuarios").select("id").eq("email", v.email).neq("id", id).maybeSingle()
      if (igual) return fail("E-mail já cadastrado.", 409)
    }
    const linha: Record<string, unknown> = {}
    if (v.nome !== undefined) linha.nome = v.nome
    if (v.email !== undefined) linha.email = v.email
    if (v.senha) linha.senha_hash = await bcrypt.hash(v.senha, 10) // em branco = mantém a atual
    if (v.role !== undefined) linha.role = v.role
    if (v.avatar !== undefined) linha.avatar = v.avatar
    if (v.ativo !== undefined) linha.status = v.ativo ? "ativo" : "inativo"

    const { error } = await admin.from("usuarios").update(linha).eq("id", id)
    if (error) throw error
    logger.info("usuarios: alterado", { por: auth.sessao.id, id, campos: Object.keys(linha).filter((c) => c !== "senha_hash") })
    return ok({})
  } catch (e) {
    logger.error("usuarios: erro ao alterar", { error: e instanceof Error ? e.message : String(e) })
    return fail("Não foi possível salvar. Tente novamente.", 500)
  }
}
