export type Role = "corretor" | "gestor"
export type LeadStatus =
  | "novo"
  | "escolhendo opcoes"
  | "imovel necessidade"
  | "permuta"
  | "visita agendada"
  | "em_atendimento"
  | "negociando"
  | "fechado"
  | "perdido"
export type Origem = "Instagram" | "Indicação" | "Tráfego Pago" | "WhatsApp" | "Outro"
export type Temperatura = "quente" | "morno" | "frio"
export type AuditTipo =
  | "criacao"
  | "edicao"
  | "etapa"
  | "visita"
  | "proposta"
  | "fechamento"
  | "exclusao"
  | "responsavel"
  | "temperatura"
  | "qualidade"
  | "justificativa"
export type PropertyStatus = "disponivel" | "vendido" | "alugado"
export type ActionType = "criacao" | "edicao" | "exclusao"
export type AccessAction = "login" | "logout" | "tentativa falha" | "visualizacao lead sensivel"

export interface User {
  id: string
  nome: string
  email: string
  senha: string
  role: Role
  ativo: boolean
  criadoEm: string
  avatar?: string
}

export interface Property {
  id: string
  referencia: string
  endereco: string
  tipo: string
  valorTabela: number
  status: PropertyStatus
}

export interface Interaction {
  id: string
  corretor: string
  texto: string
  timestamp: string
}

export interface LeadRef {
  ref: string
  principal?: boolean
}

export interface Lead {
  id: string
  nome: string
  telefone: string
  email: string
  imovelRef: string
  referencias: LeadRef[]
  temperatura: Temperatura
  refProposta?: string
  refFechamento?: string
  metaCampaignId?: string
  metaAdsetId?: string
  metaAdId?: string
  origem: Origem
  observacoes: string
  status: LeadStatus
  valorNegociacao?: number
  corretorId: string
  gestorResponsavel?: string
  criadoEm: string
  atualizadoEm: string
  arquivadoEm?: string
  interacoes: Interaction[]
}

export interface Visit {
  id: string
  leadId: string
  data: string // YYYY-MM-DD
  hora: string // HH:mm
  corretorId: string
  gestorResponsavel?: string // gestor dando suporte ao corretor
  imovelRef: string
  referencias?: string
  observacoes: string
}

export interface Notification {
  id: string
  texto: string
  titulo?: string | null
  prioridade?: string | null
  criadoPor?: string | null
  criadoPorNome?: string | null
  timestamp: string
  read: boolean
  tipo?: string
  paraRole?: Role | null
  paraUsuarioId?: string | null
  leadId?: string | null
}

export interface ScheduledNotification {
  id: string
  titulo: string
  mensagem: string
  prioridade: "informativo" | "aviso" | "urgente"
  paraRole?: Role | null
  paraUsuarioId?: string | null
  agendadaPara: string
  status: "pendente" | "enviada" | "cancelada"
  criadoPor?: string | null
  criadoPorNome: string
  criadoEm: string
  enviadaEm?: string | null
}

export interface OperationalJustification {
  id: string
  leadId: string
  motivo: string
  observacao?: string
  etapa: LeadStatus
  autorId: string
  autorNome: string
  criadoEm: string
}

export interface QualityNote {
  id: string
  leadId: string
  autorId?: string
  autorNome: string
  texto: string
  criadoEm: string
}

export interface AuditEntry {
  id: string
  leadId?: string | null
  leadNome?: string | null
  usuarioNome: string
  tipo: AuditTipo
  descricao: string
  referencias?: string | null
  motivo?: string | null
  motivoDetalhe?: string | null
  criadoEm: string
}

export interface ChangeLog {
  id: string
  dataHora: string
  usuario: string
  acao: ActionType
  entidade: "lead" | "imovel" | "usuario"
  campo: string
  valorAnterior: string
  valorNovo: string
}

export interface AccessLog {
  id: string
  dataHora: string
  usuario: string
  acao: AccessAction
}

export const USERS: User[] = [
  { id: "u1", nome: "Patricia", email: "patricia@colucci.com", senha: "123456", role: "gestor", ativo: true, criadoEm: "2024-01-10" },
  { id: "u2", nome: "Guilherme Garcia", email: "guilherme@colucci.com", senha: "123456", role: "corretor", ativo: true, criadoEm: "2024-02-01" },
]

export const CORRETORES = USERS.filter((u) => u.role === "corretor")

export const PROPERTIES: Property[] = []

export const LEADS: Lead[] = []

export const VISITS: Visit[] = []

export const ORIGENS: Origem[] = ["Instagram", "Indicação", "Tráfego Pago", "WhatsApp", "Outro"]

export function userName(id: string) {
  return USERS.find((u) => u.id === id)?.nome ?? "—"
}

// ---- Logs (iniciam vazios) ----
export const CHANGE_LOGS: ChangeLog[] = []

export const ACCESS_LOGS: AccessLog[] = []
