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

function iso(d: Date) {
  return d.toISOString().slice(0, 10)
}

function ontem() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d
}

interface InsightRow {
  gasto: number
  impressoes: number
  cliques: number
  mensagens_iniciadas: number
}

interface AdData {
  id: string
  nome: string
  status: string
  gasto: number
  impressoes: number
  cliques: number
  mensagens_iniciadas: number
  ctr: number
  cpc: number
  cpm: number
  leads_crm: number
}

interface Relatorio {
  data: string
  resumo: string
  destaques: string[]
  melhores_anuncios: { nome: string; motivo: string; gasto: number; resultados: number }[]
  piores_anuncios: { nome: string; motivo: string; gasto: number; resultados: number }[]
  recomendacoes: string[]
  analise_raw?: string
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const since = url.searchParams.get("since") || iso(ontem())
  const until = url.searchParams.get("until") || iso(ontem())

  try {
    const supabase = db()

    const [campRows, , , campanhas, leadsData] = await Promise.all([
      supabase.from("meta_insights_campaign_daily").select("*")
        .gte("data", since).lte("data", until),
      supabase.from("meta_insights_adset_daily").select("*")
        .gte("data", since).lte("data", until),
      supabase.from("meta_insights_ad_daily").select("*")
        .gte("data", since).lte("data", until),
      supabase.from("meta_campanhas").select("id, nome, status"),
      supabase.from("leads").select("meta_campaign_id").eq("origem", "Tráfego Pago").not("meta_campaign_id", "is", null),
    ])

    const campMap = new Map((campanhas.data ?? []).map((c: any) => [c.id, c]))
    const leadsPorCamp = new Map<string, number>()
    for (const l of leadsData.data ?? []) {
      const cid = l.meta_campaign_id
      leadsPorCamp.set(cid, (leadsPorCamp.get(cid) ?? 0) + 1)
    }

    const campGasto = new Map<string, InsightRow>()
    for (const r of campRows.data ?? []) {
      const cur = campGasto.get(r.campanha_id) ?? { gasto: 0, impressoes: 0, cliques: 0, mensagens_iniciadas: 0 }
      cur.gasto += Number(r.gasto ?? 0)
      cur.impressoes += Number(r.impressoes ?? 0)
      cur.cliques += Number(r.cliques ?? 0)
      cur.mensagens_iniciadas += Number(r.mensagens_iniciadas ?? 0)
      campGasto.set(r.campanha_id, cur)
    }

    const campanhasData: AdData[] = []
    for (const [id, g] of campGasto) {
      const c = campMap.get(id)
      campanhasData.push({
        id, nome: c?.nome ?? id, status: c?.status ?? "desconhecido",
        gasto: g.gasto, impressoes: g.impressoes, cliques: g.cliques,
        mensagens_iniciadas: g.mensagens_iniciadas,
        ctr: g.impressoes ? (g.cliques / g.impressoes) * 100 : 0,
        cpc: g.cliques ? g.gasto / g.cliques : 0,
        cpm: g.impressoes ? (g.gasto / g.impressoes) * 1000 : 0,
        leads_crm: leadsPorCamp.get(id) ?? 0,
      })
    }
    campanhasData.sort((a, b) => b.gasto - a.gasto)

    const gastoTotal = campanhasData.reduce((s, c) => s + c.gasto, 0)
    const leadsTotal = campanhasData.reduce((s, c) => s + c.leads_crm, 0)
    const conversasTotal = campanhasData.reduce((s, c) => s + c.mensagens_iniciadas, 0)

    const relatorio: Relatorio = {
      data: `${since} a ${until}`,
      resumo: "",
      destaques: [],
      melhores_anuncios: [],
      piores_anuncios: [],
      recomendacoes: [],
    }

    if (campanhasData.length === 0) {
      relatorio.resumo = `Nenhum dado de anúncios encontrado para o período de ${since} a ${until}. O sync de dados da Meta ocorre diariamente às 9h.`
      return NextResponse.json(relatorio)
    }

    const topPorGasto = [...campanhasData].sort((a, b) => b.gasto - a.gasto).slice(0, 5)
    const topPorResultados = [...campanhasData].filter(c => c.mensagens_iniciadas > 0)
      .sort((a, b) => b.mensagens_iniciadas - a.mensagens_iniciadas).slice(0, 3)
    const topPorCTR = [...campanhasData].filter(c => c.impressoes > 100)
      .sort((a, b) => b.ctr - a.ctr).slice(0, 3)
    const piorCPC = [...campanhasData].filter(c => c.cliques > 0)
      .sort((a, b) => b.cpc - a.cpc).slice(0, 3)

    if (GEMINI_KEY) {
      try {
        const prompt = `Você é um analista de marketing digital especializado em Meta Ads. Analise os dados abaixo do período ${since} a ${until} e gere um relatório em português brasileiro.

DADOS:
Gasto total: R$ ${gastoTotal.toFixed(2)}
Total de leads no CRM: ${leadsTotal}
Total de conversas iniciadas (mensagens): ${conversasTotal}
CPL (custo por lead): ${leadsTotal ? "R$ " + (gastoTotal / leadsTotal).toFixed(2) : "N/A"}

CAMPANHAS (${campanhasData.length} com gasto):
${campanhasData.map(c =>
  `- ${c.nome} (${c.status}): R$ ${c.gasto.toFixed(2)} gasto, ${c.impressoes} impressões, ${c.cliques} cliques, CTR ${c.ctr.toFixed(2)}%, CPC R$ ${c.cpc.toFixed(2)}, CPM R$ ${c.cpm.toFixed(2)}, ${c.mensagens_iniciadas} conversas, ${c.leads_crm} leads CRM`
).join("\n")}

Para cada um dos tópicos abaixo, forneça uma resposta em português brasileiro, clara e objetiva, no formato JSON (sem markdown, sem \`\`\`json):

{
  "resumo": "parágrafo curto com visão geral do desempenho",
  "destaques": ["frase curta sobre o melhor resultado", "outro destaque", ...],
  "melhores_anuncios": [
    {"nome": "nome da campanha", "motivo": "por que foi bem", "gasto": 0.0, "resultados": 0}
  ],
  "piores_anuncios": [
    {"nome": "nome da campanha", "motivo": "por que foi mal", "gasto": 0.0, "resultados": 0}
  ],
  "recomendacoes": ["recomendação 1", "recomendação 2", ...]
}

Preencha com dados reais das campanhas listadas. Máximo 3 itens em cada array.`
        const gemRes = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
          }),
        })

        if (gemRes.ok) {
          const gemJson = await gemRes.json()
          const text = gemJson?.candidates?.[0]?.content?.parts?.[0]?.text || ""
          const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim()
          const parsed = JSON.parse(cleaned)
          relatorio.resumo = parsed.resumo || ""
          relatorio.destaques = parsed.destaques || []
          relatorio.melhores_anuncios = parsed.melhores_anuncios || []
          relatorio.piores_anuncios = parsed.piores_anuncios || []
          relatorio.recomendacoes = parsed.recomendacoes || []
        } else {
          const errText = await gemRes.text()
          relatorio.analise_raw = `Gemini API error: ${gemRes.status} ${errText}`
          fallbackAnalysis(relatorio, campanhasData, gastoTotal, leadsTotal, conversasTotal, topPorGasto, topPorResultados, topPorCTR, piorCPC)
        }
      } catch (e: any) {
        relatorio.analise_raw = `Gemini error: ${e.message}`
        fallbackAnalysis(relatorio, campanhasData, gastoTotal, leadsTotal, conversasTotal, topPorGasto, topPorResultados, topPorCTR, piorCPC)
      }
    } else {
      fallbackAnalysis(relatorio, campanhasData, gastoTotal, leadsTotal, conversasTotal, topPorGasto, topPorResultados, topPorCTR, piorCPC)
    }

    return NextResponse.json(relatorio)
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}

