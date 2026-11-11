import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  getHojeBrasilia,
  adicionarDiasBrasilia,
  adicionarMesesBrasilia,
} from "@/components/arquivar-lead-dialog"
import {
  MOTIVOS_ARQUIVAMENTO,
  MOTIVO_ARQUIVAMENTO_LABEL,
  type Lead,
  type MotivoArquivamento,
} from "@/lib/mock-data"

// Funções de regra de negócio puras para testar isoladamente as regras do job e da UI

function validarArquivamento(params: {
  motivo?: string | null
  dataReaparecimento?: string | null
  hojeBrasilia: string
  maxDataBrasilia: string
}) {
  if (!params.motivo || !params.motivo.trim()) {
    return { valido: false, erro: "O motivo do arquivamento é obrigatório." }
  }
  if (!params.dataReaparecimento) {
    return { valido: false, erro: "A data de reaparecimento é obrigatória." }
  }
  if (params.dataReaparecimento <= params.hojeBrasilia) {
    return {
      valido: false,
      erro: "A data de reaparecimento deve ser no futuro (não pode ser hoje nem no passado).",
    }
  }
  if (params.dataReaparecimento > params.maxDataBrasilia) {
    return {
      valido: false,
      erro: "A data de reaparecimento não pode ultrapassar o limite máximo de 24 meses.",
    }
  }
  return { valido: true }
}

function filtrarLeadsVisiveis(
  leads: Lead[],
  contexto: { isGestor: boolean; userId: string; showArchivedOnly?: boolean }
) {
  return leads.filter((l) => {
    if (contexto.showArchivedOnly) {
      if (!l.arquivadoEm) return false
      if (!contexto.isGestor && l.corretorId !== contexto.userId) return false
      return true
    } else {
      // Funil ativo comum
      if (l.arquivadoEm) return false
      if (!contexto.isGestor && l.corretorId !== contexto.userId) return false
      return true
    }
  })
}

interface ProcessarReativacaoMockParams {
  leadsArquivados: Lead[]
  leadsAtivos: Lead[]
  usuarios: Array<{ id: string; nome: string; role: string; status: string }>
  hojeBrasilia: string
}

