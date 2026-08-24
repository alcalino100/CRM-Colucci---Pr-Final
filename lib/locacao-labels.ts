import type { Origem, Temperatura, Interaction } from "./mock-data"

// ---------- Tipos do CRM de Locação ----------

export type LocacaoStatus =
  | "novo"
  | "em_atendimento"
  | "procurando imovel"
  | "visita agendada"
  | "negociando"
  | "locado"
  | "perdido"

export interface LocacaoLead {
  id: string
  nome: string
  telefone: string
  email: string
  imovelRef: string
  referencias: { ref: string; principal?: boolean }[]
  temperatura: Temperatura
  origem: Origem
  observacoes: string
  status: LocacaoStatus
  tipoImovelDesejado: string
  bairrosDesejados: string[]
  aluguelMax?: number
  quartos: string
  garantia: string
  vagas?: number | null
  metragemMin?: number | null
  aceitaCondominio?: boolean | null
  salas?: number | null
  atividadeComercial?: string
  valorAluguel?: number
  valorComissao?: number | null
  corretorId: string
  gestorResponsavel?: string
  criadoEm: string
  atualizadoEm: string
  arquivadoEm?: string
  locadoEm?: string
  negociandoEm?: string
  interacoes: Interaction[]
}

export interface LocacaoVisit {
  id: string
  leadId: string
  data: string
  hora: string
  corretorId: string
  gestorResponsavel?: string
  imovelRef: string
  referencias?: string
  observacoes: string
}

export interface ContratoLocacao {
  id: string
  leadId?: string | null
  leadNome: string
  corretorId?: string
  corretorNome?: string
  imovelRef: string
  valorAluguel: number
  garantia: string
  comissao?: number
  assinadoEm: string
}

// ---------- Funil de locação ----------

export const LOCACAO_STATUSES: LocacaoStatus[] = [
  "novo",
  "em_atendimento",
  "procurando imovel",
  "visita agendada",
  "negociando",
  "locado",
  "perdido",
]

export const LOCACAO_STATUS_LABEL: Record<LocacaoStatus, string> = {
  novo: "Novo Lead",
  "em_atendimento": "Em Atendimento",
  "procurando imovel": "Procurando Imóvel",
  "visita agendada": "Visita Agendada",
  negociando: "Negociando",
  locado: "Locado",
  perdido: "Perdido",
}

export const LOCACAO_STATUS_VARIANT: Record<LocacaoStatus, string> = {
  novo: "blue",
  "em_atendimento": "indigo",
  "procurando imovel": "teal",
  "visita agendada": "amber",
  negociando: "accent",
  locado: "green",
  perdido: "gray",
}

export const LOCACAO_STATUS_ACCENT: Record<LocacaoStatus, string> = {
  novo: "#0ea5e9",
  "em_atendimento": "#4f46e5",
  "procurando imovel": "#0d9488",
  "visita agendada": "#f59e0b",
  negociando: "#b22222",
  locado: "#16a34a",
  perdido: "#a1a1aa",
}

export function normalizeLocacaoStatus(s: string): LocacaoStatus {
  return (LOCACAO_STATUSES as string[]).includes(s) ? (s as LocacaoStatus) : "novo"
}

// ---------- Opções do formulário de locação ----------

export const TIPOS_IMOVEL_LOCACAO = [
  "Apartamento",
  "Casa",
  "Casa em Condomínio",
  "Sala Comercial",
  "Loja",
  "Terreno",
  "Kitnet",
  "Studio",
] as const

export const BAIRROS_LOCACAO = [
  "Centro",
  "Jardim Paulista",
  "Vila Mariana",
  "Pinheiros",
  "Moema",
  "Perdizes",
  "Santana",
  "Tatuapé",
  "Santo Amaro",
  "Alto da Lapa",
  "Vila Madalena",
  "Brooklin",
] as const

export const QUARTOS_OPCOES = ["1", "2", "3", "4+"] as const

export const GARANTIAS_LOCACAO = [
  "Caução",
  "Fiador",
  "Seguro-fiança",
  "Título de capitalização",
  "Depósito",
] as const

export const VAGAS_OPCOES = ["1", "2", "3", "4+"] as const

export const SALAS_OPCOES = ["1", "2", "3", "4+"] as const

export const CONDOMINIO_OPCOES = ["sim", "nao", "indiferente"] as const

export const CONDOMINIO_LABEL: Record<string, string> = {
  sim: "Aceita",
  nao: "Não aceita",
  indiferente: "Indiferente",
}

export function resumoPreferencias(l: {
  tipoImovelDesejado?: string
  aluguelMax?: number
  quartos?: string
  vagas?: number | null
  metragemMin?: number | null
  bairrosDesejados?: string[]
}): string {
  const parts: string[] = []
  if (l.tipoImovelDesejado) parts.push(l.tipoImovelDesejado.toUpperCase())
  if (l.aluguelMax) parts.push(`ATÉ ${brl(l.aluguelMax)}`)
  if (l.quartos) parts.push(`${l.quartos}D`)
  if (l.vagas) parts.push(`${l.vagas}V`)
  if (l.metragemMin) parts.push(`${l.metragemMin}m²`)
  if (l.bairrosDesejados?.length) parts.push(l.bairrosDesejados.slice(0, 2).join(", "))
  return parts.length ? parts.join(" | ") : "Sem preferências definidas"
}

export const MOTIVOS_EXCLUSAO = [
  "Lead duplicado",
  "Cliente desistiu",
  "Não é cliente",
  "Teste",
  "Dados errados",
  "Outro",
] as const

// ---------- Reuso do CRM de vendas ----------

export const TEMPERATURAS: Temperatura[] = ["quente", "morno", "frio"]
export const TEMP_LABEL: Record<Temperatura, string> = { quente: "Quente", morno: "Morno", frio: "Frio" }
export const TEMP_VARIANT: Record<Temperatura, string> = { quente: "red", morno: "amber", frio: "slateblue" }

export const ORIGEM_VARIANT: Record<Origem, string> = {
  Instagram: "accent",
  Indicação: "teal",
  "Tráfego Pago": "blue",
  WhatsApp: "green",
  Marketplace: "purple",
  Outro: "gray",
}

export function brl(v?: number) {
  if (v == null) return "—"
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR")
}

// ---------- Helpers genéricos reexportados do CRM de vendas ----------

export { refPrincipal, refsTexto, normalizePhone, fmtDateTime, fmtDayLabel, fmtDuracao } from "./labels"
