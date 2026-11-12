import { supabase } from "../supabase/client"
import { isTelefoneBloqueado } from "../telefones-bloqueados"
import { isGestorNivel } from "../roles"
import type { Lead, OperationalJustification, Role } from "../mock-data"
import type { AuditInput, NotifyOpts } from "./types"
import { leadPatchToRow, rowToJustification } from "./mappers"

export async function executarAddLead({
  l,
  userNome,
  userId,
  logAudit,
  notify,
  loadLeads,
}: {
  l: Omit<Lead, "id" | "criadoEm" | "atualizadoEm" | "interacoes">
  userNome: string
  userId: string
  logAudit: (e: AuditInput) => void
  notify: (texto: string, opts?: NotifyOpts) => void
  loadLeads: () => Promise<void>
}): Promise<{ ok: boolean; error?: string }> {
  if (isTelefoneBloqueado(l.telefone)) {
    return { ok: false, error: "Telefone interno da empresa não pode ser cadastrado como lead." }
  }
  const autor = userNome || "Sistema"
  const { data, error } = await supabase
    .from("leads")
    .insert({
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
    })
    .select("id")
    .maybeSingle()
  if (error) {
    return { ok: false, error: "Não foi possível cadastrar o lead. Tente novamente." }
  }
  const leadId = data?.id ?? null
  logAudit({
    leadId,
    leadNome: l.nome,
    usuarioNome: autor,
    tipo: "criacao",
    descricao: `Lead cadastrado (origem: ${l.origem}, temperatura: ${l.temperatura})`,
    referencias: (l.referencias ?? []).map((r) => r.ref).join(", ") || l.imovelRef,
  })
  notify(`Novo lead cadastrado: ${l.nome} (${autor})`, { tipo: "lead_novo", paraRole: "gestor", leadId })
  if (l.corretorId && l.corretorId !== userId) {
    notify(`Novo lead atribuído a você: ${l.nome}`, { tipo: "lead_novo", paraUsuarioId: l.corretorId, leadId })
  }
  await loadLeads()
  return { ok: true }
}

export async function executarUpdateLead({
  id,
  patch,
  loadLeads,
}: {
  id: string
  patch: Partial<Lead>
  loadLeads: () => Promise<void>
}): Promise<{ ok: boolean; error?: string }> {
  const agora = new Date().toISOString()
  const row = leadPatchToRow(patch)
  if (patch.status === "fechado" && patch.fechadoEm === undefined) row.fechado_em = agora
  if (patch.status === "negociando" && patch.negociandoEm === undefined) row.negociando_em = agora
  row.atualizado_em = agora
  let { error } = await supabase.from("leads").update(row).eq("id", id)
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
    delete row.data_reaparecimento
    delete row.motivo_arquivamento
    delete row.observacao_arquivamento
    delete row.status_anterior
    delete row.reativado_em
    delete row.arquivado_por
    delete row.reativacoes_count
    delete row.consentimento_contato
    delete row.sem_interesse_permanente
    ;({ error } = await supabase.from("leads").update(row).eq("id", id))
  }
  if (error) {
    return { ok: false, error: "Não foi possível salvar as alterações. Tente novamente." }
  }
  await loadLeads()
  return { ok: true }
}

export async function executarUpdateLeadsBulk({
  ids,
  patch,
  loadLeads,
}: {
  ids: string[]
  patch: Partial<Lead>
  loadLeads: () => Promise<void>
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  if (ids.length === 0) return { ok: true, updated: 0 }
  const agora = new Date().toISOString()
  const row = leadPatchToRow(patch)
  row.atualizado_em = agora
  let { data, error } = await supabase.from("leads").update(row).in("id", ids).select("id")
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
    delete row.data_reaparecimento
    delete row.motivo_arquivamento
    delete row.observacao_arquivamento
    delete row.status_anterior
    delete row.reativado_em
    delete row.arquivado_por
    delete row.reativacoes_count
    delete row.consentimento_contato
    delete row.sem_interesse_permanente
    ;({ data, error } = await supabase.from("leads").update(row).in("id", ids).select("id"))
  }
  if (error) return { ok: false, error: error.message }
  await loadLeads()
  return { ok: true, updated: data?.length ?? 0 }
}

export async function executarDeleteLead({
  id,
  motivo,
  motivoDetalhe,
  leads,
  userRole,
  userNome,
  loadLeads,
  loadAudit,
  notify,
}: {
  id: string
  motivo: string
  motivoDetalhe?: string
  leads: Lead[]
  userRole?: Role
  userNome?: string
  loadLeads: () => Promise<void>
  loadAudit: () => Promise<void>
  notify: (texto: string, opts?: NotifyOpts) => void
}): Promise<{ ok: boolean; error?: string }> {
  if (!isGestorNivel(userRole ?? "corretor")) {
    return { ok: false, error: "Apenas gestores podem excluir leads." }
  }
  const motivoTrim = (motivo ?? "").trim()
  const detalheTrim = (motivoDetalhe ?? "").trim()
  if (!motivoTrim) return { ok: false, error: "Selecione o motivo da exclusão." }
  if (!detalheTrim) return { ok: false, error: "Descreva o motivo da exclusão." }

  const lead = leads.find((l) => l.id === id)
  const autor = userNome ?? "Sistema"

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
    notify(`Lead excluído: ${lead.nome} (por ${autor}) — motivo: ${motivoTrim}`, {
      tipo: "exclusao",
      paraRole: "gestor",
      leadId: id,
    })
  }
  await Promise.all([loadLeads(), loadAudit()])
  return { ok: true }
}

export async function executarAddJustification({
  leadId,
  motivo,
  observacao,
  leads,
  userId,
  userRole,
  userNome,
  loadLeads,
  logAudit,
  setJustifications,
}: {
  leadId: string
  motivo: string
  observacao?: string
  leads: Lead[]
  userId: string
  userRole: Role
  userNome: string
  loadLeads: () => Promise<void>
  logAudit: (e: AuditInput) => void
  setJustifications: React.Dispatch<React.SetStateAction<OperationalJustification[]>>
}): Promise<{ ok: boolean; error?: string }> {
  const lead = leads.find((item) => item.id === leadId)
  if (!lead || (!isGestorNivel(userRole) && lead.corretorId !== userId)) {
    return { ok: false, error: "Você não tem permissão para justificar este lead." }
  }
  const cleanReason = motivo.trim()
  const cleanNote = observacao?.trim() ?? ""
  if (!cleanReason || (cleanReason === "Outro" && !cleanNote)) {
    return { ok: false, error: "Informe o motivo e detalhe a opção Outro." }
  }
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from("justificativas_operacionais")
    .insert({
      lead_id: leadId,
      motivo: cleanReason,
      observacao: cleanNote || null,
      etapa: lead.status,
      autor_id: userId,
      autor_nome: userNome,
    })
    .select("*")
    .single()
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Não foi possível confirmar a justificativa." }
  }
  const { error: updateError } = await supabase.from("leads").update({ atualizado_em: now }).eq("id", leadId)
  if (updateError) return { ok: false, error: updateError.message }
  logAudit({
    leadId,
    leadNome: lead.nome,
    usuarioNome: userNome,
    tipo: "justificativa",
    descricao: `Lead parado: ${cleanReason}${cleanNote ? ` — ${cleanNote}` : ""}`,
  })
  setJustifications((current) => [rowToJustification(data), ...current.filter((item) => item.id !== data.id)])
  await loadLeads()
  return { ok: true }
}
