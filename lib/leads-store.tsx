"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import {
  type AuditEntry,
  type AuditTipo,
  type ChangeLog,
  type Interaction,
  type Lead,
  type LeadRef,
  type Notification,
  type Origem,
  type QualityNote,
  type Role,
  type ScheduledNotification,
  type Temperatura,
  type User,
  type Visit,
} from "./mock-data"
import { supabase } from "./supabase/client"
import { useAuth } from "./auth-context"
import { normalizeStatus } from "./labels"

interface NotifyOpts {
  tipo?: string
  paraRole?: Role | null // null = todos
  paraUsuarioId?: string | null
  leadId?: string | null
}

interface AuditInput {
  leadId?: string | null
  leadNome?: string | null
  usuarioNome: string
  tipo: AuditTipo
  descricao: string
  referencias?: string | null
}

interface Store {
  leads: Lead[]
  visits: Visit[]
  notifications: Notification[] // já filtradas para o usuário logado
  sentNotifications: Notification[]
  scheduledNotifications: ScheduledNotification[]
  users: User[]
  changeLogs: ChangeLog[]
  qualityNotes: QualityNote[]
  audit: AuditEntry[]
  corretores: User[]
  userName: (id: string) => string
  addLead: (l: Omit<Lead, "id" | "criadoEm" | "atualizadoEm" | "interacoes">) => void
  updateLead: (id: string, patch: Partial<Lead>) => void
  deleteLead: (id: string) => void
  addInteraction: (leadId: string, i: Omit<Interaction, "id" | "timestamp">) => void
  getLead: (id: string) => Lead | undefined
  addVisit: (v: Omit<Visit, "id">) => void
  notify: (texto: string, opts?: NotifyOpts) => void
  sendAdminNotification: (input: { titulo: string; mensagem: string; prioridade: "informativo" | "aviso" | "urgente"; paraRole?: Role | null; paraUsuarioId?: string | null }) => Promise<{ ok: boolean; error?: string }>
  scheduleAdminNotification: (input: { titulo: string; mensagem: string; prioridade: "informativo" | "aviso" | "urgente"; paraRole?: Role | null; paraUsuarioId?: string | null; agendadaPara: string }) => Promise<{ ok: boolean; error?: string }>
  markNotificationsRead: () => void
  logChange: (e: Omit<ChangeLog, "id" | "dataHora">) => void
  logAudit: (e: AuditInput) => void
  addQualityNote: (leadId: string, texto: string) => void
  addUser: (u: Omit<User, "id" | "criadoEm">) => { ok: boolean; error?: string }
  updateUser: (id: string, patch: Partial<User>) => { ok: boolean; error?: string }
  updateProfile: (patch: { avatar?: string; senha?: string }) => Promise<{ ok: boolean; error?: string }>
}

const Ctx = createContext<Store | null>(null)

// ---------- Conversores entre o banco (colunas em pt) e o app (camelCase) ----------

function rowToLead(r: any): Lead {
  return {
    id: r.id,
    nome: r.nome ?? "",
    telefone: r.telefone ?? "",
    email: r.email ?? "",
    imovelRef: r.referencia_imovel ?? "",
    referencias: Array.isArray(r.referencias) ? (r.referencias as LeadRef[]) : [],
    temperatura: (r.temperatura ?? "morno") as Temperatura,
    refProposta: r.ref_proposta ?? undefined,
    refFechamento: r.ref_fechamento ?? undefined,
    metaCampaignId: r.meta_campaign_id ?? undefined,
    metaAdsetId: r.meta_adset_id ?? undefined,
    metaAdId: r.meta_ad_id ?? undefined,
    origem: (r.origem ?? "Outro") as Origem,
    observacoes: r.observacoes ?? "",
    status: normalizeStatus(r.status ?? "novo"),
    valorNegociacao: r.valor_proposta ?? undefined,
    corretorId: r.corretor_id ?? "",
    criadoEm: r.criado_em,
    atualizadoEm: r.atualizado_em,
    interacoes: [],
  }
}