function fallbackAnalysis(
  rel: Relatorio,
  campanhas: AdData[],
  gastoTotal: number,
  leadsTotal: number,
  conversasTotal: number,
  topGasto: AdData[],
  topResultados: AdData[],
  topCTR: AdData[],
  piorCPC: AdData[],
) {
  const cpl = leadsTotal ? gastoTotal / leadsTotal : 0
  const ativas = campanhas.filter(c => c.status === "ACTIVE").length

  rel.resumo = `No período analisado, ${campanhas.length} campanhas tiveram atividade com gasto total de R$ ${gastoTotal.toFixed(2)}. `
    + `${ativas} campanhas estão ativas. `
    + (leadsTotal > 0
      ? `Foram gerados ${leadsTotal} leads no CRM com CPL médio de R$ ${cpl.toFixed(2)}. `
      : "Nenhum lead foi registrado no CRM no período. ")
    + (conversasTotal > 0
      ? `${conversasTotal} conversas foram iniciadas via anúncios.`
      : "Nenhuma conversa foi iniciada via anúncios no período.")

  const destaques: string[] = []
  if (topResultados.length > 0) {
    destaques.push(`${topResultados[0].nome} gerou ${topResultados[0].mensagens_iniciadas} conversas, melhor resultado do período.`)
  }
  if (topCTR.length > 0 && topCTR[0].ctr > 1) {
    destaques.push(`${topCTR[0].nome} teve o maior CTR (${topCTR[0].ctr.toFixed(2)}%), indicando criativo relevante.`)
  }
  if (gastoTotal > 0 && leadsTotal > 0) {
    destaques.push(`CPL médio de R$ ${cpl.toFixed(2)} ${cpl < 50 ? "— abaixo de R$ 50, bom custo por lead." : "— acima de R$ 50, vale revisar segmentação."}`)
  }
  rel.destaques = destaques

  rel.melhores_anuncios = topResultados.slice(0, 3).map(c => ({
    nome: c.nome, motivo: `${c.mensagens_iniciadas} conversas geradas com CTR de ${c.ctr.toFixed(2)}% e gasto de R$ ${c.gasto.toFixed(2)}`,
    gasto: c.gasto, resultados: c.mensagens_iniciadas,
  }))

  rel.piores_anuncios = campanhas
    .filter(c => c.gasto > 0 && c.mensagens_iniciadas === 0)
    .slice(0, 3)
    .map(c => ({
      nome: c.nome, motivo: `R$ ${c.gasto.toFixed(2)} gastos sem nenhuma conversa gerada. ${c.cliques > 0 ? `${c.cliques} cliques mas sem engajamento.` : "Sem cliques — revisar público-alvo ou criativo."}`,
      gasto: c.gasto, resultados: 0,
    }))
  if (rel.piores_anuncios.length === 0 && piorCPC.length > 0) {
    rel.piores_anuncios = piorCPC.slice(0, 3).map(c => ({
      nome: c.nome, motivo: `CPC de R$ ${c.cpc.toFixed(2)} — acima da média. Revisar relevância do anúncio.`,
      gasto: c.gasto, resultados: c.mensagens_iniciadas,
    }))
  }

  const recs: string[] = []
  if (leadsTotal === 0 && conversasTotal === 0 && gastoTotal > 0) {
    recs.push("Nenhuma conversa ou lead foi gerado. Reveja a segmentação, criativos e oferta dos anúncios.")
  }
  if (topCTR.length > 0 && topCTR[0].ctr > 2) {
    recs.push(`A campanha "${topCTR[0].nome}" teve alto CTR — analise o criativo para replicar o padrão em outras campanhas.`)
  }
  const semConv = campanhas.filter(c => c.gasto > 50 && c.mensagens_iniciadas === 0)
  if (semConv.length > 0) {
    recs.push(`${semConv.length} campanha(s) gastaram R$ 50+ sem gerar conversas. Considere pausar e revisar: ${semConv.slice(0, 2).map(c => `"${c.nome}"`).join(", ")}.`)
  }
  if (campanhas.filter(c => c.status === "WITH_ISSUES").length > 0) {
    recs.push(`${campanhas.filter(c => c.status === "WITH_ISSUES").length} campanha(s) estão com problemas (WITH_ISSUES). Verifique no Gerenciador de Anúncios.`)
  }
  if (recs.length === 0) {
    recs.push("Os indicadores estão dentro do esperado. Continue monitorando e testando novos criativos.")
  }
  rel.recomendacoes = recs
}
