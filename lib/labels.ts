import type { LeadStatus, PropertyStatus, Role, ActionType, AccessAction, Origem, Temperatura, AuditTipo, Lead } from "./mock-data"

export const TEMPERATURAS: Temperatura[] = ["quente", "morno", "frio"]
export const TEMP_LABEL: Record<Temperatura, string> = { quente: "Quente", morno: "Morno", frio: "Frio" }
// quente vermelho, morno âmbar, frio azul acinzentado
export const TEMP_VARIANT: Record<Temperatura, string> = { quente: "red", morno: "amber", frio: "slateblue" }

export const AUDIT_TIPO_LABEL: Record<AuditTipo, string> = {
  criacao: "Criação",
  edicao: "Edição",
  etapa: "Mudança de etapa",
  visita: "Visita agendada",
  proposta: "Proposta",
  fechamento: "Fechamento",
  exclusao: "Exclusão",
  responsavel: "Troca de responsável",
  temperatura: "Temperatura",
  qualidade: "Obs. de qualidade",
  justificativa: "Justificativa operacional",
}
export const AUDIT_TIPO_VARIANT: Record<AuditTipo, string> = {
  criacao: "green",
  edicao: "blue",
  etapa: "amber",
  visita: "blue",
  proposta: "accent",
  fechamento: "green",
  exclusao: "red",
  responsavel: "slate",
  temperatura: "amber",
  qualidade: "gray",
  justificativa: "red",
}

// Referência principal do lead (fallback para imovelRef legado)
export function refPrincipal(l: Pick<Lead, "referencias" | "imovelRef">) {
  return l.referencias?.find((r) => r.principal)?.ref ?? l.referencias?.[0]?.ref ?? l.imovelRef ?? ""
}
export function refsTexto(l: Pick<Lead, "referencias" | "imovelRef">) {
  const list = l.referencias?.map((r) => r.ref) ?? []
  return list.length ? list.join(", ") : l.imovelRef || ""
}

export const STATUS_LABEL: Record<LeadStatus, string> = {
  novo: "Novo Lead",
  "em_atendimento": "Em Atendimento",
  "escolhendo opcoes": "Separando Opções",
  "imovel necessidade": "Imóvel - Necessidade",
  permuta: "Permuta",
  "visita agendada": "Visita Agendada",
  negociando: "Negociando",
  fechado: "Fechado",
  perdido: "Perdido",
}
export const STATUS_VARIANT: Record<LeadStatus, string> = {
  novo: "blue",
  "em_atendimento": "indigo",
  "escolhendo opcoes": "slate",
  "imovel necessidade": "teal",
  permuta: "purple",
  "visita agendada": "amber",
  negociando: "accent",
  fechado: "green",
  perdido: "gray",
}
// cor de acento (topo da coluna do kanban)
export const STATUS_ACCENT: Record<LeadStatus, string> = {
  novo: "#0ea5e9",
  "em_atendimento": "#4f46e5",
  "escolhendo opcoes": "#54595f",
  "imovel necessidade": "#0d9488",
  permuta: "#9333ea",
  "visita agendada": "#f59e0b",
  negociando: "#b22222",
  fechado: "#16a34a",
  perdido: "#a1a1aa",
}
export const LEAD_STATUSES: LeadStatus[] = [
  "novo",
  "em_atendimento",
  "escolhendo opcoes",
  "visita agendada",
  "negociando",
  "fechado",
  "imovel necessidade",
  "permuta",
  "perdido",
]
// Mapeia status legados do banco para os atuais
export function normalizeStatus(s: string): LeadStatus {
  if (s === "em atendimento") return "escolhendo opcoes"
  if (s === "proposta enviada") return "negociando"
  return (LEAD_STATUSES as string[]).includes(s) ? (s as LeadStatus) : "novo"
}

// Normaliza telefone para comparação (só dígitos)
export function normalizePhone(phone: string) {
  return (phone || "").replace(/\D/g, "")
}

// ---- Follow-up obrigatório por etapa ----
// Prazo para exigir justificativa por falta de movimentação: 2 dias completos.
// Etapas que exigem follow-up (Fechado e Perdido não exigem).

// Motivos de exclusão de lead (com "Outro" ao final para detalhe livre)
export const MOTIVOS_EXCLUSAO = [
  "Lead duplicado",
  "Dados incorretos / inválidos",
  "Cadastro de teste",
  "Solicitação do cliente (LGPD)",
  "Spam / não é lead",
  "Outro",
] as const

export const PROP_LABEL: Record<PropertyStatus, string> = { disponivel: "Disponível", vendido: "Vendido", alugado: "Alugado" }
export const PROP_VARIANT: Record<PropertyStatus, string> = { disponivel: "green", vendido: "gray", alugado: "blue" }

export const ROLE_VARIANT: Record<Role, string> = { gestor: "accent", corretor: "default" }

export const ACTION_LABEL: Record<ActionType, string> = { criacao: "Criação", edicao: "Edição", exclusao: "Exclusão" }
export const ACTION_VARIANT: Record<ActionType, string> = { criacao: "green", edicao: "blue", exclusao: "red" }

export const ACCESS_LABEL: Record<AccessAction, string> = {
  login: "Login",
  logout: "Logout",
  "tentativa falha": "Tentativa falha",
  "visualizacao lead sensivel": "Visualização de lead",
}

export const ORIGEM_VARIANT: Record<Origem, string> = {
  Instagram: "accent",
  Indicação: "teal",
  "Tráfego Pago": "blue",
  WhatsApp: "green",
  Outro: "gray",
}

export function brl(v?: number) {
  if (v == null) return "—"
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
}
export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR")
}
export function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}
export function fmtDayLabel(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })
}
