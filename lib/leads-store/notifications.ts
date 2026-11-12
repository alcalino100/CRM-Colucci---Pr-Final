import { supabase } from "../supabase/client"
import { isGestorNivel, modulosRole } from "../roles"
import { logger } from "@/lib/logger"
import { NOTIFICACOES_COLUMNS } from "@/lib/supabase/projections"
import type { Notification, Role, Modulo } from "../mock-data"
import type { NotifyOpts } from "./types"
import { rowToNotification } from "./mappers"

export async function fetchUserNotifications({
  userId,
  userRole,
}: {
  userId: string
  userRole: Role
}): Promise<Notification[]> {
  if (!userId) return []
  let q = supabase.from("notificacoes").select(NOTIFICACOES_COLUMNS).order("timestamp", { ascending: false }).limit(100)
  if (isGestorNivel(userRole)) {
    q = q.or(`para_role.eq.gestor,para_role.is.null,para_usuario_id.eq.${userId}`)
  } else {
    q = q.or(
      `para_usuario_id.eq.${userId},and(para_role.eq.corretor,para_usuario_id.is.null),and(para_role.is.null,para_usuario_id.is.null)`
    )
  }
  const { data } = await q
  if (!data) return []
  const mods = modulosRole(userRole)
  return data
    .map((r) => rowToNotification(r, userId))
    .filter((n) => !n.modulo || mods.includes(n.modulo))
}

export async function fetchAdminSentNotifications({
  userId,
  userRole,
}: {
  userId: string
  userRole: Role
}): Promise<Notification[]> {
  if (!isGestorNivel(userRole)) return []
  const { data: sent } = await supabase
    .from("notificacoes")
    .select(NOTIFICACOES_COLUMNS)
    .eq("tipo", "comunicado_gestao")
    .order("timestamp", { ascending: false })
    .limit(100)
  if (!sent) return []
  return sent.map((r) => rowToNotification(r, userId))
}

export async function enviarNotificacaoGeral({
  texto,
  opts,
  userId,
  onInserted,
}: {
  texto: string
  opts?: NotifyOpts
  userId: string
  onInserted: () => void
}): Promise<void> {
  void supabase
    .from("notificacoes")
    .insert({
      mensagem: texto,
      tipo: opts?.tipo ?? "geral",
      modulo: opts?.modulo ?? "vendas",
      usuario_id: userId ?? null,
      para_role: opts?.paraRole ?? null,
      para_usuario_id: opts?.paraUsuarioId ?? null,
      lead_id: opts?.leadId ?? null,
    })
    .then(() => onInserted())
}

export async function enviarNotificacaoAdmin({
  input,
  userId,
  userRole,
  onSuccess,
}: {
  input: { mensagem: string; modulo?: Modulo | null; paraRole?: Role | null; paraUsuarioId?: string | null }
  userId: string
  userRole: Role
  onSuccess: () => Promise<void>
}): Promise<{ ok: boolean; error?: string }> {
  if (!isGestorNivel(userRole) || !userId) return { ok: false, error: "Acesso restrito a gestores." }
  try {
    const response = await fetch("/api/admin/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, senderId: userId }),
    })
    const result = await response.json()
    if (!response.ok || !result.ok) {
      return {
        ok: false,
        error: result.details ? `${result.error} (${result.details})` : result.error,
      }
    }
    await onSuccess()
    await supabase.channel("crm-realtime").send({ type: "broadcast", event: "refresh", payload: {} })
    return { ok: true }
  } catch {
    return { ok: false, error: "Falha de conexão ao processar a notificação." }
  }
}

export async function persistirNotificacoesLidas({
  unreadIds,
  userId,
}: {
  unreadIds: string[]
  userId: string
}): Promise<void> {
  if (!unreadIds.length || !userId) return
  try {
    const { data } = await supabase.from("notificacoes").select("id, lida_por").in("id", unreadIds)
    const updates = (data ?? [])
      .map((row: any) => {
        const arr: string[] = Array.isArray(row.lida_por) ? row.lida_por : []
        if (!arr.includes(userId)) {
          return supabase
            .from("notificacoes")
            .update({ lida_por: [...arr, userId], lida: true })
            .eq("id", row.id)
        }
        return null
      })
      .filter(Boolean)
    if (updates.length) {
      await Promise.all(updates)
    }
  } catch (err) {
    logger.warn("[notificacoes] falha ao marcar lidas", { error: err })
  }
}
