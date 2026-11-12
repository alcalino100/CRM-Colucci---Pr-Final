import type { Lead, LeadStatus } from "../mock-data"
import type { AuditInput, NotifyOpts } from "./types"

export async function executarArquivarLeadComData({
  id,
  params,
  lead,
  userId,
  userNome,
  updateLead,
  logAudit,
  notify,
}: {
  id: string
  params: { motivo: string; dataReaparecimento: string; observacao?: string }
  lead: Lead | undefined
  userId: string
  userNome: string
  updateLead: (id: string, patch: Partial<Lead>) => Promise<{ ok: boolean; error?: string }>
  logAudit: (e: AuditInput) => void
  notify: (texto: string, opts?: NotifyOpts) => void
}): Promise<{ ok: boolean; error?: string }> {
  if (!lead) return { ok: false, error: "Lead não encontrado." }

  const agora = new Date().toISOString()
  const statusAnterior = lead.status

  const reapareceFormatado = new Date(params.dataReaparecimento + "T12:00:00").toLocaleDateString("pt-BR")
  const metaNote = `\n\n[Hibernação: data=${params.dataReaparecimento}; motivo=${params.motivo}; status_anterior=${statusAnterior}; arquivado_por=${userId}; data_ext=${reapareceFormatado}]`
  const obsComMeta = `${lead.observacoes || ""}${metaNote}`.trim()

  const patch: Partial<Lead> = {
    arquivadoEm: agora,
    dataReaparecimento: params.dataReaparecimento,
    motivoArquivamento: params.motivo,
    observacaoArquivamento: params.observacao || null,
    statusAnterior: statusAnterior,
    arquivadoPor: userId,
    observacoes: obsComMeta,
  }

  const res = await updateLead(id, patch)
  if (!res.ok) return res

  logAudit({
    leadId: lead.id,
    leadNome: lead.nome,
    usuarioNome: userNome,
    tipo: "edicao",
    descricao: `Lead arquivado com previsão de reaparecimento para ${reapareceFormatado}. Motivo: ${params.motivo}`,
    motivo: params.motivo,
    motivoDetalhe: params.observacao,
  })

  notify(`Lead ${lead.nome} arquivado até ${reapareceFormatado} por ${userNome}`, {
    tipo: "arquivamento",
    paraRole: "gestor",
    leadId: lead.id,
  })

  if (lead.corretorId && lead.corretorId !== userId) {
    notify(`Seu lead ${lead.nome} foi arquivado até ${reapareceFormatado}`, {
      tipo: "arquivamento",
      paraUsuarioId: lead.corretorId,
      leadId: lead.id,
    })
  }

  return { ok: true }
}

export async function executarDesarquivarLead({
  id,
  lead,
  userId,
  userNome,
  updateLead,
  logAudit,
  notify,
}: {
  id: string
  lead: Lead | undefined
  userId: string
  userNome: string
  updateLead: (id: string, patch: Partial<Lead>) => Promise<{ ok: boolean; error?: string }>
  logAudit: (e: AuditInput) => void
  notify: (texto: string, opts?: NotifyOpts) => void
}): Promise<{ ok: boolean; error?: string }> {
  if (!lead) return { ok: false, error: "Lead não encontrado." }

  const statusDestino = (lead.statusAnterior as LeadStatus) || "novo"
  const agoraIso = new Date().toISOString()
  const novoCiclo = (lead.reativacoesCount || 0) + 1

  const patch: Partial<Lead> = {
    arquivadoEm: null,
    dataReaparecimento: null,
    motivoArquivamento: null,
    observacaoArquivamento: null,
    status: "novo", // Volta como Novo Lead para prioridade de atendimento
    reativadoEm: agoraIso, // Ativa a cor âmbar e badge de reativação
    reativacoesCount: novoCiclo,
  }

  const res = await updateLead(id, patch)
  if (!res.ok) return res

  logAudit({
    leadId: lead.id,
    leadNome: lead.nome,
    usuarioNome: userNome,
    tipo: "reativacao",
    descricao: `Lead reativado/desarquivado por ${userNome} (retornou como "Novo Lead" com bloco destacado)`,
  })

  notify(`🔔 Lead ${lead.nome} reativado e retornou para o funil como Novo Lead.`, {
    tipo: "pipeline",
    paraRole: "gestor",
    leadId: lead.id,
  })

  if (lead.corretorId && lead.corretorId !== userId) {
    notify(`🔔 Seu lead ${lead.nome} reapareceu no funil como Novo Lead! Tarefa: Retomar contato.`, {
      tipo: "pipeline",
      paraUsuarioId: lead.corretorId,
      leadId: lead.id,
    })
  }

  return { ok: true }
}
