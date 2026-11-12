"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { logger } from "@/lib/logger"
import type {
  AuditEntry,
  ChangeLog,
  Interaction,
  Lead,
  Notification,
  OperationalJustification,
  QualityNote,
  ScheduledNotification,
  User,
  Visit,
} from "./mock-data"
import { isCorretorDe, isGestorNivel, isSomenteLeitura } from "./roles"
import { supabase } from "./supabase/client"
import { useAuth } from "./auth-context"
import { normalizePhone } from "./labels"
import type { Store, NotifyOpts, AuditInput } from "./leads-store/types"
import {
  rowToLead,
  leadPatchToRow,
  rowToVisit,
  rowToUser,
  rowToNotification,
  rowToJustification,
  rowToQuality,
  rowToAudit,
  extrairMetaArquivado,
  isPhoneUniqueViolation,
} from "./leads-store/mappers"
import {
  executarArquivarLeadComData,
  executarDesarquivarLead,
} from "./leads-store/hibernacao"
import {
  executarAddVisit,
  executarUpdateVisit,
  executarRemoveVisit,
} from "./leads-store/visits"
import {
  executarAddUser,
  executarUpdateUser,
  executarUpdateProfile,
} from "./leads-store/users"
import {
  executarAddLead,
  executarUpdateLead,
  executarUpdateLeadsBulk,
  executarDeleteLead,
  executarAddJustification,
} from "./leads-store/lead-mutations"
import {
  fetchUserNotifications,
  fetchAdminSentNotifications,
  enviarNotificacaoGeral,
  enviarNotificacaoAdmin,
  persistirNotificacoesLidas,
} from "./leads-store/notifications"
import {
  LEAD_COLUMNS,
  VISITAS_COLUMNS,
  JUSTIFICATIVAS_COLUMNS,
  OBSERVACOES_QUALIDADE_COLUMNS,
  AUDITORIA_COLUMNS,
} from "@/lib/supabase/projections"

export type { Store, NotifyOpts, AuditInput }
export {
  rowToLead,
  leadPatchToRow,
  rowToVisit,
  rowToUser,
  rowToNotification,
  rowToJustification,
  rowToQuality,
  rowToAudit,
  extrairMetaArquivado,
  isPhoneUniqueViolation,
}

const Ctx = createContext<Store | null>(null)

