// lib/meta/reconciliation.ts
// Motor de Reconciliação e Auditoria Paralela: Meta Ads (Marketing API) × CRM Real (Supabase)
// Cruza dados de anúncios e gastos com o funil real do CRM:
// Leads no banco, Visitas, Propostas, Vendas/Locações Fechadas, VGV e Comissões.

import type { Lead, Visit } from "@/lib/mock-data"

export interface CampaignReconciliation {
  campaignId: string
  campaignName: string
  status?: string
  spend: number
  impressions: number
  clicks: number
  ctr: number
  cpc: number
  metaResults: number // Resultados reportados pelo Meta (leads ou conversas de WhatsApp iniciadas)
  costPerMetaResult: number

  // Métricas Reais do CRM
  crmLeads: number
  crmNovos: number
  crmEmAtendimento: number
  crmVisitasAgendadas: number
  crmVisitasRealizadas: number
  crmNegociando: number
  crmFechados: number
  crmPerdidos: number

  // Financeiro Real (Bottom-line)
  vgvFechado: number // Soma do valor da proposta/negociação dos leads fechados
  comissaoFechada: number // Soma da comissão real gerada

  // Unit Economics Reais
  cplReal: number // Gasto ÷ Leads reais no CRM
  cpvReal: number // Gasto ÷ (Visitas Realizadas + Visitas Agendadas)
  cacReal: number // Gasto ÷ Fechamentos reais
  roasComissao: number // Comissão Real ÷ Gasto (ex: 5.4 = 540% de retorno sobre gasto)
  roasVgv: number // VGV Fechado ÷ Gasto

  // Diagnóstico & Discrepância
  discrepanciaLeads: number // metaResults - crmLeads (leads perdidos ou não integrados)
  discrepanciaPct: number // % de leads não capturados no CRM
  taxaConversaoVisita: number // (Visitas ÷ crmLeads) * 100
  taxaConversaoFechamento: number // (Fechados ÷ crmLeads) * 100
  statusSaude: "excelente" | "lucrativo" | "atencao" | "critico"
  diagnostico: string
}

export interface CorretorPerformanceTráfego {
  corretorId: string
  corretorNome: string
  leadsRecebidos: number
  visitasRealizadas: number
  propostasNegociando: number
  fechamentos: number
  vgvFechado: number
  comissaoFechada: number
  taxaConversaoVisita: number
  taxaConversaoFechamento: number
}

export interface TotaisReconciliacao {
  gastoTotalMeta: number
  impressoesTotal: number
  cliquesTotal: number
  resultadosTotalMeta: number
  leadsTotalCrm: number
  visitasTotal: number
  fechamentosTotal: number
  vgvTotalFechado: number
  comissaoTotalFechada: number
  cplMetaMedio: number
  cplRealMedio: number
  cpvRealMedio: number
  cacRealMedio: number
  roasComissaoGeral: number
  roasVgvGeral: number
  taxaDiscrepanciaGeral: number
  leadsOrfaosCount: number // Leads de tráfego pago sem campanha vinculada
}

/**
 * Calcula a reconciliação completa entre as campanhas do Meta Ads e os leads e visitas do CRM.
 */
