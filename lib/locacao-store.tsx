"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { type Interaction, type Modulo, type Notification, type Role, type User } from "./mock-data"
import { isCorretorDe, isGestorNivel, modulosRole } from "./roles"
import type { LocacaoLead, LocacaoVisit } from "./locacao-labels"
import { supabase } from "./supabase/client"
import { useAuth } from "./auth-context"
import { normalizePhone } from "./labels"
import { normalizeLocacaoStatus } from "./locacao-labels"

interface NotifyOpts {
  tipo?: string
  modulo?: Modulo | null
  paraRole?: Role | null
  paraUsuarioId?: string | null
  leadId?: string | null
}

interface AuditInput {
  leadId?: string | null
  leadNome?: string | null
  usuarioNome: string
  tipo: string
  descricao: string
  referencias?: string | null
  motivo?: string | null
  motivoDetalhe?: string | null
}

interface Store {
  leads: LocacaoLead[]
  visits: LocacaoVisit[]
  notifications: Notification[]
  users: User[]
  ready: boolean
  corretores: User[]
  userName: (id: string) => string
  checkPhoneDuplicate: (phone: string, excludeId?: string) => { nome: string; corretorId: string; status: string } | null
  addLead: (l: Omit<LocacaoLead, "id" | "criadoEm" | "atualizadoEm" | "interacoes" | "referencias"> & { referencias?: LocacaoLead["referencias"] }) => Promise<{ ok: boolean; error?: string }>
  updateLead: (id: string, patch: Partial<LocacaoLead>) => Promise<{ ok: boolean; error?: string }>
  deleteLead: (id: string, motivo: string, motivoDetalhe?: string) => Promise<{ ok: boolean; error?: string }>
  addInteraction: (leadId: string, i: Omit<Interaction, "id" | "timestamp">) => void
  getLead: (id: string) => LocacaoLead | undefined
  assumirLead: (leadId: string) => Promise<{ ok: boolean; error?: string }>
  addVisit: (v: Omit<LocacaoVisit, "id">) => void
  updateVisit: (id: string, patch: Partial<Pick<LocacaoVisit, "data" | "hora" | "referencias" | "observacoes">>) => Promise<{ ok: boolean; error?: string }>
  removeVisit: (id: string) => Promise<{ ok: boolean; error?: string }>
  notify: (texto: string, opts?: NotifyOpts) => void
  markNotificationsRead: () => void
  logAudit: (e: AuditInput) => void
  logChange: (e: { usuario: string; acao: string; entidade: string; campo: string; valorAnterior: string; valorNovo: string }) => void
}

const Ctx = createContext<Store | null>(null)

// ---------- Conversores ----------

function rowToLead(r: any): LocacaoLead {
  return {
    id: r.id,
    nome: r.nome ?? "",
    telefone: r.telefone ?? "",
    email: r.email ?? "",
    imovelRef: r.referencia_imovel ?? "",
    referencias: Array.isArray(r.referencias) ? r.referencias : [],
    temperatura: (r.temperatura ?? "morno") as LocacaoLead["temperatura"],
    origem: (r.origem ?? "Outro") as LocacaoLead["origem"],
    observacoes: r.observacoes ?? "",
    status: normalizeLocacaoStatus(r.status ?? "novo"),
    tipoImovelDesejado: r.tipo_imovel_desejado ?? "",
    bairrosDesejados: Array.isArray(r.bairros_desejados) ? r.bairros_desejados : [],
    aluguelMax: r.aluguel_max ?? undefined,
    quartos: r.quartos ?? "",
    garantia: r.garantia ?? "",
    valorAluguel: r.valor_proposta ?? undefined,
    valorComissao: r.valor_comissao ?? undefined,
    corretorId: r.corretor_id ?? "",
    gestorResponsavel: r.gestor_responsavel ?? undefined,
    criadoEm: r.criado_em,
    atualizadoEm: r.atualizado_em,
    arquivadoEm: r.arquivado_em ?? undefined,
    locadoEm: r.locado_em ?? undefined,
    negociandoEm: r.negociando_em ?? undefined,
    interacoes: [],
  }
}

