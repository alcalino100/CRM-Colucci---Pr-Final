import { z } from "zod"
import { ROLE_LIST } from "@/lib/roles"

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const role = z.enum(ROLE_LIST as [string, ...string[]])

export const CriarUsuarioSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome.").max(120),
  email: z.string().trim().toLowerCase().regex(EMAIL, "E-mail inválido.").max(200),
  senha: z.string().min(6, "A senha deve ter ao menos 6 caracteres.").max(128),
  role,
  ativo: z.boolean().default(true),
})

export const AlterarUsuarioSchema = z.object({
  nome: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().toLowerCase().regex(EMAIL, "E-mail inválido.").max(200).optional(),
  senha: z.string().min(6, "A senha deve ter ao menos 6 caracteres.").max(128).optional(),
  role: role.optional(),
  ativo: z.boolean().optional(),
  avatar: z.string().max(700_000).optional(),
})
