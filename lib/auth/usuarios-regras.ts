import { isMaster, modulosRole, podeGerenciarEquipe, ROLE_LIST } from "@/lib/roles"
import type { Modulo, Role } from "@/lib/mock-data"

/**
 * Regras de quem pode criar/alterar usuários, aplicadas NO SERVIDOR.
 * Antes elas existiam só no navegador (lib/leads-store/users.ts e a tela de Gestão de Acessos): quem falasse direto com
 * o banco as ignorava. Aqui é a fonte da verdade; a tela só reflete (esconde o que o servidor recusaria).
 */
export type PatchUsuario = { nome?: string; email?: string; senha?: string; role?: Role; ativo?: boolean; avatar?: string }

/** Perfis que o ator pode atribuir. Espelha a tela: gestor de módulo só atribui perfis do(s) seu(s) módulo(s); só o master atribui Gestor Master. */
export function rolesAtribuiveis(ator: Role): Role[] {
  const mods = modulosRole(ator)
  const tem = (m: Modulo) => mods.includes(m)
  return ROLE_LIST.filter((r) => {
    if (r === "gestor_master") return isMaster(ator)
    if (r === "corretor" || r === "gestor") return tem("vendas") && tem("locacao")
    if (r === "corretor_vendas" || r === "gestor_vendas") return tem("vendas")
    if (r === "corretor_locacao" || r === "gestor_locacao") return tem("locacao")
    return false // "visitante" não é atribuído por esta tela
  })
}

const podeAdministrar = (role: Role) => podeGerenciarEquipe(role) && role !== "visitante"

/** null = permitido; texto = motivo da recusa. */
export function validarCriacao(ator: Role, roleNovo: Role): string | null {
  if (!podeAdministrar(ator)) return "Acesso restrito a gestores."
  if (roleNovo === "gestor_master" && !isMaster(ator)) return "Apenas o Gestor Master pode criar outros Gestores Master."
  if (!rolesAtribuiveis(ator).includes(roleNovo)) return "Você não pode atribuir esse perfil."
  return null
}

export function validarAlteracao(ator: { id: string; role: Role }, alvo: { id: string; role: Role }, patch: PatchUsuario): string | null {
  const campos = Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] !== undefined)
  if (campos.length === 0) return "Nada para alterar."

  const proprio = ator.id === alvo.id
  // Qualquer usuário logado (menos o visitante, que é somente leitura) pode trocar a PRÓPRIA foto.
  if (proprio && campos.every((c) => c === "avatar")) return ator.role === "visitante" ? "Perfil somente leitura." : null

  if (!podeAdministrar(ator.role)) return "Acesso restrito a gestores."
  // Dono da conta master só é alterado por master (senão um gestor comum redefiniria a senha do master e entraria como ele).
  if (alvo.role === "gestor_master" && !isMaster(ator.role)) return "Apenas o Gestor Master pode alterar outro Gestor Master."
  if (patch.role !== undefined) {
    if (proprio) return "Você não pode alterar o seu próprio perfil."
    if (!rolesAtribuiveis(ator.role).includes(patch.role)) return "Você não pode atribuir esse perfil."
  }
  if (patch.ativo === false && proprio) return "Você não pode desativar a sua própria conta."
  return null
}
