// lib/meta/reconciliation.ts
// Motor de Reconciliação e Auditoria Paralela: Meta Ads (Marketing API) × CRM Real (Supabase)
// Cruza métricas reais de anúncios com o funil real do CRM:
// Leads no banco, Visitas presenciais, Propostas, Vendas/Locações Fechadas, VGV e Comissões.

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
  metaResults: number // Resultados reportados pelo Meta (conversas de WhatsApp, leads instantâneos ou pixel)
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
  comissaoFechada: number // Soma da comissão real gerada (ou estimada a 5% se não preenchida)

  // Unit Economics Reais
  cplReal: number // Gasto ÷ Leads reais no CRM
  cpvReal: number // Gasto ÷ (Visitas Realizadas + Visitas Agendadas)
  cacReal: number // Gasto ÷ Fechamentos reais
  roasComissao: number // Comissão Real ÷ Gasto
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
  leadsOrfaosCount: number
}

/**
 * Extrai a métrica oficial de "Resultados" do Meta Ads a partir do array actions do Insights.
 * Cobre Click-to-WhatsApp (conversas iniciadas), Lead Ads instantâneos, Cadastros via Pixel e Contatos.
 * Evita contagem duplicada priorizando a métrica primária da campanha.
 */
export function extrairResultadosMeta(row: any): number {
  if (!row) return 0
  const acts: any[] = row.actions || []
  if (acts.length === 0) return 0

  // 1. Conversas iniciadas no WhatsApp / Direct / Messenger
  const msg7d = acts.find((a: any) => a.action_type === "onsite_conversion.messaging_conversation_started_7d")
  const msgGeneral = acts.find(
    (a: any) => a.action_type === "messaging_conversation_started_7d" || a.action_type === "messaging_conversation_started"
  )
  const msgConexao = acts.find((a: any) => a.action_type === "onsite_conversion.total_messaging_connection")
  const msgCount = Number(msg7d?.value || msgGeneral?.value || msgConexao?.value || 0)

  // 2. Cadastros / Formulários (Lead Ads instantâneos ou Pixel do site)
  const leadGrouped = acts.find((a: any) => a.action_type === "onsite_conversion.lead_grouped")
  const leadStandard = acts.find((a: any) => a.action_type === "lead")
  const leadPixel = acts.find(
    (a: any) => a.action_type === "offsite_conversion.fb_pixel_lead" || a.action_type === "offsite_conversion.lead"
  )
  const leadCount = Number(leadGrouped?.value || leadStandard?.value || leadPixel?.value || 0)

  // 3. Contatos
  const contact = acts.find((a: any) => a.action_type === "contact_total" || a.action_type === "contact")
  const contactCount = Number(contact?.value || 0)

  const principal = msgCount + leadCount
  if (principal > 0) return principal
  if (contactCount > 0) return contactCount

  // Fallback para campanhas de tráfego (cliques no link)
  const linkClick = acts.find((a: any) => a.action_type === "link_click")
  return Number(linkClick?.value || 0)
}

/**
 * Calcula a reconciliação completa entre as campanhas do Meta Ads e os leads e visitas do CRM.
 * Suporta filtro de período estrito (since/until) no fuso de Brasília e atribuição de leads Click-to-WhatsApp.
 */