export function LeadsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [leads, setLeads] = useState<Lead[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [sentNotifications, setSentNotifications] = useState<Notification[]>([])
  const [scheduledNotifications] = useState<ScheduledNotification[]>([])
  const [qualityNotes, setQualityNotes] = useState<QualityNote[]>([])
  const [justifications, setJustifications] = useState<OperationalJustification[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [changeLogs, setChangeLogs] = useState<ChangeLog[]>([])
  const [ready, setReady] = useState(false)

  const userId = user?.id ?? ""
  const userRole = user?.role ?? "corretor"

  // ---------- Carregamento inicial + Realtime ----------
  const loadLeads = useCallback(async () => {
    const { data } = await supabase.from("leads").select(LEAD_COLUMNS).order("criado_em", { ascending: false })
    if (data) setLeads(data.map(rowToLead))
  }, [])

  const loadVisits = useCallback(async () => {
    const { data } = await supabase.from("visitas").select(VISITAS_COLUMNS)
    if (data) setVisits(data.map(rowToVisit))
  }, [])

  const loadUsers = useCallback(async () => {
    // Não seleciona senha_hash: a senha nunca deve trafegar para o navegador.
    const { data } = await supabase
      .from("usuarios")
      .select("id, nome, email, role, status, avatar, criado_em")
      .order("criado_em", { ascending: true })
    if (data) setUsers(data.map(rowToUser))
  }, [])

  const loadNotifications = useCallback(async () => {
    const list = await fetchUserNotifications({ userId, userRole })
    setNotifications(list)
  }, [userId, userRole])

  const loadAdminNotifications = useCallback(async () => {
    const sent = await fetchAdminSentNotifications({ userId, userRole })
    setSentNotifications(sent)
  }, [userId, userRole])

  const loadJustifications = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from("justificativas_operacionais")
      .select(JUSTIFICATIVAS_COLUMNS)
      .order("criado_em", { ascending: false })
    if (data) setJustifications(data.map(rowToJustification))
  }, [userId])

  const loadQuality = useCallback(async () => {
    if (!isGestorNivel(userRole)) return setQualityNotes([])
    const { data } = await supabase
      .from("observacoes_qualidade")
      .select(OBSERVACOES_QUALIDADE_COLUMNS)
      .order("criado_em", { ascending: false })
    if (data) setQualityNotes(data.map(rowToQuality))
  }, [userRole])

  const loadAudit = useCallback(async () => {
    if (!isGestorNivel(userRole)) return setAudit([])
    const { data } = await supabase
      .from("auditoria")
      .select(AUDITORIA_COLUMNS)
      .order("criado_em", { ascending: false })
      .limit(1000)
    if (data) setAudit(data.map(rowToAudit))
  }, [userRole])

  useEffect(() => {
    void loadLeads().finally(() => setReady(true))
    loadVisits()
    loadUsers()
    loadNotifications()
    loadAdminNotifications()
    loadQuality()
    loadAudit()

    const canal = supabase
      .channel("crm-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, (payload: any) => {
        if (payload?.eventType === "INSERT" && payload.new) {
          const newLead = rowToLead(payload.new)
          setLeads((prev) => (prev.some((l) => l.id === newLead.id) ? prev : [newLead, ...prev]))
        } else if (payload?.eventType === "UPDATE" && payload.new) {
          const updatedLead = rowToLead(payload.new)
          setLeads((prev) => {
            const semEle = prev.filter((l) => l.id !== updatedLead.id)
            return [updatedLead, ...semEle]
          })
        } else if (payload?.eventType === "DELETE" && payload.old?.id) {
          const id = payload.old.id
          setLeads((prev) => prev.filter((l) => l.id !== id))
        } else {
          loadLeads()
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "visitas" }, loadVisits)
      .on("postgres_changes", { event: "*", schema: "public", table: "usuarios" }, loadUsers)
      .on("postgres_changes", { event: "*", schema: "public", table: "notificacoes" }, () => {
        loadNotifications()
        loadAdminNotifications()
      })
      .on("broadcast", { event: "refresh" }, () => {
        loadNotifications()
        loadAdminNotifications()
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "observacoes_qualidade" }, loadQuality)
      .on("postgres_changes", { event: "*", schema: "public", table: "auditoria" }, loadAudit)
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [
    loadLeads,
    loadVisits,
    loadUsers,
    loadNotifications,
    loadAdminNotifications,
    loadQuality,
    loadAudit,
    userRole,
  ])

  const userName = (id: string) => users.find((u) => u.id === id)?.nome ?? "—"

  // ---------- Auditoria (persistida) ----------
  const logAudit: Store["logAudit"] = (e) => {
    void supabase
      .from("auditoria")
      .insert({
        lead_id: e.leadId ?? null,
        lead_nome: e.leadNome ?? null,
        usuario_nome: e.usuarioNome,
        tipo: e.tipo,
        descricao: e.descricao,
        referencias: e.referencias ?? null,
        motivo: e.motivo ?? null,
        motivo_detalhe: e.motivoDetalhe ?? null,
      })
      .then(
        () => loadAudit(),
        (err) => logger.warn("[auditoria] falha ao gravar", { error: err?.message ?? err })
      )
  }

  // Log legado (admin/logs) — também gera registro na auditoria persistida
  const logChange: Store["logChange"] = (e) => {
    setChangeLogs((prev) => [
      {
        ...e,
        id: `cl${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
        dataHora: new Date().toISOString(),
      },
      ...prev,
    ])
    if (e.entidade === "lead") {
      logAudit({
        usuarioNome: e.usuario,
        tipo:
          e.acao === "exclusao"
            ? "exclusao"
            : e.acao === "criacao"
              ? "criacao"
              : e.campo === "temperatura"
                ? "temperatura"
                : e.campo === "corretorId"
                  ? "responsavel"
                  : e.campo === "status"
                    ? "etapa"
                    : "edicao",
        descricao: `${e.campo}: "${e.valorAnterior}" → "${e.valorNovo}"`,
      })
    }
  }

  // ---------- Notificações ----------
  const notify: Store["notify"] = useCallback(
    (texto, opts) => {
      enviarNotificacaoGeral({ texto, opts, userId, onInserted: loadNotifications })
    },
    [loadNotifications, userId]
  )

  const sendAdminNotification: Store["sendAdminNotification"] = async (input) => {
    return enviarNotificacaoAdmin({
      input,
      userId,
      userRole,
      onSuccess: async () => {
        await Promise.all([loadNotifications(), loadAdminNotifications()])
      },
    })
  }

  const markNotificationsRead = useCallback(() => {
    if (!userId) return
    const unread = notifications.filter((n) => !n.read)
    if (!unread.length) return
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    void persistirNotificacoesLidas({ unreadIds: unread.map((n) => n.id), userId })
  }, [notifications, userId])

  // ---------- Ações de LEAD ----------
  const checkPhoneDuplicate: Store["checkPhoneDuplicate"] = (phone, excludeId) => {
    const alvo = normalizePhone(phone)
    if (!alvo) return null
    const found = leads.find((l) => l.id !== excludeId && normalizePhone(l.telefone) === alvo)
    return found ? { nome: found.nome, corretorId: found.corretorId, status: found.status } : null
  }

  const addLead: Store["addLead"] = async (l) => {
    if (isSomenteLeitura(userRole)) return { ok: false, error: "Modo apresentação: somente leitura." }
    return executarAddLead({
      l,
      userNome: user?.nome ?? "Sistema",
      userId,
      logAudit,
      notify,
      loadLeads,
    })
  }

  const updateLead: Store["updateLead"] = async (id, patch) => {
    if (isSomenteLeitura(userRole)) return { ok: false, error: "Modo apresentação: somente leitura." }
    return executarUpdateLead({ id, patch, loadLeads })
  }

  const updateLeadsBulk: Store["updateLeadsBulk"] = async (ids, patch) => {
    if (isSomenteLeitura(userRole)) return { ok: false, error: "Modo apresentação: somente leitura." }
    return executarUpdateLeadsBulk({ ids, patch, loadLeads })
  }

  const assumirLead: Store["assumirLead"] = async (leadId) => {
    const { error } = await supabase
      .from("leads")
      .update({ gestor_responsavel: user?.id || null })
      .eq("id", leadId)
    if (error) return { ok: false, error: error.message }
    await loadLeads()
    return { ok: true }
  }

  const deleteLead: Store["deleteLead"] = async (id, motivo, motivoDetalhe) => {
    if (isSomenteLeitura(userRole)) return { ok: false, error: "Modo apresentação: somente leitura." }
    return executarDeleteLead({
      id,
      motivo,
      motivoDetalhe,
      leads,
      userRole: user?.role,
      userNome: user?.nome,
      loadLeads,
      loadAudit,
      notify,
    })
  }

  const addInteraction: Store["addInteraction"] = (leadId, i) => {
    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? {
              ...l,
              atualizadoEm: new Date().toISOString(),
              interacoes: [
                ...l.interacoes,
                { ...i, id: `i${Date.now()}`, timestamp: new Date().toISOString() },
              ],
            }
          : l
      )
    )
  }

  const getLead = (id: string) => leads.find((l) => l.id === id)

  // ---------- Visitas ----------
  const addVisit: Store["addVisit"] = async (v) => {
    if (isSomenteLeitura(userRole)) return { ok: false, error: "Modo apresentação: somente leitura." }
    return executarAddVisit({
      v,
      leads,
      userName,
      userNome: user?.nome ?? userName(v.corretorId),
      loadVisits,
      logAudit,
      notify,
    })
  }

  const updateVisit: Store["updateVisit"] = async (id, patch) => {
    return executarUpdateVisit({
      id,
      patch,
      visits,
      leads,
      userName,
      userNome: user?.nome ?? "",
      loadVisits,
      logAudit,
    })
  }

  const removeVisit: Store["removeVisit"] = async (id) => {
    return executarRemoveVisit({
      id,
      visits,
      leads,
      userName,
      userNome: user?.nome ?? "",
      loadVisits,
      updateLead,
      logAudit,
    })
  }

  const addJustification: Store["addJustification"] = async (leadId, motivo, observacao) => {
    if (!user) return { ok: false, error: "Sessão inválida." }
    return executarAddJustification({
      leadId,
      motivo,
      observacao,
      leads,
      userId: user.id,
      userRole: user.role,
      userNome: user.nome,
      loadLeads,
      logAudit,
      setJustifications,
    })
  }

  // ---------- Observações internas de qualidade (somente gestores) ----------
  const addQualityNote: Store["addQualityNote"] = (leadId, texto) => {
    if (!isGestorNivel(userRole) || !texto.trim()) return
    const lead = leads.find((l) => l.id === leadId)
    void supabase
      .from("observacoes_qualidade")
      .insert({
        lead_id: leadId,
        autor_id: userId || null,
        autor_nome: user?.nome ?? "Gestor",
        texto: texto.trim(),
      })
      .then(() => loadQuality())
    logAudit({
      leadId,
      leadNome: lead?.nome,
      usuarioNome: user?.nome ?? "Gestor",
      tipo: "qualidade",
      descricao: "Observação interna de qualidade registrada",
    })
  }

  // ---------- Usuários ----------
  const addUser: Store["addUser"] = async (u) => {
    return executarAddUser({ u, userRole, users, loadUsers })
  }

  const updateUser: Store["updateUser"] = async (id, patch) => {
    return executarUpdateUser({ id, patch, userRole, users, loadUsers })
  }

  const updateProfile: Store["updateProfile"] = async (patch) => {
    return executarUpdateProfile({ userId, patch, loadUsers })
  }

  // Arquivar lead com data de reaparecimento (hibernação programada)
  const arquivarLeadComData: Store["arquivarLeadComData"] = async (id, params) => {
    if (isSomenteLeitura(userRole)) return { ok: false, error: "Modo apresentação: somente leitura." }
    const lead = leads.find((l) => l.id === id)
    return executarArquivarLeadComData({
      id,
      params,
      lead,
      userId,
      userNome: user?.nome ?? "Usuário",
      updateLead,
      logAudit,
      notify,
    })
  }

  // Desarquivar lead manualmente
  const desarquivarLead: Store["desarquivarLead"] = async (id) => {
    if (isSomenteLeitura(userRole)) return { ok: false, error: "Modo apresentação: somente leitura." }
    const lead = leads.find((l) => l.id === id)
    return executarDesarquivarLead({
      id,
      lead,
      userId,
      userNome: user?.nome ?? "Usuário",
      updateLead,
      logAudit,
      notify,
    })
  }

  const corretores = users.filter((u) => isCorretorDe(u.role, "vendas"))

  return (
    <Ctx.Provider
      value={{
        leads,
        visits,
        notifications,
        sentNotifications,
        scheduledNotifications,
        users,
        changeLogs,
        qualityNotes,
        justifications,
        audit,
        ready,
        corretores,
        userName,
        checkPhoneDuplicate,
        addLead,
        updateLead,
        updateLeadsBulk,
        deleteLead,
        addInteraction,
        getLead,
        assumirLead,
        addVisit,
        updateVisit,
        removeVisit,
        notify,
        sendAdminNotification,
        markNotificationsRead,
        logChange,
        logAudit,
        addQualityNote,
        addJustification,
        addUser,
        updateUser,
        updateProfile,
        arquivarLeadComData,
        desarquivarLead,
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