function leadPatchToRow(p: Partial<LocacaoLead>): Record<string, any> {
  const row: Record<string, any> = {}
  if (p.nome !== undefined) row.nome = p.nome
  if (p.telefone !== undefined) row.telefone = p.telefone
  if (p.email !== undefined) row.email = p.email
  if (p.imovelRef !== undefined) row.referencia_imovel = p.imovelRef
  if (p.referencias !== undefined) row.referencias = p.referencias
  if (p.temperatura !== undefined) row.temperatura = p.temperatura
  if (p.origem !== undefined) row.origem = p.origem
  if (p.observacoes !== undefined) row.observacoes = p.observacoes
  if (p.status !== undefined) row.status = p.status
  if (p.tipoImovelDesejado !== undefined) row.tipo_imovel_desejado = p.tipoImovelDesejado || null
  if (p.bairrosDesejados !== undefined) row.bairros_desejados = p.bairrosDesejados
  if (p.aluguelMax !== undefined) row.aluguel_max = p.aluguelMax ?? null
  if (p.quartos !== undefined) row.quartos = p.quartos || null
  if (p.garantia !== undefined) row.garantia = p.garantia || null
  if (p.valorAluguel !== undefined) row.valor_proposta = p.valorAluguel ?? null
  if (p.valorComissao !== undefined) row.valor_comissao = p.valorComissao ?? null
  if (p.corretorId !== undefined) row.corretor_id = p.corretorId || null
  if (p.gestorResponsavel !== undefined) row.gestor_responsavel = p.gestorResponsavel || null
  if (p.arquivadoEm !== undefined) row.arquivado_em = p.arquivadoEm || null
  if (p.locadoEm !== undefined) row.locado_em = p.locadoEm || null
  if (p.negociandoEm !== undefined) row.negociando_em = p.negociandoEm || null
  return row
}

function rowToVisit(r: any): LocacaoVisit {
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
    texto: r.mensagem ?? "",
    titulo: null,
    prioridade: null,
    criadoPor: r.usuario_id ?? null,
    criadoPorNome: null,
    timestamp: r.timestamp ?? r.criado_em,
    read: lidaPor.includes(userId) || r.lida === true,
    tipo: r.tipo ?? "geral",
    modulo: r.modulo ?? null,
    paraRole: r.para_role ?? null,
    paraUsuarioId: r.para_usuario_id ?? null,
    leadId: r.lead_id ?? null,
  }
}

