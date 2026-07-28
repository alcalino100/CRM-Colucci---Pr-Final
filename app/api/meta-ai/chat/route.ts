import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"

function db() {
  return createClient(SUPABASE_URL, SUPABASE_KEY)
}

const GEMINI_KEY = process.env.GEMINI_API_KEY
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

interface Mensagem {
  role: "user" | "assistant"
  content: string
}

// ---------- Token: mesmo padrão do /api/meta ----------
async function resolveToken(): Promise<string | null> {
  try {
    const { data } = await db().from("meta_conexao").select("access_token").eq("id", 1).maybeSingle()
    if (data?.access_token) return data.access_token
  } catch { }
  const raw = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN
  return raw?.trim().replace(/^['"]+|['"]+$/g, "") || null
}

const VERSAO = process.env.META_API_VERSION || "v21.0"
const BASE = `https://graph.facebook.com/${VERSAO}`

function resultados(actions: any[]): number {
  return (actions || [])
    .filter((a: any) => a.action_type === "lead" || a.action_type?.includes("messaging_conversation_started"))
    .reduce((s: number, a: any) => s + Number(a.value || 0), 0)
}

export async function POST(req: Request) {
  try {
    const { message, history = [] }: { message: string; history?: Mensagem[] } = await req.json()
    if (!message?.trim()) return NextResponse.json({ response: "Digite uma pergunta." })

    const token = await resolveToken()
    const supabase = db()

    // Busca leads do CRM do período (últimos 30 dias)
    const trintaDias = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
    const hoje = new Date().toISOString().slice(0, 10)
    const { data: leadsData } = await supabase
      .from("leads").select("meta_campaign_id, created_at, status, corretor_id")
      .eq("origem", "Tráfego Pago").not("meta_campaign_id", "is", null)
      .gte("created_at", trintaDias).lte("created_at", hoje)

    const leadsPorCamp = new Map<string, number>()
    for (const l of leadsData ?? []) {
      const cid = l.meta_campaign_id
      leadsPorCamp.set(cid, (leadsPorCamp.get(cid) ?? 0) + 1)
    }

    // Constrói contexto: Meta API (fresco) ou Supabase (cache) ou só leads
    let dadosContexto = ""
    let totalSpend = 0
    let totalResults = 0
    let totalLeads = leadsData?.length ?? 0
    let campanhasContext: { id: string; nome: string; gasto: number; resultados: number; impressoes: number; cliques: number; ctr: number; cpc: number; leads: number }[] = []

    // Tenta buscar dados da Meta API (rota preferencial)
    let metaOk = false
    if (token) {
      try {
        // Descobre a conta de anúncios (mesmo método do /api/meta)
        const accsRes = await fetch(`${BASE}/me/adaccounts?fields=id&limit=1&access_token=${token}`)
        const accsJson = await accsRes.json()
        let contaId = accsJson?.data?.[0]?.id ||
          process.env.META_AD_ACCOUNT_ID ||
          ""

        if (contaId) {
          if (!contaId.startsWith("act_")) contaId = `act_${contaId}`
          const range = `time_range=${encodeURIComponent(JSON.stringify({ since: trintaDias, until: hoje }))}`
          const fields = "campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,cost_per_action_type"
          const url = `${BASE}/${contaId}/insights?level=campaign&fields=${fields}&${range}&limit=500&access_token=${token}`

          const res = await fetch(url)
          const json = await res.json()
          const data: any[] = json.data || []

          for (const r of data) {
            const spend = Number(r.spend || 0)
            const resCount = resultados(r.actions)
            totalSpend += spend
            totalResults += resCount
            const campId = r.campaign_id
            campanhasContext.push({
              id: campId,
              nome: r.campaign_name || campId,
              gasto: spend,
              resultados: resCount,
              impressoes: Number(r.impressions || 0),
              cliques: Number(r.clicks || 0),
              ctr: Number(r.ctr || 0),
              cpc: Number(r.cpc || 0),
              leads: leadsPorCamp.get(campId) ?? 0,
            })
          }

          campanhasContext.sort((a, b) => b.gasto - a.gasto)
          metaOk = true
        } else {
          console.error("Nenhuma conta de anúncios encontrada via API ou env var")
        }
      } catch (e: any) {
        console.error("Meta API insight error:", e.message)
      }
    }

    if (metaOk) {
      const cpl = totalLeads > 0 ? (totalSpend / totalLeads).toFixed(2) : "N/A"
      dadosContexto = `CONTEXTO - DADOS REAIS DA CONTA META ADS (${trintaDias} a ${hoje}):

Gasto total: R$ ${totalSpend.toFixed(2)}
Total de resultados (leads+conversas): ${totalResults}
Total de leads no CRM: ${totalLeads}
Custo por lead (CPL): R$ ${cpl}
Campanhas com gasto: ${campanhasContext.length}

CAMPANHAS:
${campanhasContext.map(c =>
  `- ${c.nome} | Gasto: R$ ${c.gasto.toFixed(2)} | Impressões: ${c.impressoes} | Cliques: ${c.cliques} | CTR: ${c.ctr.toFixed(2)}% | CPC: R$ ${c.cpc.toFixed(2)} | Resultados: ${c.resultados} | Leads CRM: ${c.leads}`
).join("\n")}

LEADS RECENTES (${totalLeads} total):
${(leadsData ?? []).slice(0, 5).map((l: any) => `- Lead #${String(l.id).slice(0, 8)} | Status: ${l.status ?? "novo"} | Corretor: ${l.corretor_id ?? "não atribuído"}`).join("\n")}`
    } else {
      // Fallback: Supabase tables
      try {
        const { data: campRows } = await supabase.from("meta_insights_campaign_daily").select("*")
          .gte("data", trintaDias).lte("data", hoje)
        const { data: campanhas } = await supabase.from("meta_campanhas").select("id, nome, status")

        const campMap = new Map((campanhas ?? []).map((c: any) => [c.id, c]))
        const gastoPorCamp = new Map<string, { gasto: number; impressoes: number; cliques: number; conversas: number }>()
        for (const r of campRows ?? []) {
          const cur = gastoPorCamp.get(r.campanha_id) ?? { gasto: 0, impressoes: 0, cliques: 0, conversas: 0 }
          cur.gasto += Number(r.gasto ?? 0)
          cur.impressoes += Number(r.impressoes ?? 0)
          cur.cliques += Number(r.cliques ?? 0)
          cur.conversas += Number(r.mensagens_iniciadas ?? 0)
          gastoPorCamp.set(r.campanha_id, cur)
        }

        totalSpend = [...gastoPorCamp.values()].reduce((s, g) => s + g.gasto, 0)
        totalResults = [...gastoPorCamp.values()].reduce((s, g) => s + g.conversas, 0)

        campanhasContext = [...gastoPorCamp.entries()].map(([id, g]) => {
          const c = campMap.get(id)
          return {
            id, nome: c?.nome ?? id, gasto: g.gasto, resultados: g.conversas,
            impressoes: g.impressoes, cliques: g.cliques,
            ctr: g.impressoes ? (g.cliques / g.impressoes) * 100 : 0,
            cpc: g.cliques ? g.gasto / g.cliques : 0,
            leads: leadsPorCamp.get(id) ?? 0,
          }
        }).sort((a, b) => b.gasto - a.gasto)

        const cpl = totalLeads > 0 ? (totalSpend / totalLeads).toFixed(2) : "N/A"
        dadosContexto = `CONTEXTO - DADOS DO BANCO LOCAL (${trintaDias} a ${hoje}):

Gasto total: R$ ${totalSpend.toFixed(2)}
Total de conversas registradas: ${totalResults}
Total de leads no CRM: ${totalLeads}
Custo por lead (CPL): R$ ${cpl}
Campanhas com gasto: ${campanhasContext.length}

CAMPANHAS:
${campanhasContext.map(c =>
  `- ${c.nome} | Gasto: R$ ${c.gasto.toFixed(2)} | Impressões: ${c.impressoes} | Cliques: ${c.cliques} | CTR: ${c.ctr.toFixed(2)}% | CPC: R$ ${c.cpc.toFixed(2)} | Conversas: ${c.resultados} | Leads CRM: ${c.leads}`
).join("\n")}`
      } catch (e: any) {
        console.error("Supabase fallback error:", e.message)
        dadosContexto = `CONTEXTO - DADOS PARCIAIS (${trintaDias} a ${hoje}):
Total de leads no CRM: ${totalLeads}
Campanhas: dados indisponíveis no momento.`
      }
    }

    // Gemini
    if (GEMINI_KEY) {
      try {
        const systemPrompt = `Você é um analista de Meta Ads da Imobiliária Colucci. Responda EM PORTUGUÊS BRASILEIRO de forma clara, direta e amigável, como se fosse um especialista conversando com o gestor da imobiliária.

Você recebeu dados REAIS da conta de anúncios. Use esses dados para responder. Seja específico: mencione nomes de campanhas, valores exatos, métricas. Não invente dados. Se não houver dados suficientes para responder, diga claramente.

Sempre responda em texto natural, sem marcadores especiais. Máximo 4 parágrafos.`

        const gemBody = {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [
            { role: "user", parts: [{ text: dadosContexto }] },
            { role: "model", parts: [{ text: "Ok, recebi os dados da conta. Vou analisar e responder com base neles." }] },
            ...history.map((m) => ({
              role: m.role === "assistant" ? "model" as const : "user" as const,
              parts: [{ text: m.content }],
            })),
            { role: "user", parts: [{ text: message }] },
          ],
          generationConfig: { temperature: 0.5, maxOutputTokens: 1024 },
        }

        const gemRes = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(gemBody),
        })

        if (gemRes.ok) {
          const gemJson = await gemRes.json()
          const text = gemJson?.candidates?.[0]?.content?.parts?.[0]?.text || ""
          if (text) return NextResponse.json({ response: text })
        }

        const errText = await gemRes.text()
        console.error("Gemini error:", gemRes.status, errText.slice(0, 400))
      } catch (e) {
        console.error("Gemini exception:", e)
      }
    }

    // Fallback
    const res = fallbackResposta(message, campanhasContext, totalSpend, totalResults, totalLeads)
    return NextResponse.json({ response: res })
  } catch (e: any) {
    return NextResponse.json({ response: `Erro ao processar: ${e.message}` }, { status: 500 })
  }
}