function leadPatchToRow(p: Partial<Lead>): Record<string, any> {
  const row: Record<string, any> = {}
  if (p.nome !== undefined) row.nome = p.nome
  if (p.telefone !== undefined) row.telefone = p.telefone
  if (p.email !== undefined) row.email = p.email
  if (p.imovelRef !== undefined) row.referencia_imovel = p.imovelRef
  if (p.referencias !== undefined) row.referencias = p.referencias
  if (p.temperatura !== undefined) row.temperatura = p.temperatura
  if (p.refProposta !== undefined) row.ref_proposta = p.refProposta
  if (p.refFechamento !== undefined) row.ref_fechamento = p.refFechamento
  if (p.metaCampaignId !== undefined) row.meta_campaign_id = p.metaCampaignId || null
  if (p.metaAdsetId !== undefined) row.meta_adset_id = p.metaAdsetId || null
  if (p.metaAdId !== undefined) row.meta_ad_id = p.metaAdId || null
  if (p.origem !== undefined) row.origem = p.origem
  if (p.observacoes !== undefined) row.observacoes = p.observacoes
  if (p.status !== undefined) row.status = p.status
  if (p.valorNegociacao !== undefined) row.valor_proposta = p.valorNegociacao
  if (p.corretorId !== undefined) row.corretor_id = p.corretorId || null
  return row
}

function rowToVisit(r: any): Visit {
  return {
    id: r.id,
    leadId: r.lead_id,
    data: r.data,
    hora: r.horario ?? "",
    corretorId: r.corretor_id ?? "",
    imovelRef: r.referencias ?? "",
    referencias: r.referencias ?? "",
    observacoes: r.observacoes ?? "",
  }
}

function rowToUser(r: any): User {
  return {
    id: r.id,
    nome: r.nome,
    email: r.email,
    senha: r.senha_hash ?? "",
    role: r.role,
    ativo: r.status === "ativo",
    criadoEm: r.criado_em,
    avatar: r.avatar ?? undefined,
  }
}

function rowToNotification(r: any, userId: string): Notification {
  const lidaPor: string[] = Array.isArray(r.lida_por) ? r.lida_por : []
  return {
    id: r.id,
    texto: r.texto,
    titulo: r.titulo ?? null,
    prioridade: r.prioridade ?? null,
    timestamp: r.criado_em,
    read: lidaPor.includes(userId),
    tipo: r.tipo ?? "geral",
    paraRole: r.para_role ?? null,
    paraUsuarioId: r.para_usuario_id ?? null,
    leadId: r.lead_id ?? null,
  }
}

function rowToScheduled(r: any): ScheduledNotification {
  return {
    id: r.id,
    titulo: r.titulo,
    mensagem: r.mensagem,
    prioridade: r.prioridade ?? "informativo",
    paraRole: r.para_role ?? null,
    paraUsuarioId: r.para_usuario_id ?? null,
    agendadaPara: r.agendada_para,
    status: r.status,
    criadoPorNome: r.criado_por_nome,
    criadoEm: r.criado_em,
    enviadaEm: r.enviada_em ?? null,
  }
}

function rowToQuality(r: any): QualityNote {
  return { id: r.id, leadId: r.lead_id, autorId: r.autor_id ?? undefined, autorNome: r.autor_nome, texto: r.texto, criadoEm: r.criado_em }
}

function rowToAudit(r: any): AuditEntry {
  return {
    id: r.id,
    leadId: r.lead_id,
    leadNome: r.lead_nome,
    usuarioNome: r.usuario_nome,
    tipo: r.tipo as AuditTipo,
    descricao: r.descricao,
    referencias: r.referencias,
    criadoEm: r.criado_em,
  }
}

