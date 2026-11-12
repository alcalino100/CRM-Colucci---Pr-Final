import { supabase } from "../supabase/client"
import type { Lead, Visit } from "../mock-data"
import type { AuditInput, NotifyOpts } from "./types"

export async function executarAddVisit({
  v,
  leads,
  userName,
  userNome,
  loadVisits,
  logAudit,
  notify,
}: {
  v: Omit<Visit, "id">
  leads: Lead[]
  userName: (id: string) => string
  userNome: string
  loadVisits: () => Promise<void>
  logAudit: (e: AuditInput) => void
  notify: (texto: string, opts?: NotifyOpts) => void
}): Promise<void> {
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
  logAudit({
    leadId: v.leadId,
    leadNome: lead?.nome,
    usuarioNome: userNome || corretorNome,
    tipo: "visita",
    descricao: `Visita agendada para ${dataFmt} às ${v.hora} (corretor: ${corretorNome})`,
    referencias: refs,
  })
  notify(
    `Visita agendada: ${corretorNome} · ${lead?.nome ?? "lead"} · Ref: ${refs} · ${dataFmt} às ${v.hora}`,
    {
      tipo: "visita",
      paraRole: "gestor",
      leadId: v.leadId,
    }
  )
  await loadVisits()
}

export async function executarUpdateVisit({
  id,
  patch,
  visits,
  leads,
  userName,
  userNome,
  loadVisits,
  logAudit,
}: {
  id: string
  patch: Partial<Pick<Visit, "data" | "hora" | "referencias" | "observacoes">>
  visits: Visit[]
  leads: Lead[]
  userName: (id: string) => string
  userNome: string
  loadVisits: () => Promise<void>
  logAudit: (e: AuditInput) => void
}): Promise<{ ok: boolean; error?: string }> {
  const visita = visits.find((v) => v.id === id)
  const row: Record<string, unknown> = {}
  if (patch.data !== undefined) row.data = patch.data
  if (patch.hora !== undefined) row.horario = patch.hora
  if (patch.referencias !== undefined) row.referencias = patch.referencias
  if (patch.observacoes !== undefined) row.observacoes = patch.observacoes
  const { error } = await supabase.from("visitas").update(row).eq("id", id)
  if (error) return { ok: false, error: error.message }
  if (visita) {
    const lead = leads.find((l) => l.id === visita.leadId)
    const dataFmt = (patch.data ?? visita.data).split("-").reverse().join("/")
    logAudit({
      leadId: visita.leadId,
      leadNome: lead?.nome,
      usuarioNome: userNome || userName(visita.corretorId),
      tipo: "visita",
      descricao: `Visita reagendada para ${dataFmt} às ${patch.hora ?? visita.hora}`,
      referencias: patch.referencias ?? visita.referencias,
    })
  }
  await loadVisits()
  return { ok: true }
}

export async function executarRemoveVisit({
  id,
  visits,
  leads,
  userName,
  userNome,
  loadVisits,
  updateLead,
  logAudit,
}: {
  id: string
  visits: Visit[]
  leads: Lead[]
  userName: (id: string) => string
  userNome: string
  loadVisits: () => Promise<void>
  updateLead: (id: string, patch: Partial<Lead>) => Promise<{ ok: boolean; error?: string }>
  logAudit: (e: AuditInput) => void
}): Promise<{ ok: boolean; error?: string }> {
  const visita = visits.find((v) => v.id === id)
  const { error } = await supabase.from("visitas").delete().eq("id", id)
  if (error) return { ok: false, error: error.message }
  if (visita) {
    const lead = leads.find((l) => l.id === visita.leadId)
    const dataFmt = visita.data.split("-").reverse().join("/")
    logAudit({
      leadId: visita.leadId,
      leadNome: lead?.nome,
      usuarioNome: userNome || userName(visita.corretorId),
      tipo: "visita",
      descricao: `Visita de ${dataFmt} às ${visita.hora} cancelada; lead retornou para em atendimento`,
      referencias: visita.referencias,
    })
    await updateLead(visita.leadId, { status: "em_atendimento" })
  }
  await loadVisits()
  return { ok: true }
}
