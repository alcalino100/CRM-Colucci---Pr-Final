import type { Estado } from "./orquestrador"

/**
 * Estado que vai para o banco: sem e-mail e sem telefone do cliente, CPF/CNPJ mascarado
 * (só os 4 últimos dígitos). O orquestrador só precisa dos 4 últimos para confirmar identidade,
 * e "*******8901" ainda funciona (ele compara apenas os dígitos finais).
 */
export function sanitizarEstado(e: Estado): Estado {
  if (!e.cliente) return { ...e }
  const digitos = e.cliente.cpfCnpj.replace(/\D/g, "")
  return {
    ...e,
    cliente: {
      id: e.cliente.id,
      nome: e.cliente.nome,
      perfil: e.cliente.perfil,
      cpfCnpj: "*".repeat(Math.max(digitos.length - 4, 0)) + digitos.slice(-4),
      telefone: "",
    },
  }
}

/** 5511999990001 → +55 11 9****-0001 (para telas de gestão; nunca mostra o número inteiro). */
export function mascararTelefone(tel: string): string {
  const d = String(tel ?? "").replace(/\D/g, "")
  if (d.length < 10) return "••••"
  const ddi = d.length > 11 ? d.slice(0, d.length - 11) : "55"
  const nac = d.slice(-11 + (d.length === 10 ? 1 : 0))
  const ddd = nac.slice(0, 2)
  const resto = nac.slice(2)
  return `+${ddi} ${ddd} ${resto.slice(0, 1)}****-${resto.slice(-4)}`
}