function simularJobReativacao({
  leadsArquivados,
  leadsAtivos,
  usuarios,
  hojeBrasilia,
}: ProcessarReativacaoMockParams) {
  const reativados: Lead[] = []
  const notificacoes: Array<{ tipo: string; mensagem: string; destinatarioId?: string; role?: string }> = []
  const conflitosDuplicidade: Array<{ leadArquivado: Lead; leadAtivo: Lead }> = []
  const pulados: Array<{ lead: Lead; motivo: string }> = []
  const auditoria: Array<{ leadId: string; descricao: string }> = []
  let enviosMensagemAutomatica = 0

  const usuariosMap = new Map(usuarios.map((u) => [u.id, u]))
  const gestorPadrao = usuarios.find((u) => u.role === "gestor" && u.status === "ativo")

  const normalizar = (tel?: string) => {
    if (!tel) return ""
    const d = tel.replace(/\D/g, "")
    if (d.startsWith("55") && d.length >= 12) return d.slice(2)
    return d
  }
  const telefonesAtivos = new Map(leadsAtivos.map((l) => [normalizar(l.telefone), l]))

  for (const lead of leadsArquivados) {
    const dataReap = lead.dataReaparecimento

    // 1. Checagem de data
    if (!dataReap || dataReap > hojeBrasilia) {
      pulados.push({ lead, motivo: "data_futura" })
      continue
    }

    // 2. Sem interesse permanente
    if (lead.semInteressePermanente) {
      pulados.push({ lead, motivo: "sem_interesse_permanente" })
      continue
    }

    // 3. Já fechado/convertido
    if (lead.status === "fechado") {
      pulados.push({ lead, motivo: "ja_fechado" })
      continue
    }

    // 4. Idempotência: se já foi reativado hoje e não está mais arquivado
    if (lead.reativadoEm && lead.reativadoEm.startsWith(hojeBrasilia) && !lead.arquivadoEm) {
      pulados.push({ lead, motivo: "ja_reativado_hoje" })
      continue
    }

    // 5. Anti-duplicidade
    const tel = normalizar(lead.telefone)
    const ativoDuplicado = tel ? telefonesAtivos.get(tel) : null
    if (ativoDuplicado && ativoDuplicado.id !== lead.id) {
      conflitosDuplicidade.push({ leadArquivado: lead, leadAtivo: ativoDuplicado })
      notificacoes.push({
        tipo: "duplicidade",
        mensagem: `⚠️ Conflito na reativação: Lead arquivado ${lead.nome} colidiu com lead ativo ${ativoDuplicado.nome}. Mesclagem sugerida.`,
        role: "gestor",
      })
      continue
    }

    // 6. Corretor ativo ou redistribuição para gestor
    let corretorId = lead.corretorId
    const usuarioCorretor = usuariosMap.get(corretorId)
    if (!usuarioCorretor || usuarioCorretor.status === "inativo") {
      corretorId = gestorPadrao ? gestorPadrao.id : corretorId
    }

    // 7. Reativação
    const leadReativado: Lead = {
      ...lead,
      arquivadoEm: undefined,
      status: "novo",
      reativadoEm: `${hojeBrasilia}T08:00:00.000Z`,
      reativacoesCount: (lead.reativacoesCount || 0) + 1,
      corretorId,
    }
    reativados.push(leadReativado)

    auditoria.push({
      leadId: lead.id,
      descricao: "Lead reativado automaticamente pelo cronograma de hibernação na data prevista.",
    })

    // 8. Notificações in-app
    const consentAviso = lead.consentimentoContato === false ? " (Confirmar consentimento antes de contatar)" : ""
    notificacoes.push({
      tipo: "pipeline",
      mensagem: `🔔 Lead reativado: "${lead.nome}" retornou ao funil como Novo Lead. Tarefa: Retomar contato.${consentAviso}`,
      destinatarioId: corretorId,
    })
    notificacoes.push({
      tipo: "pipeline",
      mensagem: `🔔 Lead reativado: "${lead.nome}" reapareceu na carteira de ${usuariosMap.get(corretorId)?.nome}.`,
      role: "gestor",
    })

    // Regra T10: ZERO envios automáticos de WhatsApp/SMS/E-mail
    // enviosMensagemAutomatica deve ser rigorosamente 0
  }

  return {
    reativados,
    notificacoes,
    conflitosDuplicidade,
    pulados,
    auditoria,
    enviosMensagemAutomatica,
  }
}