function fallbackResposta(
  message: string,
  campanhas: { id: string; nome: string; gasto: number; resultados: number; impressoes: number; cliques: number; ctr: number; cpc: number; leads: number }[],
  totalSpend: number,
  totalResults: number,
  totalLeads: number,
) {
  const msg = message.toLowerCase()
  const lines: string[] = []
  const ativas = campanhas.filter(c => c.gasto > 0)
  const cpl = totalLeads > 0 ? totalSpend / totalLeads : 0

  if (msg.includes("melhor") || msg.includes("top") || msg.includes("destaque") || msg.includes("bom") || msg.includes("criativo") || msg.includes("anúncio")) {
    const top = [...campanhas].filter(c => c.resultados > 0)
      .sort((a, b) => b.resultados - a.resultados).slice(0, 5)
    if (top.length > 0) {
      lines.push("📊 *Melhores campanhas por resultado:*")
      top.forEach((c, i) => {
        lines.push(`${i + 1}. ${c.nome}: ${c.resultados} resultados, R$ ${c.gasto.toFixed(2)} gastos (CPA: R$ ${(c.gasto / c.resultados).toFixed(2)})`)
      })
      if (top.length < ativas.length) {
        const semResult = ativas.filter(a => a.resultados === 0)
        if (semResult.length > 0) {
          lines.push("")
          lines.push(`⚠️ ${semResult.length} campanha(s) tiveram gasto mas nenhum resultado: ${semResult.slice(0, 3).map(s => s.nome).join(", ")}`)
        }
      }
    } else {
      if (totalSpend > 0) {
        lines.push(`📊 No período, foram gastos R$ ${totalSpend.toFixed(2)} em ${ativas.length} campanhas, mas nenhuma gerou resultados registrados.`)
        lines.push("💡 Pode ser que os resultados estejam sendo contabilizados de forma diferente, ou as campanhas são de reconhecimento/engajamento que não geram conversas diretas.")
      } else {
        lines.push("Nenhum dado de campanha encontrado para o período selecionado.")
      }
    }
  } else if (msg.includes("pior") || msg.includes("ruim") || msg.includes("gasto") || msg.includes("caro") || msg.includes("problema")) {
    const ruins = ativas.filter(c => c.resultados === 0).slice(0, 3)
    if (ruins.length > 0) {
      lines.push("⚠️ *Campanhas com gasto sem resultado:*")
      ruins.forEach(c => {
        lines.push(`• ${c.nome}: R$ ${c.gasto.toFixed(2)} gastos, 0 resultados. ${c.cliques > 0 ? `${c.cliques} cliques mas sem conversão.` : "Sem cliques — revisar público-alvo."}`)
      })
    } else if (ativas.length > 0) {
      lines.push("✅ Todas as campanhas ativas tiveram pelo menos 1 resultado.")
      const caras = [...ativas].sort((a, b) => b.cpc - a.cpc).slice(0, 2)
      if (caras.length > 0) {
        lines.push(`🔍 As com maior CPC: ${caras.map(c => `${c.nome} (R$ ${c.cpc.toFixed(2)})`).join(", ")}`)
      }
    } else {
      lines.push("Nenhuma campanha com gasto no período.")
    }
  } else if (msg.includes("lead") || msg.includes("cpl") || msg.includes("custo")) {
    if (totalLeads > 0) {
      lines.push(`👥 *Leads no CRM:* ${totalLeads} no período`)
      lines.push(`💰 *CPL médio:* R$ ${cpl.toFixed(2)}`)
      lines.push(`📈 *Total gasto:* R$ ${totalSpend.toFixed(2)}`)
      const topLeads = [...campanhas].filter(c => c.leads > 0).sort((a, b) => b.leads - a.leads).slice(0, 3)
      if (topLeads.length > 0) {
        lines.push("")
        lines.push("*Campanhas que mais geraram leads:*")
        topLeads.forEach(c => lines.push(`• ${c.nome}: ${c.leads} leads`))
      }
    } else {
      lines.push("Nenhum lead de Tráfego Pago foi registrado no CRM no período.")
    }
  } else if (msg.includes("geral") || msg.includes("resumo") || msg.includes("visão") || msg.includes("ontem") || msg.includes("hoje") || msg.includes("desempenho")) {
    lines.push(`📈 *Resumo geral dos anúncios:*`)
    lines.push(`• Gasto total: R$ ${totalSpend.toFixed(2)}`)
    lines.push(`• Campanhas ativas: ${ativas.length}`)
    lines.push(`• Resultados totais: ${totalResults}`)
    lines.push(`• Leads no CRM: ${totalLeads}`)
    if (totalLeads > 0) lines.push(`• CPL médio: R$ ${cpl.toFixed(2)}`)
    if (ativas.length > 0) {
      const top = ativas.sort((a, b) => b.gasto - a.gasto)[0]
      lines.push(`• Maior investimento: ${top.nome} (R$ ${top.gasto.toFixed(2)})`)
      const topR = [...ativas].filter(c => c.resultados > 0).sort((a, b) => b.resultados - a.resultados)
      if (topR.length > 0) lines.push(`• Melhor resultado: ${topR[0].nome} (${topR[0].resultados} resultados)`)
    }
  } else {
    lines.push(`📊 *Análise dos seus anúncios Meta Ads*`)
    if (totalSpend > 0) {
      lines.push(`Nos últimos 30 dias, foram investidos R$ ${totalSpend.toFixed(2)} em ${ativas.length} campanhas.`)
      if (totalResults > 0) lines.push(`${totalResults} resultados foram gerados.`)
      if (totalLeads > 0) lines.push(`${totalLeads} leads chegaram ao CRM com CPL de R$ ${cpl.toFixed(2)}.`)
    } else {
      lines.push("Nenhum dado de performance encontrado para o período. O sync ocorre diariamente.")
    }
    lines.push("")
    lines.push("💡 *Perguntas que posso responder:*")
    lines.push('• "Quais os melhores anúncios?"')
    lines.push('• "Quanto gastei e quantos leads tive?"')
    lines.push('• "Quais campanhas estão com problema?"')
    lines.push('• "Resumo geral do desempenho"')
  }

  return lines.join("\n")
}