export function LeadsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [leads, setLeads] = useState<Lead[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [sentNotifications, setSentNotifications] = useState<Notification[]>([])
  const [scheduledNotifications, setScheduledNotifications] = useState<ScheduledNotification[]>([])
  const [qualityNotes, setQualityNotes] = useState<QualityNote[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [changeLogs, setChangeLogs] = useState<ChangeLog[]>([])

  const userId = user?.id ?? ""
  const userRole = user?.role ?? "corretor"

  // ---------- Carregamento inicial + Realtime ----------
  const loadLeads = useCallback(async () => {
    const { data } = await supabase.from("leads").select("*").order("criado_em", { ascending: false })
    if (data) setLeads(data.map(rowToLead))
  }, [])
  const loadVisits = useCallback(async () => {
    const { data } = await supabase.from("visitas").select("*")
    if (data) setVisits(data.map(rowToVisit))
  }, [])
  const loadUsers = useCallback(async () => {
    const { data } = await supabase.from("usuarios").select("*").order("criado_em", { ascending: true })
    if (data) setUsers(data.map(rowToUser))
  }, [])
  const loadNotifications = useCallback(async () => {
    if (!userId) return
    // Segmentação por papel: corretor vê as próprias/operacionais; gestor vê gerenciais e de equipe
    let q = supabase.from("notificacoes").select("*").order("criado_em", { ascending: false }).limit(100)
    if (userRole === "gestor") {
      q = q.or(`para_role.eq.gestor,para_role.is.null,para_usuario_id.eq.${userId}`)
    } else {
      q = q.or(`para_usuario_id.eq.${userId},and(para_role.eq.corretor,para_usuario_id.is.null),and(para_role.is.null,para_usuario_id.is.null)`)
    }
    const { data } = await q
    if (data) setNotifications(data.map((r) => rowToNotification(r, userId)))
  }, [userId, userRole])
  const loadAdminNotifications = useCallback(async () => {
    if (userRole !== "gestor") {
      setSentNotifications([])
      setScheduledNotifications([])
      return
    }
    const [{ data: sent }, { data: scheduled }] = await Promise.all([
      supabase.from("notificacoes").select("*").eq("origem", "gestao").order("criado_em", { ascending: false }).limit(100),
      supabase.from("notificacoes_agendadas").select("*").order("agendada_para", { ascending: false }).limit(100),
    ])
    if (sent) setSentNotifications(sent.map((r) => rowToNotification(r, userId)))
    if (scheduled) setScheduledNotifications(scheduled.map(rowToScheduled))
  }, [userId, userRole])
  const loadQuality = useCallback(async () => {
    if (userRole !== "gestor") return setQualityNotes([]) // corretores nunca carregam esse dado
    const { data } = await supabase.from("observacoes_qualidade").select("*").order("criado_em", { ascending: false })
    if (data) setQualityNotes(data.map(rowToQuality))
  }, [userRole])
  const loadAudit = useCallback(async () => {
    if (userRole !== "gestor") return setAudit([])
    const { data } = await supabase.from("auditoria").select("*").order("criado_em", { ascending: false }).limit(1000)
    if (data) setAudit(data.map(rowToAudit))
  }, [userRole])

  const processScheduledNotifications = useCallback(async () => {
    if (userRole !== "gestor") return
    const now = new Date().toISOString()
    const { data: due } = await supabase
      .from("notificacoes_agendadas")
      .select("*")
      .eq("status", "pendente")
      .lte("agendada_para", now)
    if (!due?.length) return
    for (const item of due) {
      const { error } = await supabase.from("notificacoes").insert({
        titulo: item.titulo,
        texto: item.mensagem,
        tipo: "comunicado_gestao",
        prioridade: item.prioridade,
        origem: "gestao",
        criado_por_nome: item.criado_por_nome,
        para_role: item.para_role,
        para_usuario_id: item.para_usuario_id,
      })
      if (!error) {
        await supabase.from("notificacoes_agendadas").update({ status: "enviada", enviada_em: now }).eq("id", item.id).eq("status", "pendente")
      }
    }
    await Promise.all([loadNotifications(), loadAdminNotifications()])
  }, [loadAdminNotifications, loadNotifications, userRole])

  useEffect(() => {
    loadLeads(); loadVisits(); loadUsers(); loadNotifications(); loadAdminNotifications(); loadQuality(); loadAudit(); processScheduledNotifications()

    const canal = supabase
      .channel("crm-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, loadLeads)
      .on("postgres_changes", { event: "*", schema: "public", table: "visitas" }, loadVisits)
      .on("postgres_changes", { event: "*", schema: "public", table: "usuarios" }, loadUsers)
      .on("postgres_changes", { event: "*", schema: "public", table: "notificacoes" }, () => { loadNotifications(); loadAdminNotifications() })
      .on("postgres_changes", { event: "*", schema: "public", table: "notificacoes_agendadas" }, () => { loadAdminNotifications(); processScheduledNotifications() })
      .on("postgres_changes", { event: "*", schema: "public", table: "observacoes_qualidade" }, loadQuality)
      .on("postgres_changes", { event: "*", schema: "public", table: "auditoria" }, loadAudit)
      .subscribe()
    const timer = userRole === "gestor" ? window.setInterval(processScheduledNotifications, 30_000) : undefined

    return () => {
      if (timer) window.clearInterval(timer)
      supabase.removeChannel(canal)
    }
  }, [loadLeads, loadVisits, loadUsers, loadNotifications, loadAdminNotifications, loadQuality, loadAudit, processScheduledNotifications, userRole])

  const userName = (id: string) => users.find((u) => u.id === id)?.nome ?? "—"

  // ---------- Auditoria (persistida) ----------
  const logAudit: Store["logAudit"] = (e) => {
    void supabase.from("auditoria").insert({
      lead_id: e.leadId ?? null,
      lead_nome: e.leadNome ?? null,
      usuario_nome: e.usuarioNome,
      tipo: e.tipo,
      descricao: e.descricao,
      referencias: e.referencias ?? null,
    }).then(() => loadAudit())
  }

  // Log legado (admin/logs) — também gera registro na auditoria persistida
  const logChange: Store["logChange"] = (e) => {
    setChangeLogs((prev) => [
      { ...e, id: `cl${Date.now()}${Math.random().toString(36).slice(2, 6)}`, dataHora: new Date().toISOString() },
      ...prev,
    ])
    if (e.entidade === "lead") {
      logAudit({
        usuarioNome: e.usuario,
        tipo: e.acao === "exclusao" ? "exclusao" : e.acao === "criacao" ? "criacao" : e.campo === "temperatura" ? "temperatura" : e.campo === "corretorId" ? "responsavel" : e.campo === "status" ? "etapa" : "edicao",
        descricao: `${e.campo}: "${e.valorAnterior}" → "${e.valorNovo}"`,
      })
    }
  }

  // ---------- Notificações (persistidas, segmentadas por papel) ----------
  const notify: Store["notify"] = useCallback((texto, opts) => {
    void supabase.from("notificacoes").insert({
      texto,
      tipo: opts?.tipo ?? "geral",
      para_role: opts?.paraRole ?? null,
      para_usuario_id: opts?.paraUsuarioId ?? null,
      lead_id: opts?.leadId ?? null,
    }).then(() => loadNotifications())
  }, [loadNotifications])

  const sendAdminNotification: Store["sendAdminNotification"] = async (input) => {
    if (userRole !== "gestor") return { ok: false, error: "Acesso restrito a gestores." }
    const { error } = await supabase.from("notificacoes").insert({
      titulo: input.titulo.trim(),
      texto: input.mensagem.trim(),
      tipo: "comunicado_gestao",
      prioridade: input.prioridade,
      origem: "gestao",
      criado_por_nome: user?.nome ?? "Gestor",
      para_role: input.paraRole ?? null,
      para_usuario_id: input.paraUsuarioId ?? null,
    })
    if (error) return { ok: false, error: "Não foi possível enviar a notificação." }
    await Promise.all([loadNotifications(), loadAdminNotifications()])
    return { ok: true }
  }

  const scheduleAdminNotification: Store["scheduleAdminNotification"] = async (input) => {
    if (userRole !== "gestor") return { ok: false, error: "Acesso restrito a gestores." }
    if (new Date(input.agendadaPara).getTime() <= Date.now()) return { ok: false, error: "Escolha uma data e hora futuras." }
    const { error } = await supabase.from("notificacoes_agendadas").insert({
      titulo: input.titulo.trim(),
      mensagem: input.mensagem.trim(),
      prioridade: input.prioridade,
      para_role: input.paraRole ?? null,
      para_usuario_id: input.paraUsuarioId ?? null,
      agendada_para: input.agendadaPara,
      criado_por_nome: user?.nome ?? "Gestor",
    })
    if (error) return { ok: false, error: "Não foi possível agendar a notificação." }
    await loadAdminNotifications()
    return { ok: true }
  }

  const markNotificationsRead = useCallback(() => {
    if (!userId) return
    const unread = notifications.filter((n) => !n.read)
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    // Atualiza lida_por de cada notificação não lida
    void (async () => {
      for (const n of unread) {
        const { data } = await supabase.from("notificacoes").select("lida_por").eq("id", n.id).maybeSingle()
        const arr: string[] = Array.isArray(data?.lida_por) ? data!.lida_por : []
        if (!arr.includes(userId)) {
          await supabase.from("notificacoes").update({ lida_por: [...arr, userId] }).eq("id", n.id)
        }
      }
    })()
  }, [notifications, userId])

  // ---------- Ações de LEAD ----------
  const addLead: Store["addLead"] = async (l) => {
    const autor = user?.nome ?? "Sistema"
    const { data } = await supabase.from("leads").insert({
      nome: l.nome,
      telefone: l.telefone,
      email: l.email,
      referencia_imovel: l.imovelRef,
      referencias: l.referencias ?? [],
      temperatura: l.temperatura ?? "morno",
      origem: l.origem,
      observacoes: l.observacoes,
      status: l.status,
      valor_proposta: l.valorNegociacao ?? null,
      corretor_id: l.corretorId || null,
    }).select("id").maybeSingle()
    const leadId = data?.id ?? null
    logAudit({ leadId, leadNome: l.nome, usuarioNome: autor, tipo: "criacao", descricao: `Lead cadastrado (origem: ${l.origem}, temperatura: ${l.temperatura})`, referencias: (l.referencias ?? []).map((r) => r.ref).join(", ") || l.imovelRef })
    notify(`Novo lead cadastrado: ${l.nome} (${autor})`, { tipo: "lead_novo", paraRole: "gestor", leadId })
    if (l.corretorId && l.corretorId !== userId) {
      notify(`Novo lead atribuído a você: ${l.nome}`, { tipo: "lead_novo", paraUsuarioId: l.corretorId, leadId })
    }
    await loadLeads()
  }

  const updateLead: Store["updateLead"] = async (id, patch) => {
    await supabase
      .from("leads")
      .update({ ...leadPatchToRow(patch), atualizado_em: new Date().toISOString() })
      .eq("id", id)
    await loadLeads()
  }

  const deleteLead: Store["deleteLead"] = async (id) => {
    const lead = leads.find((l) => l.id === id)
    await supabase.from("leads").delete().eq("id", id)
    if (lead) {
      const autor = user?.nome ?? "Sistema"
      logAudit({ leadId: id, leadNome: lead.nome, usuarioNome: autor, tipo: "exclusao", descricao: `Lead excluído por ${autor}` })
      notify(`Lead excluído: ${lead.nome} (por ${autor})`, { tipo: "exclusao", paraRole: "gestor", leadId: id })
    }
    await loadLeads()
  }

  const addInteraction: Store["addInteraction"] = (leadId, i) => {
    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? { ...l, atualizadoEm: new Date().toISOString(), interacoes: [...l.interacoes, { ...i, id: `i${Date.now()}`, timestamp: new Date().toISOString() }] }
          : l,
      ),
    )
  }
  const getLead = (id: string) => leads.find((l) => l.id === id)

  // ---------- Visitas ----------
  const addVisit: Store["addVisit"] = async (v) => {
    await supabase.from("visitas").insert({
      lead_id: v.leadId,
      data: v.data,
      horario: v.hora,
      corretor_id: v.corretorId || null,
      referencias: v.referencias ?? v.imovelRef ?? "",
      observacoes: v.observacoes,
    })
    const lead = leads.find((l) => l.id === v.leadId)
    const corretorNome = userName(v.corretorId)
    const refs = v.referencias || v.imovelRef || "—"
    const dataFmt = v.data.split("-").reverse().join("/")
    logAudit({ leadId: v.leadId, leadNome: lead?.nome, usuarioNome: user?.nome ?? corretorNome, tipo: "visita", descricao: `Visita agendada para ${dataFmt} às ${v.hora} (corretor: ${corretorNome})`, referencias: refs })
    // Notificação automática para gestores (Seção 7)
    notify(`Visita agendada: ${corretorNome} · ${lead?.nome ?? "lead"} · Ref: ${refs} · ${dataFmt} às ${v.hora}`, { tipo: "visita", paraRole: "gestor", leadId: v.leadId })
    await loadVisits()
  }

  // ---------- Observações internas de qualidade (somente gestores) ----------
  const addQualityNote: Store["addQualityNote"] = (leadId, texto) => {
    if (userRole !== "gestor" || !texto.trim()) return
    const lead = leads.find((l) => l.id === leadId)
    void supabase.from("observacoes_qualidade").insert({
      lead_id: leadId,
      autor_id: userId || null,
      autor_nome: user?.nome ?? "Gestor",
      texto: texto.trim(),
    }).then(() => loadQuality())
    logAudit({ leadId, leadNome: lead?.nome, usuarioNome: user?.nome ?? "Gestor", tipo: "qualidade", descricao: "Observação interna de qualidade registrada" })
  }

  // ---------- Usuários ----------
  const addUser: Store["addUser"] = (u) => {
    const email = u.email.trim().toLowerCase()
    if (users.some((x) => x.email.toLowerCase() === email)) return { ok: false, error: "E-mail já cadastrado." }
    void supabase.from("usuarios").insert({
      nome: u.nome, email, senha_hash: u.senha, role: u.role, status: u.ativo ? "ativo" : "inativo",
    }).then(() => loadUsers())
    return { ok: true }
  }
  const updateUser: Store["updateUser"] = (id, patch) => {
    const email = patch.email ? patch.email.trim().toLowerCase() : undefined
    if (email && users.some((x) => x.id !== id && x.email.toLowerCase() === email)) return { ok: false, error: "E-mail já cadastrado." }
    const row: Record<string, any> = {}
    if (patch.nome !== undefined) row.nome = patch.nome
    if (email !== undefined) row.email = email
    if (patch.senha !== undefined) row.senha_hash = patch.senha
    if (patch.role !== undefined) row.role = patch.role
    if (patch.avatar !== undefined) row.avatar = patch.avatar
    if (patch.ativo !== undefined) row.status = patch.ativo ? "ativo" : "inativo"
    void supabase.from("usuarios").update(row).eq("id", id).then(() => loadUsers())
    return { ok: true }
  }

  // Perfil do usuário logado (foto/senha)
  const updateProfile: Store["updateProfile"] = async (patch) => {
    if (!userId) return { ok: false, error: "Sessão inválida." }
    const row: Record<string, any> = {}
    if (patch.avatar !== undefined) row.avatar = patch.avatar
    if (patch.senha !== undefined) row.senha_hash = patch.senha
    const { error } = await supabase.from("usuarios").update(row).eq("id", userId)
    if (error) return { ok: false, error: "Não foi possível salvar. Tente novamente." }
    await loadUsers()
    return { ok: true }
  }

  const corretores = users.filter((u) => u.role === "corretor")

  return (
    <Ctx.Provider
      value={{
        leads, visits, notifications, sentNotifications, scheduledNotifications, users, changeLogs, qualityNotes, audit, corretores, userName,
        addLead, updateLead, deleteLead, addInteraction, getLead,
        addVisit, notify, sendAdminNotification, scheduleAdminNotification, markNotificationsRead, logChange, logAudit, addQualityNote,
        addUser, updateUser, updateProfile,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useLeads() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useLeads deve ser usado dentro de LeadsProvider")
  return ctx
}
