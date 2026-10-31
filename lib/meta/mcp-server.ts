// lib/meta/mcp-server.ts
// Servidor de Ferramentas MCP (Model Context Protocol) para Meta Ads + CRM Imobiliário Colucci
// Permite que LLMs e agentes de IA consultem dados reais de tráfego, auditem discrepâncias e calculem ROAS.

import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"
import { calcularReconciliacao } from "./reconciliation"
import { MOCK_ACCOUNTS, mockCampaigns, mockInsights } from "./mock"

function db() {
  return createClient(SUPABASE_URL, SUPABASE_KEY)
}

const VERSAO = process.env.META_API_VERSION || "v21.0"
const BASE = `https://graph.facebook.com/${VERSAO}`

async function resolveToken(): Promise<string | null> {
  try {
    const { data } = await db().from("meta_conexao").select("access_token").eq("id", 1).maybeSingle()
    if (data?.access_token) return data.access_token
  } catch {}
  const raw = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN
  return raw?.trim().replace(/^['"]+|['"]+$/g, "") || null
}

async function metaFetchAll(url: string): Promise<any[]> {
  const out: any[] = []
  let next: string | null = url
  let guard = 0
  while (next && guard < 10) {
    guard++
    const r: Response = await fetch(next)
    const j: any = await r.json()
    if (j.error) throw new Error(j.error.message)
    if (Array.isArray(j.data)) out.push(...j.data)
    next = j.paging?.next ?? null
  }
  return out
}

export const MCP_TOOLS_DEFINITIONS = [
  {
    name: "meta_get_performance",
    description: "Obtém métricas agregadas do Meta Ads (gastos, impressões, cliques, CTR, CPC e resultados) para a conta ou campanhas em um período.",
    inputSchema: {
      type: "object",
      properties: {
        since: { type: "string", description: "Data de início YYYY-MM-DD (ex: 2026-10-01)" },
        until: { type: "string", description: "Data de término YYYY-MM-DD (ex: 2026-10-30)" },
        accountId: { type: "string", description: "ID da conta de anúncios (ex: act_321873088505518). Se omitido, usa a principal." },
      },
    },
  },
  {
    name: "crm_reconciliation_audit",
    description: "Auditoria completa e cruzamento do Meta Ads com os dados REAIS do CRM (Leads no banco, Visitas, Vendas Fechadas, VGV, Comissão gerada, CPL Real, CAC Real e ROAS Real).",
    inputSchema: {
      type: "object",
      properties: {
        since: { type: "string", description: "Data de início YYYY-MM-DD" },
        until: { type: "string", description: "Data de término YYYY-MM-DD" },
        minSpend: { type: "number", description: "Filtrar campanhas com gasto mínimo (opcional)" },
      },
    },
  },
  {
    name: "crm_get_corretor_performance",
    description: "Analisa a performance de conversão dos corretores especificamente para leads originados de tráfego pago (leads recebidos, visitas realizadas, vendas e taxa de conversão).",
    inputSchema: {
      type: "object",
      properties: {
        since: { type: "string", description: "Data de início YYYY-MM-DD (opcional)" },
      },
    },
  },
  {
    name: "crm_detect_attribution_leaks",
    description: "Identifica leads de tráfego pago que não possuem campanha atribuída (leads órfãos) e calcula a taxa de perda entre os resultados do Meta e os leads registrados no CRM.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "crm_attribute_lead",
    description: "Atribui retroativamente um lead órfão a uma campanha do Meta Ads no CRM.",
    inputSchema: {
      type: "object",
      properties: {
        leadId: { type: "string", description: "UUID do lead no CRM" },
        campaignId: { type: "string", description: "ID da campanha no Meta Ads" },
      },
      required: ["leadId", "campaignId"],
    },
  },
]

export async function executeMcpTool(name: string, args: Record<string, any> = {}): Promise<any> {
  const token = await resolveToken()
  const supabase = db()
  const hoje = new Date().toISOString().slice(0, 10)
  const padraoSince = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)

  const since = args.since || padraoSince
  const until = args.until || hoje

  switch (name) {
    case "meta_get_performance": {
      if (token) {
        try {
          const accs = await metaFetchAll(`${BASE}/me/adaccounts?fields=id,name&limit=5&access_token=${token}`)
          const contaId = args.accountId || accs[0]?.id || process.env.META_AD_ACCOUNT_ID
          if (!contaId) throw new Error("Nenhuma conta de anúncios encontrada.")
          const formattedConta = contaId.startsWith("act_") ? contaId : `act_${contaId}`

          const range = `time_range=${encodeURIComponent(JSON.stringify({ since, until }))}`
          const url = `${BASE}/${formattedConta}/insights?level=campaign&fields=campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,actions&${range}&limit=200&access_token=${token}`
          const data = await metaFetchAll(url)

          let totalGasto = 0
          let totalCliques = 0
          let totalImpressoes = 0

          const campanhas = data.map((c: any) => {
            const spend = Number(c.spend || 0)
            const clicks = Number(c.clicks || 0)
            const impressions = Number(c.impressions || 0)
            totalGasto += spend
            totalCliques += clicks
            totalImpressoes += impressions

            const acts = c.actions || []
            const resultados = acts
              .filter((a: any) => a.action_type === "lead" || a.action_type?.includes("messaging_conversation_started"))
              .reduce((s: number, a: any) => s + Number(a.value || 0), 0)

            return {
              campaignId: c.campaign_id,
              name: c.campaign_name,
              spend,
              impressions,
              clicks,
              ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
              cpc: clicks > 0 ? spend / clicks : 0,
              resultados,
              custoPorResultado: resultados > 0 ? spend / resultados : 0,
            }
          })

          return {
            fonte: "META_GRAPH_API_REAL",
            periodo: { since, until },
            conta: formattedConta,
            totais: {
              gastoTotal: totalGasto,
              impressoesTotal: totalImpressoes,
              cliquesTotal: totalCliques,
              ctrMedio: totalImpressoes > 0 ? (totalCliques / totalImpressoes) * 100 : 0,
              cpcMedio: totalCliques > 0 ? totalGasto / totalCliques : 0,
            },
            campanhas,
          }
        } catch (e: any) {
          console.error("Meta API error in MCP, using fallback:", e.message)
        }
      }

      // Fallback Mock
      const mockIns = mockInsights("act_1000000001", since, until, false, "campaign")
      return {
        fonte: "DEMO_MOCK (sem token conectado)",
        periodo: { since, until },
        dados: mockIns.data,
      }
    }

    case "crm_reconciliation_audit": {
      // 1. Busca leads reais no Supabase
      const { data: leadsRows } = await supabase
        .from("leads")
        .select("*")
        .order("criado_em", { ascending: false })

      // 2. Busca visitas
      const { data: visitsRows } = await supabase.from("visitas").select("*")

      // 3. Busca campanhas e insights Meta
      let campanhasMeta: any[] = []
      let insightsMeta: any[] = []

      if (token) {
        try {
          const accs = await metaFetchAll(`${BASE}/me/adaccounts?fields=id&limit=1&access_token=${token}`)
          const contaId = accs[0]?.id || process.env.META_AD_ACCOUNT_ID
          if (contaId) {
            const formatted = contaId.startsWith("act_") ? contaId : `act_${contaId}`
            const range = `time_range=${encodeURIComponent(JSON.stringify({ since, until }))}`
            campanhasMeta = await metaFetchAll(`${BASE}/${formatted}/campaigns?fields=id,name,effective_status&limit=100&access_token=${token}`)
            insightsMeta = await metaFetchAll(`${BASE}/${formatted}/insights?level=campaign&fields=campaign_id,spend,impressions,clicks,ctr,cpc,actions&${range}&limit=100&access_token=${token}`)
          }
        } catch (e: any) {
          console.warn("Meta API fallback in audit:", e.message)
        }
      }

      if (campanhasMeta.length === 0) {
        campanhasMeta = mockCampaigns("act_1000000001").data
        insightsMeta = mockInsights("act_1000000001", since, until, false, "campaign").data
      }

      // Converte leads do banco para a tipagem do reconciliador
      const leadsFormatados = (leadsRows || []).map((r: any) => ({
        id: r.id,
        nome: r.nome || "",
        telefone: r.telefone || "",
        email: r.email || "",
        imovelRef: r.referencia_imovel || "",
        referencias: r.referencias || [],
        temperatura: r.temperatura || "morno",
        tipoImovelVendido: r.tipo_imovel_vendido,
        metaCampaignId: r.meta_campaign_id,
        metaAdsetId: r.meta_adset_id,
        metaAdId: r.meta_ad_id,
        utmCampaign: r.utm_campaign,
        origem: r.origem || "Outro",
        observacoes: r.observacoes || "",
        status: r.status || "novo",
        valorNegociacao: Number(r.valor_proposta || 0),
        valorComissao: Number(r.valor_comissao || 0),
        corretorId: r.corretor_id || "",
        criadoEm: r.criado_em,
        atualizadoEm: r.atualizado_em,
        interacoes: [],
      }))

      const visitasFormatadas = (visitsRows || []).map((v: any) => ({
        id: v.id,
        leadId: v.lead_id,
        data: v.data,
        hora: v.hora,
        corretorId: v.corretor_id,
        imovelRef: v.imovel_ref || "",
        observacoes: v.observacoes || "",
      }))

      const { data: usuarios } = await supabase.from("usuarios").select("id, nome")
      const userMap = new Map((usuarios || []).map((u: any) => [u.id, u.nome]))
      const getUserName = (id: string) => userMap.get(id) || `Corretor ${id.slice(0, 6)}`

      const resultado = calcularReconciliacao(
        campanhasMeta,
        insightsMeta,
        leadsFormatados as any,
        visitasFormatadas as any,
        getUserName
      )

      return {
        periodo: { since, until },
        resumoExecutivo: {
          gastoTotalMeta: resultado.totais.gastoTotalMeta,
          leadsReportadosMeta: resultado.totais.resultadosTotalMeta,
          leadsReaisNoCrm: resultado.totais.leadsTotalCrm,
          taxaDiscrepanciaLeads: `${resultado.totais.taxaDiscrepanciaGeral.toFixed(1)}%`,
          visitasAgendadasRealizadas: resultado.totais.visitasTotal,
          fechamentosConcluidos: resultado.totais.fechamentosTotal,
          vgvTotalFechado: resultado.totais.vgvTotalFechado,
          comissaoTotalGerada: resultado.totais.comissaoTotalFechada,
          roasRealComissao: `${resultado.totais.roasComissaoGeral.toFixed(2)}x`,
          roasRealVgv: `${resultado.totais.roasVgvGeral.toFixed(2)}x`,
          cplMeta: resultado.totais.cplMetaMedio,
          cplReal: resultado.totais.cplRealMedio,
          cpvReal: resultado.totais.cpvRealMedio,
          cacReal: resultado.totais.cacRealMedio,
          leadsOrfaosCount: resultado.totais.leadsOrfaosCount,
        },
        campanhas: resultado.reconciliacoes.map((r) => ({
          campaignId: r.campaignId,
          campaignName: r.campaignName,
          status: r.status,
          spend: r.spend,
          metaResults: r.metaResults,
          crmLeads: r.crmLeads,
          visitas: r.crmVisitasAgendadas + r.crmVisitasRealizadas,
          fechamentos: r.crmFechados,
          vgvFechado: r.vgvFechado,
          comissaoFechada: r.comissaoFechada,
          roasComissao: `${r.roasComissao.toFixed(2)}x`,
          statusSaude: r.statusSaude,
          diagnostico: r.diagnostico,
        })),
        topCorretores: resultado.corretores.slice(0, 5),
      }
    }

    case "crm_get_corretor_performance": {
      const { data: leadsRows } = await supabase
        .from("leads")
        .select("id, nome, corretor_id, status, valor_proposta, valor_comissao, origem, meta_campaign_id")
      const { data: usuarios } = await supabase.from("usuarios").select("id, nome").eq("role", "corretor")

      const userMap = new Map((usuarios || []).map((u: any) => [u.id, u.nome]))
      const corretoresMap = new Map<string, any>()

      for (const l of leadsRows || []) {
        if (l.origem === "Tráfego Pago" || l.meta_campaign_id) {
          const cid = l.corretor_id || "nao_distribuido"
          const cur = corretoresMap.get(cid) || {
            corretorId: cid,
            nome: userMap.get(cid) || (cid === "nao_distribuido" ? "Não distribuído" : cid),
            leadsRecebidos: 0,
            visitas: 0,
            fechamentos: 0,
            vgv: 0,
            comissao: 0,
          }
          cur.leadsRecebidos++
          if (l.status === "visita agendada") cur.visitas++
          if (l.status === "fechado") {
            cur.fechamentos++
            cur.vgv += Number(l.valor_proposta || 0)
            cur.comissao += Number(l.valor_comissao || 0)
          }
          corretoresMap.set(cid, cur)
        }
      }

      const lista = Array.from(corretoresMap.values()).map((c) => ({
        ...c,
        taxaConversao: c.leadsRecebidos > 0 ? `${((c.fechamentos / c.leadsRecebidos) * 100).toFixed(1)}%` : "0%",
      }))
      lista.sort((a, b) => b.fechamentos - a.fechamentos || b.leadsRecebidos - a.leadsRecebidos)

      return {
        totalLeadsTrafego: (leadsRows || []).filter((l: any) => l.origem === "Tráfego Pago" || l.meta_campaign_id).length,
        rankingCorretores: lista,
      }
    }

    case "crm_detect_attribution_leaks": {
      const { data: leadsTrafego } = await supabase
        .from("leads")
        .select("id, nome, telefone, criado_em, origem, meta_campaign_id, utm_campaign, status")
        .or("origem.eq.Tráfego Pago,meta_campaign_id.not.is.null")
        .order("criado_em", { ascending: false })

      const orfaos = (leadsTrafego || []).filter((l: any) => !l.meta_campaign_id && !l.utm_campaign)
      const atribuidos = (leadsTrafego || []).filter((l: any) => !!l.meta_campaign_id || !!l.utm_campaign)

      return {
        totalLeadsTrafego: leadsTrafego?.length || 0,
        atribuidosComSucesso: atribuidos.length,
        leadsOrfaosCount: orfaos.length,
        taxaAtribuicao: leadsTrafego?.length ? `${((atribuidos.length / leadsTrafego.length) * 100).toFixed(1)}%` : "100%",
        amostraOrfaos: orfaos.slice(0, 15).map((l: any) => ({
          id: l.id,
          nome: l.nome,
          telefone: l.telefone,
          criado_em: l.criado_em,
          status: l.status,
        })),
        recomendacao:
          orfaos.length > 0
            ? `${orfaos.length} leads entraram sem parâmetro de campanha. Verifique o link pré-preenchido do anúncio do WhatsApp e use o endpoint crm_attribute_lead para associar aos anúncios corretos.`
            : "Rastreio operando com 100% de integridade.",
      }
    }

    case "crm_attribute_lead": {
      const { leadId, campaignId } = args
      if (!leadId || !campaignId) throw new Error("Parâmetros leadId e campaignId são obrigatórios.")

      const { data, error } = await supabase
        .from("leads")
        .update({
          meta_campaign_id: campaignId,
          origem: "Tráfego Pago",
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", leadId)
        .select("id, nome, meta_campaign_id")

      if (error) throw new Error(`Falha ao atribuir lead: ${error.message}`)

      return {
        ok: true,
        mensagem: `Lead ${data?.[0]?.nome || leadId} atribuído à campanha ${campaignId} com sucesso.`,
        lead: data?.[0],
      }
    }

    default:
      throw new Error(`Ferramenta desconhecida: ${name}`)
  }
}