export function LocacaoProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [leads, setLeads] = useState<LocacaoLead[]>([])
  const [visits, setVisits] = useState<LocacaoVisit[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [ready, setReady] = useState(false)

  const userId = user?.id ?? ""
  const userRole = user?.role ?? "corretor"

  // ---------- Carregamento inicial + Realtime ----------
  const loadLeads = useCallback(async () => {
    const { data } = await supabase.from("locacao_leads").select("*").order("criado_em", { ascending: false })
    if (data) setLeads(data.map(rowToLead))
  }, [])
  const loadVisits = useCallback(async () => {
    const { data } = await supabase.from("locacao_visitas").select("*")
    if (data) setVisits(data.map(rowToVisit))
  }, [])
  const loadUsers = useCallback(async () => {
    const { data } = await supabase.from("usuarios").select("*").order("criado_em", { ascending: true })
    if (data) setUsers(data.map(rowToUser))
  }, [])
  const loadNotifications = useCallback(async () => {
    if (!userId) return
    let q = supabase.from("notificacoes").select("*").order("timestamp", { ascending: false }).limit(100)
    if (isGestorNivel(userRole)) {
      q = q.or(`para_role.eq.gestor,para_role.is.null,para_usuario_id.eq.${userId}`)
    } else {
      q = q.or(`para_usuario_id.eq.${userId},and(para_role.eq.corretor,para_usuario_id.is.null),and(para_role.is.null,para_usuario_id.is.null)`)
    }
    const { data } = await q
    if (data) {
      // Compartimentação por módulo: só aparecem notificações do módulo do usuário
      const mods = modulosRole(userRole)
      setNotifications(
        data
          .map((r) => rowToNotification(r, userId))
          .filter((n) => !n.modulo || mods.includes(n.modulo)),
      )
    }
  }, [userId, userRole])

  useEffect(() => {
    void loadLeads().finally(() => setReady(true))
    loadVisits(); loadUsers(); loadNotifications()

    const canal = supabase
      .channel("crm-realtime-locacao")
      .on("postgres_changes", { event: "*", schema: "public", table: "locacao_leads" }, loadLeads)
      .on("postgres_changes", { event: "*", schema: "public", table: "locacao_visitas" }, loadVisits)
      .on("postgres_changes", { event: "*", schema: "public", table: "usuarios" }, loadUsers)
      .on("postgres_changes", { event: "*", schema: "public", table: "notificacoes" }, loadNotifications)
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [loadLeads, loadVisits, loadUsers, loadNotifications])

  const userName = (id: string) => users.find((u) => u.id === id)?.nome ?? "—"
  const corretores = users.filter((u) => isCorretorDe(u.role, "locacao"))

  // ---------- Auditoria (compartilhada com vendas, tipo prefixado) ----------
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
    })
  }

  const logChange: Store["logChange"] = (e) => {
    logAudit({
      usuarioNome: e.usuario,
      tipo: e.acao === "exclusao" ? "exclusao" : e.acao === "criacao" ? "criacao" : e.campo === "temperatura" ? "temperatura" : e.campo === "corretorId" ? "responsavel" : e.campo === "status" ? "etapa" : "edicao",
      descricao: `${e.campo}: "${e.valorAnterior}" → "${e.valorNovo}"`,
    })
  }

  // ---------- Notificações ----------
  const notify: Store["notify"] = useCallback((texto, opts) => {
    void supabase.from("notificacoes").insert({
      mensagem: texto,
      tipo: opts?.tipo ?? "geral",
      modulo: opts?.modulo ?? "locacao",
      usuario_id: userId ?? null,
      para_role: opts?.paraRole ?? null,
      para_usuario_id: opts?.paraUsuarioId ?? null,
      lead_id: opts?.leadId ?? null,
    }).then(() => loadNotifications())
  }, [loadNotifications, userId])

  const markNotificationsRead = useCallback(() => {
    if (!userId) return
    const unread = notifications.filter((n) => !n.read)
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
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
  const checkPhoneDuplicate: Store["checkPhoneDuplicate"] = (phone, excludeId) => {
    const alvo = normalizePhone(phone)
    if (!alvo) return null
    const found = leads.find((l) => l.id !== excludeId && normalizePhone(l.telefone) === alvo)
    return found ? { nome: found.nome, corretorId: found.corretorId, status: found.status } : null
  }

  const addLead: Store["addLead"] = async (l) => {
    const autor = user?.nome ?? "Sistema"
    const { data, error } = await supabase.from("locacao_leads").insert({
      nome: l.nome,
      telefone: l.telefone,
      email: l.email,
      referencia_imovel: l.imovelRef,
      referencias: l.referencias ?? [],
      temperatura: l.temperatura ?? "morno",
      origem: l.origem,
      observacoes: l.observacoes,
      status: l.status,
      tipo_imovel_desejado: l.tipoImovelDesejado,
      bairros_desejados: l.bairrosDesejados ?? [],
      aluguel_max: l.aluguelMax ?? null,
      quartos: l.quartos,
      garantia: l.garantia,
      corretor_id: l.corretorId || null,
    }).select("id").maybeSingle()
    if (error) return { ok: false, error: "Não foi possível cadastrar o lead de locação. Tente novamente." }
    const leadId = data?.id ?? null
    logAudit({ leadId, leadNome: l.nome, usuarioNome: autor, tipo: "locacao_criacao", descricao: `Lead de locação cadastrado (origem: ${l.origem})` })
    notify(`Novo lead de locação: ${l.nome} (${autor})`, { tipo: "locacao_lead_novo", paraRole: "gestor", leadId })
    if (l.corretorId && l.corretorId !== userId) {
      notify(`Novo lead de locação atribuído a você: ${l.nome}`, { tipo: "locacao_lead_novo", paraUsuarioId: l.corretorId, leadId })
    }
    await loadLeads()
    return { ok: true }
  }

  const updateLead: Store["updateLead"] = async (id, patch) => {
    const agora = new Date().toISOString()
    const row = leadPatchToRow(patch)
    if (patch.status === "locado" && patch.locadoEm === undefined) row.locado_em = agora
    if (patch.status === "negociando" && patch.negociandoEm === undefined) row.negociando_em = agora
    row.atualizado_em = agora
    const { error } = await supabase.from("locacao_leads").update(row).eq("id", id)
    if (error) return { ok: false, error: "Não foi possível salvar as alterações. Tente novamente." }
    await loadLeads()
    return { ok: true }
  }

  const assumirLead: Store["assumirLead"] = async (leadId) => {
    const { error } = await supabase.from("locacao_leads").update({ gestor_responsavel: user?.id || null }).eq("id", leadId)
    if (error) return { ok: false, error: error.message }
    await loadLeads()
    return { ok: true }
  }

  const deleteLead: Store["deleteLead"] = async (id, motivo, motivoDetalhe) => {
    if (!isGestorNivel(user?.role ?? "corretor")) return { ok: false, error: "Apenas gestores podem excluir leads." }
    const motivoTrim = (motivo ?? "").trim()
    const detalheTrim = (motivoDetalhe ?? "").trim()
    if (!motivoTrim) return { ok: false, error: "Selecione o motivo da exclusão." }
    if (!detalheTrim) return { ok: false, error: "Descreva o motivo da exclusão." }
    const lead = leads.find((l) => l.id === id)
    const autor = user?.nome ?? "Sistema"
    await supabase.from("auditoria").insert({
      lead_id: id,
      lead_nome: lead?.nome ?? null,
      usuario_nome: autor,
      tipo: "locacao_exclusao",
      descricao: `Lead de locação excluído por ${autor}`,
      motivo: motivoTrim,
      motivo_detalhe: detalheTrim,
    })
    const { error: delErr } = await supabase.from("locacao_leads").delete().eq("id", id)
    if (delErr) return { ok: false, error: "Não foi possível excluir o lead." }
    if (lead) notify(`Lead de locação excluído: ${lead.nome} (por ${autor})`, { tipo: "locacao_exclusao", paraRole: "gestor", leadId: id })
    await loadLeads()
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
    await supabase.from("locacao_visitas").insert({
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
    logAudit({ leadId: v.leadId, leadNome: lead?.nome, usuarioNome: user?.nome ?? corretorNome, tipo: "locacao_visita", descricao: `Visita de locação agendada para ${dataFmt} às ${v.hora} (corretor: ${corretorNome})`, referencias: refs })
    notify(`Visita de locação: ${corretorNome} · ${lead?.nome ?? "lead"} · Ref: ${refs} · ${dataFmt} às ${v.hora}`, { tipo: "locacao_visita", paraRole: "gestor", leadId: v.leadId })
    await loadVisits()
  }

  const updateVisit: Store["updateVisit"] = async (id, patch) => {
    const visita = visits.find((v) => v.id === id)
    const row: Record<string, unknown> = {}
    if (patch.data !== undefined) row.data = patch.data
    if (patch.hora !== undefined) row.horario = patch.hora
    if (patch.referencias !== undefined) row.referencias = patch.referencias
    if (patch.observacoes !== undefined) row.observacoes = patch.observacoes
    const { error } = await supabase.from("locacao_visitas").update(row).eq("id", id)
    if (error) return { ok: false, error: error.message }
    if (visita) {
      const lead = leads.find((l) => l.id === visita.leadId)
      const dataFmt = (patch.data ?? visita.data).split("-").reverse().join("/")
      logAudit({ leadId: visita.leadId, leadNome: lead?.nome, usuarioNome: user?.nome ?? userName(visita.corretorId), tipo: "locacao_visita", descricao: `Visita de locação reagendada para ${dataFmt} às ${patch.hora ?? visita.hora}`, referencias: patch.referencias ?? visita.referencias })
    }
    await loadVisits()
    return { ok: true }
  }

  const removeVisit: Store["removeVisit"] = async (id) => {
    const visita = visits.find((v) => v.id === id)
    const { error } = await supabase.from("locacao_visitas").delete().eq("id", id)
    if (error) return { ok: false, error: error.message }
    if (visita) {
      const lead = leads.find((l) => l.id === visita.leadId)
      const dataFmt = visita.data.split("-").reverse().join("/")
      logAudit({ leadId: visita.leadId, leadNome: lead?.nome, usuarioNome: user?.nome ?? userName(visita.corretorId), tipo: "locacao_visita", descricao: `Visita de locação de ${dataFmt} às ${visita.hora} cancelada; lead retornou para em atendimento`, referencias: visita.referencias })
      await updateLead(visita.leadId, { status: "em_atendimento" })
    }
    await loadVisits()
    return { ok: true }
  }

  const value = useMemo(
    () => ({
      leads, visits, notifications, users, ready, corretores, userName,
      checkPhoneDuplicate, addLead, updateLead, deleteLead, addInteraction, getLead, assumirLead,
      addVisit, updateVisit, removeVisit, notify, markNotificationsRead, logAudit, logChange,
    }),
    [leads, visits, notifications, users, ready, corretores, userName,
      checkPhoneDuplicate, addLead, updateLead, deleteLead, addInteraction, getLead, assumirLead,
      addVisit, updateVisit, removeVisit, notify, markNotificationsRead, logAudit, logChange],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLocacao() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useLocacao deve ser usado dentro de LocacaoProvider")
  return ctx
}
