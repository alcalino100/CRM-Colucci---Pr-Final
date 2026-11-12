import bcrypt from "bcryptjs"
import { supabase } from "../supabase/client"
import { isMaster } from "../roles"
import type { Role, User } from "../mock-data"

export async function executarAddUser({
  u,
  userRole,
  users,
  loadUsers,
}: {
  u: Omit<User, "id" | "criadoEm">
  userRole: Role
  users: User[]
  loadUsers: () => Promise<void>
}): Promise<{ ok: boolean; error?: string }> {
  if (u.role === "gestor_master" && !isMaster(userRole)) {
    return { ok: false, error: "Apenas o Gestor Master pode criar outros Gestores Master." }
  }
  const email = u.email.trim().toLowerCase()
  if (users.some((x) => x.email.toLowerCase() === email)) {
    return { ok: false, error: "E-mail já cadastrado." }
  }
  const senhaHash = await bcrypt.hash(u.senha, 10)
  const { error } = await supabase.from("usuarios").insert({
    nome: u.nome,
    email,
    senha_hash: senhaHash,
    role: u.role,
    status: u.ativo ? "ativo" : "inativo",
  })
  if (error) return { ok: false, error: `Não foi possível salvar: ${error.message}` }
  await loadUsers()
  return { ok: true }
}

export async function executarUpdateUser({
  id,
  patch,
  userRole,
  users,
  loadUsers,
}: {
  id: string
  patch: Partial<User>
  userRole: Role
  users: User[]
  loadUsers: () => Promise<void>
}): Promise<{ ok: boolean; error?: string }> {
  if (patch.role === "gestor_master" && !isMaster(userRole)) {
    return { ok: false, error: "Apenas o Gestor Master pode atribuir o perfil Gestor Master." }
  }
  const email = patch.email ? patch.email.trim().toLowerCase() : undefined
  if (email && users.some((x) => x.id !== id && x.email.toLowerCase() === email)) {
    return { ok: false, error: "E-mail já cadastrado." }
  }
  const row: Record<string, any> = {}
  if (patch.nome !== undefined) row.nome = patch.nome
  if (email !== undefined) row.email = email
  // Campo em branco = manter a senha atual (nunca prefiltrada, pois é hash).
  if (patch.senha) row.senha_hash = await bcrypt.hash(patch.senha, 10)
  if (patch.role !== undefined) row.role = patch.role
  if (patch.avatar !== undefined) row.avatar = patch.avatar
  if (patch.ativo !== undefined) row.status = patch.ativo ? "ativo" : "inativo"
  const { error } = await supabase.from("usuarios").update(row).eq("id", id)
  if (error) return { ok: false, error: `Não foi possível salvar: ${error.message}` }
  await loadUsers()
  return { ok: true }
}

export async function executarUpdateProfile({
  userId,
  patch,
  loadUsers,
}: {
  userId: string
  patch: { avatar?: string }
  loadUsers: () => Promise<void>
}): Promise<{ ok: boolean; error?: string }> {
  if (!userId) return { ok: false, error: "Sessão inválida." }
  const row: Record<string, any> = {}
  if (patch.avatar !== undefined) row.avatar = patch.avatar
  const { error } = await supabase.from("usuarios").update(row).eq("id", userId)
  if (error) return { ok: false, error: "Não foi possível salvar. Tente novamente." }
  await loadUsers()
  return { ok: true }
}
