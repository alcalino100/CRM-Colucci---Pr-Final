"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import {
  type AuditEntry,
  type AuditTipo,
  type ChangeLog,
  type Interaction,
  type Lead,
  type LeadRef,
  type LeadStatus,
  type Notification,
  type OperationalJustification,
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
import { normalizePhone, normalizeStatus } from "./labels"

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
  motivo?: string | null
  motivoDetalhe?: string | null
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
  justifications: OperationalJustification[]
  audit: AuditEntry[]
  corretores: User[]
  userName: (id: string) => string
  checkPhoneDuplicate: (phone: string, excludeId?: string) => { nome: string; corretorId: string; status: LeadStatus } | null
  addLead: (l: Omit<Lead, "id" | "criadoEm" | "atualizadoEm" | "interacoes">) => Promise<{ ok: boolean; error?: string }>
  updateLead: (id: string, patch: Partial<Lead>) => Promise<{ ok: boolean; error?: string }>
  deleteLead: (id: string, motivo: string, motivoDetalhe?: string) => Promise<{ ok: boolean; error?: string }>
  addInteraction: (leadId: string, i: Omit<Interaction, "id" | "timestamp">) => void
  getLead: (id: string) => Lead | undefined
  assumirLead: (leadId: string) => Promise<{ ok: boolean; error?: string }>
  addVisit: (v: Omit<Visit, "id">) => void
  notify: (texto: string, opts?: NotifyOpts) => void
  sendAdminNotification: (input: { mensagem: string; paraRole?: Role | null; paraUsuarioId?: string | null }) => Promise<{ ok: boolean; error?: string }>
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
    tipoImovelVendido: r.tipo_imovel_vendido ?? undefined,
    metaCampaignId: r.meta_campaign_id ?? undefined,
    metaAdsetId: r.meta_adset_id ?? undefined,
    metaAdId: r.meta_ad_id ?? undefined,
    utmCampaign: r.utm_campaign ?? undefined,
    utmAdset: r.utm_adset ?? undefined,
    utmAd: r.utm_ad ?? undefined,
    fbc: r.fbc ?? undefined,
    fbp: r.fbp ?? undefined,
    arquivadoEm: r.arquivado_em ?? undefined,
    fechadoEm: r.fechado_em ?? undefined,
    negociandoEm: r.negociando_em ?? undefined,
    origem: (r.origem ?? "Outro") as Origem,
    observacoes: r.observacoes ?? "",
    status: normalizeStatus(r.status ?? "novo"),
    valorNegociacao: r.valor_proposta ?? undefined,
    valorComissao: r.valor_comissao ?? undefined,
    corretorId: r.corretor_id ?? "",
    gestorResponsavel: r.gestor_responsavel ?? undefined,
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
  if (p.tipoImovelVendido !== undefined) row.tipo_imovel_vendido = p.tipoImovelVendido || null
  if (p.metaCampaignId !== undefined) row.meta_campaign_id = p.metaCampaignId || null
  if (p.metaAdsetId !== undefined) row.meta_adset_id = p.metaAdsetId || null
  if (p.metaAdId !== undefined) row.meta_ad_id = p.metaAdId || null
  if (p.utmCampaign !== undefined) row.utm_campaign = p.utmCampaign || null
  if (p.utmAdset !== undefined) row.utm_adset = p.utmAdset || null
  if (p.utmAd !== undefined) row.utm_ad = p.utmAd || null
  if (p.fbc !== undefined) row.fbc = p.fbc || null
  if (p.fbp !== undefined) row.fbp = p.fbp || null
  if (p.origem !== undefined) row.origem = p.origem
  if (p.observacoes !== undefined) row.observacoes = p.observacoes
  if (p.status !== undefined) row.status = p.status
  if (p.valorNegociacao !== undefined) row.valor_proposta = p.valorNegociacao
  if (p.valorComissao !== undefined) row.valor_comissao = p.valorComissao ?? null
  if (p.corretorId !== undefined) row.corretor_id = p.corretorId || null
  if (p.gestorResponsavel !== undefined) row.gestor_responsavel = p.gestorResponsavel || null
  if (p.arquivadoEm !== undefined) row.arquivado_em = p.arquivadoEm || null
  if (p.fechadoEm !== undefined) row.fechado_em = p.fechadoEm || null
  if (p.negociandoEm !== undefined) row.negociando_em = p.negociandoEm || null
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
  // Colunas reais da tabela: mensagem, tipo, usuario_id, criado_por, para_role, para_usuario_id, lead_id, lida_por, lida, timestamp
  return {
    id: r.id,
    texto: r.mensagem ?? "",
    titulo: null,
    prioridade: null,
    criadoPor: r.usuario_id ?? null,
    criadoPorNome: null,
    timestamp: r.timestamp,
    read: lidaPor.includes(userId) || r.lida === true,
    tipo: r.tipo ?? "geral",
    paraRole: r.para_role ?? null,
    paraUsuarioId: r.para_usuario_id ?? null,
    leadId: r.lead_id ?? null,
  }
}

