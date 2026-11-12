import type {
  AuditEntry,
  AuditTipo,
  Lead,
  LeadRef,
  Notification,
  OperationalJustification,
  Origem,
  QualityNote,
  Temperatura,
  User,
  Visit,
} from "../mock-data"
import { normalizeStatus } from "../labels"

// ---------- Conversores entre o banco (colunas em pt) e o app (camelCase) ----------

export function extrairMetaArquivado(obs: string | null | undefined, chave: string): string | null {
  if (!obs) return null
  const m = obs.match(new RegExp(`\\[Hibernação:.*${chave}=([^;\\]]+)`, "i"))
  return m ? m[1].trim() : null
}

export function rowToLead(r: Record<string, any>): Lead {
  const obs = r.observacoes ?? ""
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
    dataReaparecimento: r.data_reaparecimento ?? extrairMetaArquivado(obs, "data"),
    motivoArquivamento: r.motivo_arquivamento ?? extrairMetaArquivado(obs, "motivo"),
    observacaoArquivamento: r.observacao_arquivamento ?? extrairMetaArquivado(obs, "obs"),
    statusAnterior: r.status_anterior ?? extrairMetaArquivado(obs, "status_anterior"),
    reativadoEm: r.reativado_em ?? extrairMetaArquivado(obs, "reativado_em"),
    arquivadoPor: r.arquivado_por ?? extrairMetaArquivado(obs, "arquivado_por"),
    reativacoesCount: r.reativacoes_count ?? 0,
    consentimentoContato: r.consentimento_contato ?? true,
    semInteressePermanente: r.sem_interesse_permanente ?? false,
    fechadoEm: r.fechado_em ?? undefined,
    negociandoEm: r.negociando_em ?? undefined,
    origem: (r.origem ?? "Outro") as Origem,
    observacoes: obs,
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

export function leadPatchToRow(p: Partial<Lead>): Record<string, any> {
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
  if (p.dataReaparecimento !== undefined) row.data_reaparecimento = p.dataReaparecimento || null
  if (p.motivoArquivamento !== undefined) row.motivo_arquivamento = p.motivoArquivamento || null
  if (p.observacaoArquivamento !== undefined) row.observacao_arquivamento = p.observacaoArquivamento || null
  if (p.statusAnterior !== undefined) row.status_anterior = p.statusAnterior || null
  if (p.reativadoEm !== undefined) row.reativado_em = p.reativadoEm || null
  if (p.arquivadoPor !== undefined) row.arquivado_por = p.arquivadoPor || null
  if (p.reativacoesCount !== undefined) row.reativacoes_count = p.reativacoesCount ?? 0
  if (p.consentimentoContato !== undefined) row.consentimento_contato = p.consentimentoContato ?? true
  if (p.semInteressePermanente !== undefined) row.sem_interesse_permanente = p.semInteressePermanente ?? false
  if (p.fechadoEm !== undefined) row.fechado_em = p.fechadoEm || null
  if (p.negociandoEm !== undefined) row.negociando_em = p.negociandoEm || null
  return row
}

export function rowToVisit(r: Record<string, any>): Visit {
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

export function rowToUser(r: Record<string, any>): User {
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

export function rowToNotification(r: Record<string, any>, userId: string): Notification {
  const lidaPor: string[] = Array.isArray(r.lida_por) ? r.lida_por : []
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
    modulo: r.modulo ?? null,
    paraRole: r.para_role ?? null,
    paraUsuarioId: r.para_usuario_id ?? null,
    leadId: r.lead_id ?? null,
  }
}

export function rowToJustification(r: Record<string, any>): OperationalJustification {
  return {
    id: r.id,
    leadId: r.lead_id,
    motivo: r.motivo,
    observacao: r.observacao ?? undefined,
    etapa: normalizeStatus(r.etapa),
    autorId: r.usuario_id ?? r.autor_id ?? "",
    autorNome: r.autor_nome ?? "",
    criadoEm: r.criado_em,
  }
}

export function rowToQuality(r: Record<string, any>): QualityNote {
  return {
    id: r.id,
    leadId: r.lead_id,
    autorId: r.autor_id ?? undefined,
    autorNome: r.autor_nome,
    texto: r.texto,
    criadoEm: r.criado_em,
  }
}

export function rowToAudit(r: Record<string, any>): AuditEntry {
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

// Erro de índice único do banco (telefone duplicado)
export function isPhoneUniqueViolation(error: any): boolean {
  return Boolean(error && (error.code === "23505" || /telefone_normalizado/i.test(error.message ?? "")))
}
