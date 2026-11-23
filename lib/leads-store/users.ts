import { isMaster } from "../roles"
import type { Role, User } from "../mock-data"

/**
 * Escritas em usuários passam pelo servidor (/api/usuarios): lá valem as regras de permissão de verdade e a senha vira
 * hash. O navegador não escreve mais na tabela `usuarios` (a chave pública perdeu essa permissão).
 */
async function chamarApi(url: string, method: "POST" | "PATCH", corpo: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })
    const j = await r.json().catch(() => ({}))
    if (r.status === 401) return { ok: false, error: "Sua sessão precisa ser renovada: saia do CRM e entre novamente." }
    if (!j?.ok) return { ok: false, error: j?.erro || "Não foi possível salvar. Tente novamente." }
    return { ok: true }
  } catch {
    return { ok: false, error: "Sem conexão. Tente novamente." }
  }
}

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
  const r = await chamarApi("/api/usuarios", "POST", { nome: u.nome, email, senha: u.senha, role: u.role, ativo: u.ativo })
  if (!r.ok) return r
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
  const corpo: Record<string, unknown> = {}
  if (patch.nome !== undefined) corpo.nome = patch.nome
  if (email !== undefined) corpo.email = email
  // Campo em branco = manter a senha atual (a senha nunca é pré-preenchida, pois só existe como hash).
  if (patch.senha) corpo.senha = patch.senha
  if (patch.role !== undefined) corpo.role = patch.role
  if (patch.avatar !== undefined) corpo.avatar = patch.avatar
  if (patch.ativo !== undefined) corpo.ativo = patch.ativo
  const r = await chamarApi(`/api/usuarios/${id}`, "PATCH", corpo)
  if (!r.ok) return r
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
  if (patch.avatar === undefined) return { ok: true }
  const r = await chamarApi(`/api/usuarios/${userId}`, "PATCH", { avatar: patch.avatar })
  if (!r.ok) return { ok: false, error: r.error ?? "Não foi possível salvar. Tente novamente." }
  await loadUsers()
  return { ok: true }
}