function rowToJustification(r: any): OperationalJustification {
  return {
    id: r.id,
    leadId: r.lead_id,
    motivo: r.motivo,
    observacao: r.observacao ?? undefined,
    etapa: normalizeStatus(r.etapa),
    // A tabela real usa a coluna usuario_id (mantemos fallback p/ esquemas antigos)
    autorId: r.usuario_id ?? r.autor_id ?? "",
    autorNome: r.autor_nome ?? "",
    criadoEm: r.criado_em,
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
    motivo: r.motivo ?? null,
    motivoDetalhe: r.motivo_detalhe ?? null,
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
  const [justifications, setJustifications] = useState<OperationalJustification[]>([])
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
    let q = supabase.from("notificacoes").select("*").order("timestamp", { ascending: false }).limit(100)
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
    // Histórico de comunicados enviados pela gestão (identificados pelo tipo).
    // Agendamento foi desativado: a tabela notificacoes_agendadas não existe no banco.
    const { data: sent } = await supabase
      .from("notificacoes")
      .select("*")
      .eq("tipo", "comunicado_gestao")
      .order("timestamp", { ascending: false })
      .limit(100)
    setScheduledNotifications([])
    if (sent) setSentNotifications(sent.map((r) => rowToNotification(r, userId)))
  }, [userId, userRole])
  const loadJustifications = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase.from("justificativas_operacionais").select("*").order("criado_em", { ascending: false })
    if (data) setJustifications(data.map(rowToJustification))
  }, [userId])
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

  // Agendamento de notificações desativado: o banco não possui a tabela notificacoes_agendadas.
  const processScheduledNotifications = useCallback(async () => {}, [])

  useEffect(() => {
    loadLeads(); loadVisits(); loadUsers(); loadNotifications(); loadAdminNotifications(); loadQuality(); loadAudit()

    const canal = supabase
      .channel("crm-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, loadLeads)
      .on("postgres_changes", { event: "*", schema: "public", table: "visitas" }, loadVisits)
      .on("postgres_changes", { event: "*", schema: "public", table: "usuarios" }, loadUsers)
      .on("postgres_changes", { event: "*", schema: "public", table: "notificacoes" }, () => { loadNotifications(); loadAdminNotifications() })
      .on("broadcast", { event: "refresh" }, () => { loadNotifications(); loadAdminNotifications() })
      .on("postgres_changes", { event: "*", schema: "public", table: "observacoes_qualidade" }, loadQuality)
      .on("postgres_changes", { event: "*", schema: "public", table: "auditoria" }, loadAudit)
      .subscribe()

    return () => {
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
      motivo: e.motivo ?? null,
      motivo_detalhe: e.motivoDetalhe ?? null,
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
      mensagem: texto,
      tipo: opts?.tipo ?? "geral",
      usuario_id: userId ?? null,
      para_role: opts?.paraRole ?? null,
      para_usuario_id: opts?.paraUsuarioId ?? null,
      lead_id: opts?.leadId ?? null,
    }).then(() => loadNotifications())
  }, [loadNotifications, userId])

  const sendAdminNotification: Store["sendAdminNotification"] = async (input) => {
    if (userRole !== "gestor" || !userId) return { ok: false, error: "Acesso restrito a gestores." }
    try {
      const response = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, senderId: userId }),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) return { ok: false, error: result.details ? `${result.error} (${result.details})` : result.error }
      await Promise.all([loadNotifications(), loadAdminNotifications()])
      await supabase.channel("crm-realtime").send({ type: "broadcast", event: "refresh", payload: {} })
      return { ok: true }
    } catch {
      return { ok: false, error: "Falha de conexão ao processar a notificação." }
    }
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
  // Verifica telefone duplicado em toda a base carregada (todos os corretores/gestores).
  const checkPhoneDuplicate: Store["checkPhoneDuplicate"] = (phone, excludeId) => {
    const alvo = normalizePhone(phone)
    if (!alvo) return null
    const found = leads.find((l) => l.id !== excludeId && normalizePhone(l.telefone) === alvo)
    return found ? { nome: found.nome, corretorId: found.corretorId, status: found.status } : null
  }

  // Erro de índice único do banco (telefone duplicado)
  const isPhoneUniqueViolation = (error: any) =>
    error && (error.code === "23505" || /telefone_normalizado/i.test(error.message ?? ""))

  const addLead: Store["addLead"] = async (l) => {
    const autor = user?.nome ?? "Sistema"
    const { data, error } = await supabase.from("leads").insert({
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
    if (error) {
      return { ok: false, error: "Não foi possível cadastrar o lead. Tente novamente." }
    }
    const leadId = data?.id ?? null
    logAudit({ leadId, leadNome: l.nome, usuarioNome: autor, tipo: "criacao", descricao: `Lead cadastrado (origem: ${l.origem}, temperatura: ${l.temperatura})`, referencias: (l.referencias ?? []).map((r) => r.ref).join(", ") || l.imovelRef })
    notify(`Novo lead cadastrado: ${l.nome} (${autor})`, { tipo: "lead_novo", paraRole: "gestor", leadId })
    if (l.corretorId && l.corretorId !== userId) {
      notify(`Novo lead atribuído a você: ${l.nome}`, { tipo: "lead_novo", paraUsuarioId: l.corretorId, leadId })
    }
    await loadLeads()
    return { ok: true }
  }

  const updateLead: Store["updateLead"] = async (id, patch) => {
    const agora = new Date().toISOString()
    const row = leadPatchToRow(patch)
    // Marca a data de fechamento / de negociação quando o lead ENTRAR nessas etapas
    if (patch.status === "fechado" && patch.fechadoEm === undefined) row.fechado_em = agora
    if (patch.status === "negociando" && patch.negociandoEm === undefined) row.negociando_em = agora
    row.atualizado_em = agora
    let { error } = await supabase.from("leads").update(row).eq("id", id)
    // Colunas fechado_em/negociando_em/valor_comissao/utm/fbc ainda não criadas (script 011/012/013 pendente): tenta sem elas
    if (error && String(error.message).includes("does not exist")) {
      delete row.fechado_em
      delete row.negociando_em
      delete row.valor_comissao
      delete row.utm_campaign
      delete row.utm_adset
      delete row.utm_ad
      delete row.fbc
      delete row.fbp
      delete row.tipo_imovel_vendido
      ;({ error } = await supabase.from("leads").update(row).eq("id", id))
    }
    if (error) {
      return { ok: false, error: "Não foi possível salvar as alterações. Tente novamente." }
    }
    await loadLeads()
    return { ok: true }
  }

  const assumirLead: Store["assumirLead"] = async (leadId) => {
    const { error } = await supabase.from("leads").update({ gestor_responsavel: user?.id || null }).eq("id", leadId)
    if (error) return { ok: false, error: error.message }
    await loadLeads()
    return { ok: true }
  }

  const deleteLead: Store["deleteLead"] = async (id, motivo, motivoDetalhe) => {
    // Somente gestores podem excluir leads
    if (user?.role !== "gestor") return { ok: false, error: "Apenas gestores podem excluir leads." }
    const motivoTrim = (motivo ?? "").trim()
    const detalheTrim = (motivoDetalhe ?? "").trim()
    if (!motivoTrim) return { ok: false, error: "Selecione o motivo da exclusão." }
    if (!detalheTrim) return { ok: false, error: "Descreva o motivo da exclusão." }

    const lead = leads.find((l) => l.id === id)
    const autor = user?.nome ?? "Sistema"

    // Registra a auditoria ANTES de excluir, garantindo o rastro mesmo que a exclusão siga
    const { error: auditErr } = await supabase.from("auditoria").insert({
      lead_id: id,
      lead_nome: lead?.nome ?? null,
      usuario_nome: autor,
      tipo: "exclusao",
      descricao: `Lead excluído por ${autor}`,
      motivo: motivoTrim,
      motivo_detalhe: detalheTrim,
    })
    if (auditErr) return { ok: false, error: "Não foi possível registrar a auditoria da exclusão." }

    const { error: delErr } = await supabase.from("leads").delete().eq("id", id)
    if (delErr) return { ok: false, error: "Não foi possível excluir o lead." }

    if (lead) {
      notify(`Lead excluído: ${lead.nome} (por ${autor}) — motivo: ${motivoTrim}`, { tipo: "exclusao", paraRole: "gestor", leadId: id })
    }
    await Promise.all([loadLeads(), loadAudit()])
    return { ok: true }
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

  const addJustification: Store["addJustification"] = async (leadId, motivo, observacao) => {
    const lead = leads.find((item) => item.id === leadId)
    if (!lead || !user || (user.role !== "gestor" && lead.corretorId !== user.id)) return { ok: false, error: "Você não tem permissão para justificar este lead." }
    const cleanReason = motivo.trim()
    const cleanNote = observacao?.trim() ?? ""
    if (!cleanReason || (cleanReason === "Outro" && !cleanNote)) return { ok: false, error: "Informe o motivo e detalhe a opção Outro." }
    const now = new Date().toISOString()
    const { data, error } = await supabase.from("justificativas_operacionais").insert({
      lead_id: leadId,
      motivo: cleanReason,
      observacao: cleanNote || null,
      etapa: lead.status,
      autor_id: user.id,
      autor_nome: user.nome,
    }).select("*").single()
    if (error || !data) return { ok: false, error: error?.message ?? "Não foi possível confirmar a justificativa." }
    const { error: updateError } = await supabase.from("leads").update({ atualizado_em: now }).eq("id", leadId)
    if (updateError) return { ok: false, error: updateError.message }
    logAudit({ leadId, leadNome: lead.nome, usuarioNome: user.nome, tipo: "justificativa", descricao: `Lead parado: ${cleanReason}${cleanNote ? ` — ${cleanNote}` : ""}` })
    setJustifications((current) => [rowToJustification(data), ...current.filter((item) => item.id !== data.id)])
    await loadLeads()
    return { ok: true }
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
        leads, visits, notifications, sentNotifications, scheduledNotifications, users, changeLogs, qualityNotes, justifications, audit, corretores, userName,
        checkPhoneDuplicate, addLead, updateLead, deleteLead, addInteraction, getLead, assumirLead,
        addVisit, notify, sendAdminNotification, markNotificationsRead, logChange, logAudit, addQualityNote, addUser, updateUser, updateProfile,
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
