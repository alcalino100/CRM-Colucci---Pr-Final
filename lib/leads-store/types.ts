import type {
  AuditEntry,
  AuditTipo,
  ChangeLog,
  Interaction,
  Lead,
  LeadStatus,
  Modulo,
  Notification,
  OperationalJustification,
  QualityNote,
  Role,
  ScheduledNotification,
  User,
  Visit,
} from "../mock-data"

export interface NotifyOpts {
  tipo?: string
  modulo?: Modulo | null
  paraRole?: Role | null // null = todos
  paraUsuarioId?: string | null
  leadId?: string | null
}

export interface AuditInput {
  leadId?: string | null
  leadNome?: string | null
  usuarioNome: string
  tipo: AuditTipo
  descricao: string
  referencias?: string | null
  motivo?: string | null
  motivoDetalhe?: string | null
}

export interface Store {
  leads: Lead[]
  visits: Visit[]
  notifications: Notification[] // já filtradas para o usuário logado
  sentNotifications: Notification[]
  scheduledNotifications: ScheduledNotification[]
  users: User[]
  changeLogs: ChangeLog[]
  qualityNotes: QualityNote[]
  justifications: OperationalJustification[]
  audit: AuditEntry[]
  ready: boolean // dados iniciais já carregados (para UX de resumo/primeira render)
  corretores: User[]
  userName: (id: string) => string
  checkPhoneDuplicate: (phone: string, excludeId?: string) => { nome: string; corretorId: string; status: LeadStatus } | null
  addLead: (l: Omit<Lead, "id" | "criadoEm" | "atualizadoEm" | "interacoes">) => Promise<{ ok: boolean; error?: string }>
  updateLead: (id: string, patch: Partial<Lead>) => Promise<{ ok: boolean; error?: string }>
  updateLeadsBulk: (ids: string[], patch: Partial<Lead>) => Promise<{ ok: boolean; updated?: number; error?: string }>
  deleteLead: (id: string, motivo: string, motivoDetalhe?: string) => Promise<{ ok: boolean; error?: string }>
  addInteraction: (leadId: string, i: Omit<Interaction, "id" | "timestamp">) => void
  getLead: (id: string) => Lead | undefined
  assumirLead: (leadId: string) => Promise<{ ok: boolean; error?: string }>
  addVisit: (v: Omit<Visit, "id">) => void
  updateVisit: (id: string, patch: Partial<Pick<Visit, "data" | "hora" | "referencias" | "observacoes">>) => Promise<{ ok: boolean; error?: string }>
  removeVisit: (id: string) => Promise<{ ok: boolean; error?: string }>
  notify: (texto: string, opts?: NotifyOpts) => void
  sendAdminNotification: (input: { mensagem: string; modulo?: Modulo | null; paraRole?: Role | null; paraUsuarioId?: string | null }) => Promise<{ ok: boolean; error?: string }>
  markNotificationsRead: () => void
  logChange: (e: Omit<ChangeLog, "id" | "dataHora">) => void
  logAudit: (e: AuditInput) => void
  addQualityNote: (leadId: string, texto: string) => void
  addJustification: (leadId: string, motivo: string, observacao?: string) => Promise<{ ok: boolean; error?: string }>
  addUser: (u: Omit<User, "id" | "criadoEm">) => Promise<{ ok: boolean; error?: string }>
  updateUser: (id: string, patch: Partial<User>) => Promise<{ ok: boolean; error?: string }>
  updateProfile: (patch: { avatar?: string }) => Promise<{ ok: boolean; error?: string }>
  arquivarLeadComData: (
    id: string,
    params: {
      motivo: string
      dataReaparecimento: string
      observacao?: string
    }
  ) => Promise<{ ok: boolean; error?: string }>
  desarquivarLead: (id: string) => Promise<{ ok: boolean; error?: string }>
}
