// __tests__/meta/reconciliation.test.ts
import { describe, it, expect } from "vitest"
import { calcularReconciliacao } from "../../lib/meta/reconciliation"
import type { Lead, Visit } from "../../lib/mock-data"

describe("calcularReconciliacao", () => {
  it("deve calcular ROAS, CAC, CPV e discrepância de leads corretamente", () => {
    const campanhasMeta = [
      { id: "camp_1", name: "Campanha Apto Centro", effective_status: "ACTIVE" },
      { id: "camp_2", name: "Campanha Casas Condomínio", effective_status: "ACTIVE" },
    ]

    const insightsMeta = [
      {
        campaign_id: "camp_1",
        spend: "1000",
        impressions: "50000",
        clicks: "1000",
        actions: [{ action_type: "lead", value: "20" }],
      },
      {
        campaign_id: "camp_2",
        spend: "500",
        impressions: "20000",
        clicks: "400",
        actions: [{ action_type: "messaging_conversation_started", value: "10" }],
      },
    ]

    const leads: Partial<Lead>[] = [
      // 15 leads para camp_1 (Meta reportou 20 => discrepância de 5)
      { id: "l1", nome: "Lead 1", metaCampaignId: "camp_1", origem: "Tráfego Pago", status: "fechado", valorNegociacao: 500000, valorComissao: 30000 },
      { id: "l2", nome: "Lead 2", metaCampaignId: "camp_1", origem: "Tráfego Pago", status: "visita agendada" },
      { id: "l3", nome: "Lead 3", metaCampaignId: "camp_1", origem: "Tráfego Pago", status: "em_atendimento" },
      // Lead órfão (sem metaCampaignId)
      { id: "l_orfao", nome: "Lead Órfão", origem: "Tráfego Pago", status: "novo" },
    ]

    const visits: Partial<Visit>[] = [
      { id: "v1", leadId: "l1", data: "2026-10-15", hora: "14:00" },
      { id: "v2", leadId: "l2", data: "2026-10-16", hora: "16:00" },
    ]

    const res = calcularReconciliacao(
      campanhasMeta,
      insightsMeta,
      leads as Lead[],
      visits as Visit[],
      (id) => `Corretor ${id}`
    )

    expect(res.reconciliacoes).toHaveLength(3)

    const c1 = res.reconciliacoes.find((r) => r.campaignId === "camp_1")!
    expect(c1).toBeDefined()
    expect(c1.spend).toBe(1000)
    expect(c1.metaResults).toBe(20)
    expect(c1.crmLeads).toBe(3)
    expect(c1.discrepanciaLeads).toBe(17)
    expect(c1.crmFechados).toBe(1)
    expect(c1.comissaoFechada).toBe(30000)
    expect(c1.vgvFechado).toBe(500000)

    // ROAS = 30000 / 1000 = 30x
    expect(c1.roasComissao).toBe(30)
    expect(c1.statusSaude).toBe("excelente")

    // Linha de Tráfego Pago Geral (Click-to-WhatsApp)
    const cOrf = res.reconciliacoes.find((r) => r.campaignId === "click_to_whatsapp_geral")!
    expect(cOrf).toBeDefined()
    expect(cOrf.crmLeads).toBe(1)

    // Leads órfãos
    expect(res.leadsOrfaos).toHaveLength(1)
    expect(res.leadsOrfaos[0].id).toBe("l_orfao")

    // Totais consolidados (inclui todos os 4 leads de tráfego pago)
    expect(res.totais.gastoTotalMeta).toBe(1500)
    expect(res.totais.leadsTotalCrm).toBe(4)
    expect(res.totais.comissaoTotalFechada).toBe(30000)
    expect(res.totais.roasComissaoGeral).toBe(20) // 30000 / 1500 = 20x
  })
})