export function calcularReconciliacao(
  campanhasMeta: any[],
  insightsMeta: any[],
  leads: Lead[],
  visits: Visit[],
  userName: (id: string) => string
): {
  reconciliacoes: CampaignReconciliation[]
  corretores: CorretorPerformanceTráfego[]
  totais: TotaisReconciliacao
  leadsOrfaos: Lead[]
} {
  // 1. Mapeia insights do Meta por ID de campanha
  const insPorCamp = new Map<string, any>()
  for (const ins of insightsMeta || []) {
    const cid = ins.campaign_id || ins.id
    if (cid) insPorCamp.set(String(cid), ins)
  }

  // 2. Extrai resultados do array de actions do Meta
  function extrairResultados(row: any): number {
    const acts: any[] = row?.actions || []
    return acts
      .filter((a) => a.action_type === "lead" || (a.action_type && a.action_type.includes("messaging_conversation_started")))
      .reduce((s, a) => s + Number(a.value || 0), 0)
  }

  // 3. Mapeia visitas por Lead ID
  const visitasPorLead = new Map<string, Visit[]>()
  for (const v of visits || []) {
    if (v.leadId) {
      const list = visitasPorLead.get(v.leadId) || []
      list.push(v)
      visitasPorLead.set(v.leadId, list)
    }
  }

  // 4. Agrupa leads do CRM por campanha
  const leadsPorCamp = new Map<string, Lead[]>()
  const leadsOrfaos: Lead[] = []

  for (const l of leads || []) {
    // Considera leads que vieram de Tráfego Pago ou têm tracking de Meta
    const ehTrafego = l.origem === "Tráfego Pago" || !!l.metaCampaignId || !!l.utmCampaign

    if (ehTrafego) {
      const cid = l.metaCampaignId || l.utmCampaign
      if (cid) {
        const list = leadsPorCamp.get(cid) || []
        list.push(l)
        leadsPorCamp.set(cid, list)
      } else {
        leadsOrfaos.push(l)
      }
    }
  }

  // 5. Constrói a lista de reconciliação de cada campanha
  const reconciliacoes: CampaignReconciliation[] = []

  // Conjunto de campanhas a analisar (todas do Meta + eventuais IDs presentes no CRM)
  const campanhasParaAnalisar = new Map<string, { id: string; name: string; status?: string }>()
  for (const c of campanhasMeta || []) {
    campanhasParaAnalisar.set(String(c.id), { id: String(c.id), name: c.name, status: c.effective_status })
  }
  for (const cid of leadsPorCamp.keys()) {
    if (!campanhasParaAnalisar.has(cid)) {
      campanhasParaAnalisar.set(cid, { id: cid, name: `Campanha #${cid}`, status: "DESCONHECIDO" })
    }
  }

  for (const [cid, cInfo] of campanhasParaAnalisar.entries()) {
    const ins = insPorCamp.get(cid)
    const spend = Number(ins?.spend || 0)
    const impressions = Number(ins?.impressions || 0)
    const clicks = Number(ins?.clicks || 0)
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : Number(ins?.ctr || 0)
    const cpc = clicks > 0 ? spend / clicks : Number(ins?.cpc || 0)
    const metaResults = ins ? extrairResultados(ins) : 0
    const costPerMetaResult = metaResults > 0 ? spend / metaResults : 0

    // Dados reais do CRM para esta campanha
    const crmLeadsList = leadsPorCamp.get(cid) || []
    const crmLeads = crmLeadsList.length

    let crmNovos = 0
    let crmEmAtendimento = 0
    let crmVisitasAgendadas = 0
    let crmVisitasRealizadas = 0
    let crmNegociando = 0
    let crmFechados = 0
    let crmPerdidos = 0
    let vgvFechado = 0
    let comissaoFechada = 0

    for (const l of crmLeadsList) {
      const st = l.status
      if (st === "novo") crmNovos++
      else if (st === "em_atendimento" || st === "atendimento_ia" || st === "atendimento_humano" || st === "em_automacao") crmEmAtendimento++
      else if (st === "visita agendada") crmVisitasAgendadas++
      else if (st === "negociando") crmNegociando++
      else if (st === "fechado") {
        crmFechados++
        if (l.valorNegociacao) vgvFechado += Number(l.valorNegociacao)
        if (l.valorComissao) comissaoFechada += Number(l.valorComissao)
      } else if (st === "perdido") crmPerdidos++

      // Checa histórico de visitas do lead
      const visitsDoLead = visitasPorLead.get(l.id) || []
      if (visitsDoLead.length > 0) {
        crmVisitasRealizadas += visitsDoLead.length
      }
    }

    const totalVisitas = crmVisitasAgendadas + crmVisitasRealizadas

    // Unit Economics
    const cplReal = crmLeads > 0 ? spend / crmLeads : 0
    const cpvReal = totalVisitas > 0 ? spend / totalVisitas : 0
    const cacReal = crmFechados > 0 ? spend / crmFechados : 0
    const roasComissao = spend > 0 ? comissaoFechada / spend : 0
    const roasVgv = spend > 0 ? vgvFechado / spend : 0

    const discrepanciaLeads = metaResults - crmLeads
    const discrepanciaPct = metaResults > 0 ? Math.max(0, (discrepanciaLeads / metaResults) * 100) : 0
    const taxaConversaoVisita = crmLeads > 0 ? (totalVisitas / crmLeads) * 100 : 0
    const taxaConversaoFechamento = crmLeads > 0 ? (crmFechados / crmLeads) * 100 : 0

    // Classificação de Saúde
    let statusSaude: CampaignReconciliation["statusSaude"] = "atencao"
    let diagnostico = "Sem dados suficientes para avaliar."

    if (roasComissao >= 3 || (comissaoFechada > spend && crmFechados >= 2)) {
      statusSaude = "excelente"
      diagnostico = `Altamente lucrativa: ROAS de ${roasComissao.toFixed(1)}x em comissão gerada.`
    } else if (comissaoFechada > spend || (totalVisitas >= 3 && spend < 1500)) {
      statusSaude = "lucrativo"
      diagnostico = `Positiva: gerou ${crmFechados} vendas e ${totalVisitas} visitas no CRM.`
    } else if (spend > 500 && totalVisitas === 0 && crmFechados === 0) {
      statusSaude = "critico"
      diagnostico = `Gargalo crítico: R$ ${spend.toFixed(0)} gastos sem nenhuma visita agendada no CRM.`
    } else if (discrepanciaPct > 40 && metaResults >= 10) {
      statusSaude = "atencao"
      diagnostico = `Atenção: ${discrepanciaPct.toFixed(0)}% dos leads do Meta não entraram no CRM (possível falha de webhook/integração).`
    } else {
      statusSaude = "atencao"
      diagnostico = `Em monitoramento: gerou ${crmLeads} leads no CRM com CPL real de R$ ${cplReal.toFixed(2)}.`
    }

    reconciliacoes.push({
      campaignId: cid,
      campaignName: cInfo.name || `Campanha #${cid}`,
      status: cInfo.status,
      spend,
      impressions,
      clicks,
      ctr,
      cpc,
      metaResults,
      costPerMetaResult,
      crmLeads,
      crmNovos,
      crmEmAtendimento,
      crmVisitasAgendadas,
      crmVisitasRealizadas,
      crmNegociando,
      crmFechados,
      crmPerdidos,
      vgvFechado,
      comissaoFechada,
      cplReal,
      cpvReal,
      cacReal,
      roasComissao,
      roasVgv,
      discrepanciaLeads,
      discrepanciaPct,
      taxaConversaoVisita,
      taxaConversaoFechamento,
      statusSaude,
      diagnostico,
    })
  }

  // Ordena por maior gasto primeiro
  reconciliacoes.sort((a, b) => b.spend - a.spend)

  // 6. Calcula performance por corretor
  const mapaCorretores = new Map<string, CorretorPerformanceTráfego>()
  for (const l of leads || []) {
    if (l.origem === "Tráfego Pago" || l.metaCampaignId) {
      const cid = l.corretorId || "sem_corretor"
      const cur = mapaCorretores.get(cid) || {
        corretorId: cid,
        corretorNome: cid === "sem_corretor" ? "Não distribuído" : userName(cid),
        leadsRecebidos: 0,
        visitasRealizadas: 0,
        propostasNegociando: 0,
        fechamentos: 0,
        vgvFechado: 0,
        comissaoFechada: 0,
        taxaConversaoVisita: 0,
        taxaConversaoFechamento: 0,
      }

      cur.leadsRecebidos++
      if (l.status === "visita agendada") cur.visitasRealizadas++
      if (l.status === "negociando") cur.propostasNegociando++
      if (l.status === "fechado") {
        cur.fechamentos++
        if (l.valorNegociacao) cur.vgvFechado += Number(l.valorNegociacao)
        if (l.valorComissao) cur.comissaoFechada += Number(l.valorComissao)
      }

      const vLead = visitasPorLead.get(l.id) || []
      if (vLead.length > 0) cur.visitasRealizadas += vLead.length

      mapaCorretores.set(cid, cur)
    }
  }

  const corretores: CorretorPerformanceTráfego[] = Array.from(mapaCorretores.values()).map((c) => ({
    ...c,
    taxaConversaoVisita: c.leadsRecebidos > 0 ? (c.visitasRealizadas / c.leadsRecebidos) * 100 : 0,
    taxaConversaoFechamento: c.leadsRecebidos > 0 ? (c.fechamentos / c.leadsRecebidos) * 100 : 0,
  }))
  corretores.sort((a, b) => b.fechamentos - a.fechamentos || b.leadsRecebidos - a.leadsRecebidos)

  // 7. Totais consolidados
  const totaisGerais = reconciliacoes.reduce(
    (acc, r) => {
      acc.gastoTotalMeta += r.spend
      acc.impressoesTotal += r.impressions
      acc.cliquesTotal += r.clicks
      acc.resultadosTotalMeta += r.metaResults
      acc.leadsTotalCrm += r.crmLeads
      acc.visitasTotal += r.crmVisitasAgendadas + r.crmVisitasRealizadas
      acc.fechamentosTotal += r.crmFechados
      acc.vgvTotalFechado += r.vgvFechado
      acc.comissaoTotalFechada += r.comissaoFechada
      return acc
    },
    {
      gastoTotalMeta: 0,
      impressoesTotal: 0,
      cliquesTotal: 0,
      resultadosTotalMeta: 0,
      leadsTotalCrm: 0,
      visitasTotal: 0,
      fechamentosTotal: 0,
      vgvTotalFechado: 0,
      comissaoTotalFechada: 0,
    }
  )

  const totais: TotaisReconciliacao = {
    ...totaisGerais,
    cplMetaMedio: totaisGerais.resultadosTotalMeta > 0 ? totaisGerais.gastoTotalMeta / totaisGerais.resultadosTotalMeta : 0,
    cplRealMedio: totaisGerais.leadsTotalCrm > 0 ? totaisGerais.gastoTotalMeta / totaisGerais.leadsTotalCrm : 0,
    cpvRealMedio: totaisGerais.visitasTotal > 0 ? totaisGerais.gastoTotalMeta / totaisGerais.visitasTotal : 0,
    cacRealMedio: totaisGerais.fechamentosTotal > 0 ? totaisGerais.gastoTotalMeta / totaisGerais.fechamentosTotal : 0,
    roasComissaoGeral: totaisGerais.gastoTotalMeta > 0 ? totaisGerais.comissaoTotalFechada / totaisGerais.gastoTotalMeta : 0,
    roasVgvGeral: totaisGerais.gastoTotalMeta > 0 ? totaisGerais.vgvTotalFechado / totaisGerais.gastoTotalMeta : 0,
    taxaDiscrepanciaGeral:
      totaisGerais.resultadosTotalMeta > 0
        ? Math.max(0, ((totaisGerais.resultadosTotalMeta - totaisGerais.leadsTotalCrm) / totaisGerais.resultadosTotalMeta) * 100)
        : 0,
    leadsOrfaosCount: leadsOrfaos.length,
  }

  return {
    reconciliacoes,
    corretores,
    totais,
    leadsOrfaos,
  }
}