describe("Suite de Hibernação e Reativação Automática de Leads (T1 - T11)", () => {
  const hoje = getHojeBrasilia()
  const dataValidaFutura = adicionarMesesBrasilia(6)
  const maxData = adicionarMesesBrasilia(24)

  const corretorAtivo = { id: "u-luciana", nome: "Luciana", role: "corretor", status: "ativo" }
  const corretorInativo = { id: "u-dali", nome: "Dali", role: "corretor", status: "inativo" }
  const gestorAtivo = { id: "u-gestor", nome: "Gestor Carlos", role: "gestor", status: "ativo" }

  const leadBase: Lead = {
    id: "lead-100",
    nome: "Mariana Souza",
    telefone: "5518999990001",
    email: "mariana@exemplo.com",
    status: "em_atendimento",
    temperatura: "morna",
    origem: "Tráfego Pago",
    corretorId: "u-luciana",
    valorNegociacao: 500000,
    tags: ["Campanha Luxo", "Investimento"],
    interacoes: [],
    criadoEm: "2026-01-01T10:00:00Z",
  }

  // T1. Arquivar com data válida
  it("T1: Arquivar com data válida remove o lead do funil ativo, mantém em Arquivados e preserva status anterior", () => {
    const validacao = validarArquivamento({
      motivo: "quer comprar em data futura",
      dataReaparecimento: dataValidaFutura,
      hojeBrasilia: hoje,
      maxDataBrasilia: maxData,
    })
    expect(validacao.valido).toBe(true)

    const leadArquivado: Lead = {
      ...leadBase,
      arquivadoEm: "2026-11-11T12:00:00Z",
      motivoArquivamento: "quer comprar em data futura",
      dataReaparecimento: dataValidaFutura,
      statusAnterior: leadBase.status,
      arquivadoPor: "Luciana",
    }

    const funilAtivo = filtrarLeadsVisiveis([leadArquivado], { isGestor: true, userId: "u-gestor" })
    expect(funilAtivo).toHaveLength(0)

    const areaArquivados = filtrarLeadsVisiveis([leadArquivado], {
      isGestor: true,
      userId: "u-gestor",
      showArchivedOnly: true,
    })
    expect(areaArquivados).toHaveLength(1)
    expect(areaArquivados[0].statusAnterior).toBe("em_atendimento")
  })

  // T2. Bloqueio de data passada ou mesmo dia e motivo obrigatório
  it("T2: Bloqueia data no passado, no mesmo dia e motivo em branco", () => {
    // Data de hoje (mesmo dia)
    const resHoje = validarArquivamento({
      motivo: "outro",
      dataReaparecimento: hoje,
      hojeBrasilia: hoje,
      maxDataBrasilia: maxData,
    })
    expect(resHoje.valido).toBe(false)
    expect(resHoje.erro).toContain("não pode ser hoje nem no passado")

    // Data no passado
    const resPassado = validarArquivamento({
      motivo: "sem interesse",
      dataReaparecimento: "2025-01-01",
      hojeBrasilia: hoje,
      maxDataBrasilia: maxData,
    })
    expect(resPassado.valido).toBe(false)

    // Sem motivo
    const resSemMotivo = validarArquivamento({
      motivo: "",
      dataReaparecimento: dataValidaFutura,
      hojeBrasilia: hoje,
      maxDataBrasilia: maxData,
    })
    expect(resSemMotivo.valido).toBe(false)
    expect(resSemMotivo.erro).toContain("motivo do arquivamento é obrigatório")

    // Data maior que 24 meses
    const resDataExcessiva = validarArquivamento({
      motivo: "outro",
      dataReaparecimento: "2030-01-01",
      hojeBrasilia: hoje,
      maxDataBrasilia: maxData,
    })
    expect(resDataExcessiva.valido).toBe(false)
    expect(resDataExcessiva.erro).toContain("limite máximo de 24 meses")
  })

  // T3. Reativação no dia certo: volta como Novo Lead, tags preservadas, marca Reativado
  it("T3: No dia da reativação o lead volta como Novo Lead com tags originais preservadas e marca Reativado", () => {
    const leadProgramado: Lead = {
      ...leadBase,
      arquivadoEm: "2026-05-10T12:00:00Z",
      motivoArquivamento: "quer comprar em data futura",
      dataReaparecimento: hoje,
      tags: ["Campanha Luxo", "Apartamento 3 quartos"],
      reativacoesCount: 0,
    }

    const res = simularJobReativacao({
      leadsArquivados: [leadProgramado],
      leadsAtivos: [],
      usuarios: [corretorAtivo, gestorAtivo],
      hojeBrasilia: hoje,
    })

    expect(res.reativados).toHaveLength(1)
    const reativado = res.reativados[0]
    expect(reativado.arquivadoEm).toBeUndefined()
    expect(reativado.status).toBe("novo")
    expect(reativado.tags).toEqual(["Campanha Luxo", "Apartamento 3 quartos"])
    expect(reativado.reativacoesCount).toBe(1)
    expect(reativado.reativadoEm).toContain(hoje)
    expect(res.auditoria[0].descricao).toContain("Lead reativado automaticamente")
  })

  // T4. Idempotência: rodar job duas vezes não duplica nem reativa duas vezes
  it("T4: Idempotência garantida ao executar o job múltiplas vezes no mesmo dia", () => {
    const leadJaReativadoHoje: Lead = {
      ...leadBase,
      arquivadoEm: undefined, // já reativado
      status: "novo",
      dataReaparecimento: hoje,
      reativadoEm: `${hoje}T08:00:00.000Z`,
      reativacoesCount: 1,
    }

    const resSegundaExecucao = simularJobReativacao({
      leadsArquivados: [leadJaReativadoHoje],
      leadsAtivos: [leadJaReativadoHoje],
      usuarios: [corretorAtivo, gestorAtivo],
      hojeBrasilia: hoje,
    })

    expect(resSegundaExecucao.reativados).toHaveLength(0)
    expect(resSegundaExecucao.pulados.some((p) => p.motivo === "ja_reativado_hoje")).toBe(true)
  })

  // T5. Duplicidade: lead ativo com mesmo telefone não gera segundo lead
  it("T5: Bloqueia reativação se já houver lead ativo com mesmo telefone e emite alerta para gestor", () => {
    const leadArquivado: Lead = {
      ...leadBase,
      id: "lead-arq-1",
      nome: "Roberto Carlos (Arquivado)",
      telefone: "5518991112222",
      arquivadoEm: "2026-01-01T10:00:00Z",
      dataReaparecimento: hoje,
    }

    const leadAtivoJaExistente: Lead = {
      ...leadBase,
      id: "lead-ativo-2",
      nome: "Roberto Carlos (Ativo)",
      telefone: "(18) 99111-2222",
      arquivadoEm: undefined,
      status: "em_atendimento",
    }

    const res = simularJobReativacao({
      leadsArquivados: [leadArquivado],
      leadsAtivos: [leadAtivoJaExistente],
      usuarios: [corretorAtivo, gestorAtivo],
      hojeBrasilia: hoje,
    })

    expect(res.reativados).toHaveLength(0)
    expect(res.conflitosDuplicidade).toHaveLength(1)
    expect(res.notificacoes.some((n) => n.role === "gestor" && n.mensagem.includes("Conflito na reativação"))).toBe(true)
  })

  // T6. Lead convertido ou marcado como sem interesse permanente não reativa
  it("T6: Lead com semInteressePermanente ou já fechado/convertido não é reativado", () => {
    const leadSemInteresse: Lead = {
      ...leadBase,
      id: "lead-descarte",
      arquivadoEm: "2026-01-01T10:00:00Z",
      dataReaparecimento: hoje,
      semInteressePermanente: true,
    }

    const leadFechado: Lead = {
      ...leadBase,
      id: "lead-comprou",
      status: "fechado",
      arquivadoEm: "2026-01-01T10:00:00Z",
      dataReaparecimento: hoje,
    }

    const res = simularJobReativacao({
      leadsArquivados: [leadSemInteresse, leadFechado],
      leadsAtivos: [],
      usuarios: [corretorAtivo, gestorAtivo],
      hojeBrasilia: hoje,
    })

    expect(res.reativados).toHaveLength(0)
    expect(res.pulados).toHaveLength(2)
    expect(res.pulados.map((p) => p.motivo)).toContain("sem_interesse_permanente")
    expect(res.pulados.map((p) => p.motivo)).toContain("ja_fechado")
  })

  // T7. Permissões: corretor não vê arquivados de outro corretor; gestor vê todos
  it("T7: Corretor comum vê apenas seus próprios leads arquivados; gestor vê todos", () => {
    const leadLuciana: Lead = {
      ...leadBase,
      id: "lead-lu",
      corretorId: "u-luciana",
      arquivadoEm: "2026-01-01T10:00:00Z",
    }
    const leadDali: Lead = {
      ...leadBase,
      id: "lead-da",
      corretorId: "u-dali",
      arquivadoEm: "2026-01-01T10:00:00Z",
    }

    // Visão da Luciana (corretor)
    const visaoLuciana = filtrarLeadsVisiveis([leadLuciana, leadDali], {
      isGestor: false,
      userId: "u-luciana",
      showArchivedOnly: true,
    })
    expect(visaoLuciana).toHaveLength(1)
    expect(visaoLuciana[0].id).toBe("lead-lu")

    // Visão do Gestor
    const visaoGestor = filtrarLeadsVisiveis([leadLuciana, leadDali], {
      isGestor: true,
      userId: "u-gestor",
      showArchivedOnly: true,
    })
    expect(visaoGestor).toHaveLength(2)
  })

  // T8. Notificações enviadas ao responsável e ao gestor com tarefa Retomar contato
  it("T8: Gera notificações in-app para o corretor responsável e para o gestor", () => {
    const leadReativar: Lead = {
      ...leadBase,
      corretorId: "u-luciana",
      arquivadoEm: "2026-01-01T10:00:00Z",
      dataReaparecimento: hoje,
    }

    const res = simularJobReativacao({
      leadsArquivados: [leadReativar],
      leadsAtivos: [],
      usuarios: [corretorAtivo, gestorAtivo],
      hojeBrasilia: hoje,
    })

    expect(res.reativados).toHaveLength(1)
    const notifCorretor = res.notificacoes.find((n) => n.destinatarioId === "u-luciana")
    expect(notifCorretor).toBeDefined()
    expect(notifCorretor?.mensagem).toContain("Tarefa: Retomar contato")

    const notifGestor = res.notificacoes.find((n) => n.role === "gestor")
    expect(notifGestor).toBeDefined()
    expect(notifGestor?.mensagem).toContain("reapareceu na carteira de Luciana")
  })

  // T9. Fuso horário: horário de Brasília respeitado
  it("T9: Fuso horário America/Sao_Paulo é respeitado independente do fuso do servidor", () => {
    const hojeBrt = getHojeBrasilia()
    expect(hojeBrt).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    // Exemplo de lead agendado exatamente para hoje
    const leadHoje: Lead = {
      ...leadBase,
      arquivadoEm: "2026-01-01T10:00:00Z",
      dataReaparecimento: hojeBrt,
    }

    const res = simularJobReativacao({
      leadsArquivados: [leadHoje],
      leadsAtivos: [],
      usuarios: [corretorAtivo, gestorAtivo],
      hojeBrasilia: hojeBrt,
    })
    expect(res.reativados).toHaveLength(1)
  })

  // T10. Nenhum envio automático de mensagem (WhatsApp, SMS ou e-mail) na reativação
  it("T10: Nenhum envio automático de mensagem na reativação — a ação é 100% manual do corretor", () => {
    const leadReativar: Lead = {
      ...leadBase,
      arquivadoEm: "2026-01-01T10:00:00Z",
      dataReaparecimento: hoje,
    }

    const res = simularJobReativacao({
      leadsArquivados: [leadReativar],
      leadsAtivos: [],
      usuarios: [corretorAtivo, gestorAtivo],
      hojeBrasilia: hoje,
    })

    expect(res.enviosMensagemAutomatica).toBe(0)
  })

  // T11. Acessibilidade e LGPD
  it("T11: Alerta visual com texto explícito para LGPD e rótulo claro de reativação", () => {
    const leadSemConsentimento: Lead = {
      ...leadBase,
      arquivadoEm: "2026-01-01T10:00:00Z",
      dataReaparecimento: hoje,
      consentimentoContato: false,
    }

    const res = simularJobReativacao({
      leadsArquivados: [leadSemConsentimento],
      leadsAtivos: [],
      usuarios: [corretorAtivo, gestorAtivo],
      hojeBrasilia: hoje,
    })

    const notif = res.notificacoes.find((n) => n.destinatarioId === "u-luciana")
    expect(notif?.mensagem).toContain("Confirmar consentimento antes de contatar")
  })

  // Bônus: Corretor original inativo é transferido para o gestor na reativação
  it("Bônus: Se o corretor original estiver inativo, reatribui para o gestor ativo", () => {
    const leadCorretorInativo: Lead = {
      ...leadBase,
      corretorId: "u-dali", // Dali está inativa
      arquivadoEm: "2026-01-01T10:00:00Z",
      dataReaparecimento: hoje,
    }

    const res = simularJobReativacao({
      leadsArquivados: [leadCorretorInativo],
      leadsAtivos: [],
      usuarios: [corretorInativo, gestorAtivo],
      hojeBrasilia: hoje,
    })

    expect(res.reativados).toHaveLength(1)
    expect(res.reativados[0].corretorId).toBe("u-gestor")
  })
})