export function calcularReconciliacao(
  campanhasMeta: any[],
  insightsMeta: any[],
  leads: Lead[],
  visits: Visit[],
  userName: (id: string) => string,
  periodo?: { since: string; until: string }
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

  // 2. Filtra leads pelo período selecionado (se informado)
  const leadsPeriodo = (leads || []).filter((l) => {
    if (!periodo?.since || !periodo?.until) return true
    const dt = l.criadoEm ? l.criadoEm.slice(0, 10) : ""
    return dt >= periodo.since && dt <= periodo.until
  })

  // 3. Mapeia visitas por Lead ID (no período, se aplicável)
  const visitasPorLead = new Map<string, Visit[]>()
  for (const v of visits || []) {
    if (v.leadId) {
      if (periodo?.since && periodo?.until && v.data) {
        if (v.data < periodo.since || v.data > periodo.until) continue
      }
      const list = visitasPorLead.get(v.leadId) || []
      list.push(v)
      visitasPorLead.set(v.leadId, list)
    }
  }

  // 4. Agrupa leads do CRM por campanha
  const leadsPorCamp = new Map<string, Lead[]>()
  const leadsOrfaos: Lead[] = []
  const leadsTrafegoTodos: Lead[] = []

  for (const l of leadsPeriodo) {
    const ehTrafego = l.origem === "Tráfego Pago" || !!l.metaCampaignId || !!l.utmCampaign

    if (ehTrafego) {
      leadsTrafegoTodos.push(l)
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

  // 5. Tenta correspondência inteligente por referência de imóvel
  // Se o lead tem imovelRef e o nome de uma campanha contém essa ref, atribui à campanha
  const campanhasParaAnalisar = new Map<string, { id: string; name: string; status?: string }>()
  for (const c of campanhasMeta || []) {
    campanhasParaAnalisar.set(String(c.id), { id: String(c.id), name: c.name, status: c.effective_status })
  }
  for (const cid of leadsPorCamp.keys()) {
    if (!campanhasParaAnalisar.has(cid)) {
      campanhasParaAnalisar.set(cid, { id: cid, name: `Campanha #${cid}`, status: "ACTIVE" })
    }
  }

  const leadsOrfaosNaoAtribuidos: Lead[] = []
  for (const l of leadsOrfaos) {
    let casado = false
    if (l.imovelRef) {
      for (const [cid, cInfo] of campanhasParaAnalisar.entries()) {
        if (cInfo.name && cInfo.name.includes(l.imovelRef)) {
          const list = leadsPorCamp.get(cid) || []
          list.push(l)
          leadsPorCamp.set(cid, list)
          casado = true
          break
        }
      }
    }
    if (!casado) {
      leadsOrfaosNaoAtribuidos.push(l)
    }
  }

  // 6. Constrói a lista de reconciliação para cada campanha
  const reconciliacoes: CampaignReconciliation[] = []

  for (const [cid, cInfo] of campanhasParaAnalisar.entries()) {
    const ins = insPorCamp.get(cid)
    const spend = Number(ins?.spend || 0)
    const impressions = Number(ins?.impressions || 0)
    const clicks = Number(ins?.clicks || 0)
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : Number(ins?.ctr || 0)
    const cpc = clicks > 0 ? spend / clicks : Number(ins?.cpc || 0)
    const metaResults = ins ? extrairResultadosMeta(ins) : 0
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
        const vNeg = Number(l.valorNegociacao || 0)
        vgvFechado += vNeg
        // Se a comissão foi informada usa ela, caso contrário estima a comissão padrão de 5% sobre a proposta
        const vCom = l.valorComissao != null ? Number(l.valorComissao) : vNeg * 0.05
        comissaoFechada += vCom
      } else if (st === "perdido") crmPerdidos++

      const visitsDoLead = visitasPorLead.get(l.id) || []
      if (visitsDoLead.length > 0) {
        crmVisitasRealizadas += visitsDoLead.length
      }
    }

    const totalVisitas = crmVisitasAgendadas + crmVisitasRealizadas
    const cplReal = crmLeads > 0 ? spend / crmLeads : 0
    const cpvReal = totalVisitas > 0 ? spend / totalVisitas : 0
    const cacReal = crmFechados > 0 ? spend / crmFechados : 0
    const roasComissao = spend > 0 ? comissaoFechada / spend : 0
    const roasVgv = spend > 0 ? vgvFechado / spend : 0

    const discrepanciaLeads = metaResults - crmLeads
    const discrepanciaPct = metaResults > 0 ? Math.max(0, (discrepanciaLeads / metaResults) * 100) : 0
    const taxaConversaoVisita = crmLeads > 0 ? (totalVisitas / crmLeads) * 100 : 0
    const taxaConversaoFechamento = crmLeads > 0 ? (crmFechados / crmLeads) * 100 : 0

    let statusSaude: CampaignReconciliation["statusSaude"] = "atencao"
    let diagnostico = "Sem dados suficientes para avaliar."

    if (roasComissao >= 2 || comissaoFechada > spend) {
      statusSaude = "excelente"
      diagnostico = `Altamente lucrativa: ${crmFechados} venda(s) gerando ROAS de ${roasComissao.toFixed(1)}x em comissão.`
    } else if (totalVisitas >= 2) {
      statusSaude = "lucrativo"
      diagnostico = `Boa conversão: gerou ${totalVisitas} visita(s) presenciais no CRM.`
    } else if (spend > 300 && totalVisitas === 0 && crmFechados === 0) {
      statusSaude = "critico"
      diagnostico = `Ponto de atenção: R$ ${spend.toFixed(0)} investidos sem visitas agendadas no CRM.`
    } else {
      statusSaude = "atencao"
      diagnostico = `Em monitoramento: gerou ${crmLeads} lead(s) com CPL real de R$ ${cplReal.toFixed(2)}.`
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

  // 7. Se houver leads de Tráfego Pago diretos do WhatsApp sem campanha explícita,
  // inclui linha destacada para que o gestor veja a performance consolidada desse canal
  if (leadsOrfaosNaoAtribuidos.length > 0) {
    let orfNovos = 0
    let orfEmAtend = 0
    let orfVisitas = 0
    let orfFechados = 0
    let orfVgv = 0
    let orfComissao = 0

    for (const l of leadsOrfaosNaoAtribuidos) {
      if (l.status === "novo") orfNovos++
      else if (l.status === "em_atendimento" || l.status === "atendimento_ia") orfEmAtend++
      else if (l.status === "visita agendada") orfVisitas++
      else if (l.status === "fechado") {
        orfFechados++
        const vNeg = Number(l.valorNegociacao || 0)
        orfVgv += vNeg
        orfComissao += l.valorComissao != null ? Number(l.valorComissao) : vNeg * 0.05
      }
      const vLead = visitasPorLead.get(l.id) || []
      if (vLead.length > 0) orfVisitas += vLead.length
    }

    reconciliacoes.push({
      campaignId: "click_to_whatsapp_geral",
      campaignName: "Tráfego Pago Geral (Click-to-WhatsApp / Direto)",
      status: "ACTIVE",
      spend: 0,
      impressions: 0,
      clicks: 0,
      ctr: 0,
      cpc: 0,
      metaResults: leadsOrfaosNaoAtribuidos.length,
      costPerMetaResult: 0,
      crmLeads: leadsOrfaosNaoAtribuidos.length,
      crmNovos: orfNovos,
      crmEmAtendimento: orfEmAtend,
      crmVisitasAgendadas: orfVisitas,
      crmVisitasRealizadas: orfVisitas,
      crmNegociando: 0,
      crmFechados: orfFechados,
      crmPerdidos: 0,
      vgvFechado: orfVgv,
      comissaoFechada: orfComissao,
      cplReal: 0,
      cpvReal: 0,
      cacReal: 0,
      roasComissao: 0,
      roasVgv: 0,
      discrepanciaLeads: 0,
      discrepanciaPct: 0,
      taxaConversaoVisita: (orfVisitas / leadsOrfaosNaoAtribuidos.length) * 100,
      taxaConversaoFechamento: (orfFechados / leadsOrfaosNaoAtribuidos.length) * 100,
      statusSaude: orfFechados > 0 ? "excelente" : "atencao",
      diagnostico: `${leadsOrfaosNaoAtribuidos.length} leads de Tráfego Pago recebidos no WhatsApp no período com ${orfFechados} vendas.`,
    })
  }

  // Ordena por maior gasto primeiro
  reconciliacoes.sort((a, b) => b.spend - a.spend || b.crmLeads - a.crmLeads)

  // 8. Performance por Corretor nos leads de Tráfego Pago
  const mapaCorretores = new Map<string, CorretorPerformanceTráfego>()
  for (const l of leadsTrafegoTodos) {
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
      const vNeg = Number(l.valorNegociacao || 0)
      cur.vgvFechado += vNeg
      cur.comissaoFechada += l.valorComissao != null ? Number(l.valorComissao) : vNeg * 0.05
    }

    const vLead = visitasPorLead.get(l.id) || []
    if (vLead.length > 0) cur.visitasRealizadas += vLead.length

    mapaCorretores.set(cid, cur)
  }

  const corretores: CorretorPerformanceTráfego[] = Array.from(mapaCorretores.values()).map((c) => ({
    ...c,
    taxaConversaoVisita: c.leadsRecebidos > 0 ? (c.visitasRealizadas / c.leadsRecebidos) * 100 : 0,
    taxaConversaoFechamento: c.leadsRecebidos > 0 ? (c.fechamentos / c.leadsRecebidos) * 100 : 0,
  }))
  corretores.sort((a, b) => b.fechamentos - a.fechamentos || b.leadsRecebidos - a.leadsRecebidos)

  // 9. Totais Consolidados (inclui TODOS os leads reais de Tráfego Pago do período)
  let gastoTotalMeta = 0
  let impressoesTotal = 0
  let cliquesTotal = 0
  let resultadosTotalMeta = 0

  for (const r of reconciliacoes) {
    gastoTotalMeta += r.spend
    impressoesTotal += r.impressions
    cliquesTotal += r.clicks
    resultadosTotalMeta += r.metaResults
  }

  // Totais reais do CRM para tráfego pago
  const leadsTotalCrm = leadsTrafegoTodos.length
  let visitasTotal = 0
  let fechamentosTotal = 0
  let vgvTotalFechado = 0
  let comissaoTotalFechada = 0

  for (const l of leadsTrafegoTodos) {
    if (l.status === "visita agendada") visitasTotal++
    if (l.status === "fechado") {
      fechamentosTotal++
      const vNeg = Number(l.valorNegociacao || 0)
      vgvTotalFechado += vNeg
      comissaoTotalFechada += l.valorComissao != null ? Number(l.valorComissao) : vNeg * 0.05
    }
    const vLead = visitasPorLead.get(l.id) || []
    if (vLead.length > 0) visitasTotal += vLead.length
  }

  const totais: TotaisReconciliacao = {
    gastoTotalMeta,
    impressoesTotal,
    cliquesTotal,
    resultadosTotalMeta,
    leadsTotalCrm,
    visitasTotal,
    fechamentosTotal,
    vgvTotalFechado,
    comissaoTotalFechada,
    cplMetaMedio: resultadosTotalMeta > 0 ? gastoTotalMeta / resultadosTotalMeta : 0,
    cplRealMedio: leadsTotalCrm > 0 ? gastoTotalMeta / leadsTotalCrm : 0,
    cpvRealMedio: visitasTotal > 0 ? gastoTotalMeta / visitasTotal : 0,
    cacRealMedio: fechamentosTotal > 0 ? gastoTotalMeta / fechamentosTotal : 0,
    roasComissaoGeral: gastoTotalMeta > 0 ? comissaoTotalFechada / gastoTotalMeta : 0,
    roasVgvGeral: gastoTotalMeta > 0 ? vgvTotalFechado / gastoTotalMeta : 0,
    taxaDiscrepanciaGeral:
      resultadosTotalMeta > 0
        ? Math.max(0, ((resultadosTotalMeta - leadsTotalCrm) / resultadosTotalMeta) * 100)
        : 0,
    leadsOrfaosCount: leadsOrfaosNaoAtribuidos.length,
  }

  return {
    reconciliacoes,
    corretores,
    totais,
    leadsOrfaos: leadsOrfaosNaoAtribuidos,
  }
}
