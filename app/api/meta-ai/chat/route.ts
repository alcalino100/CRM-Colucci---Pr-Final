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

export async function POST(req: Request) {
  try {
    const { message, history = [] }: { message: string; history?: Mensagem[] } = await req.json()

    if (!message?.trim()) {
      return NextResponse.json({ response: "Digite uma pergunta." })
    }

    const supabase = db()
    const ontem = new Date()
    ontem.setDate(ontem.getDate() - 1)
    const since = ontem.toISOString().slice(0, 10)
    const ateHoje = new Date().toISOString().slice(0, 10)

    const [campRows, campanhas, leadsData] = await Promise.all([
      supabase.from("meta_insights_campaign_daily").select("*")
        .gte("data", since).lte("data", ateHoje),
      supabase.from("meta_campanhas").select("id, nome, status"),
      supabase.from("leads").select("meta_campaign_id, created_at, status, corretor_id")
        .eq("origem", "Tráfego Pago").not("meta_campaign_id", "is", null)
        .gte("created_at", since).lte("created_at", ateHoje),
    ])

    const campMap = new Map((campanhas.data ?? []).map((c: any) => [c.id, c]))

    const campGasto = new Map<string, { gasto: number; impressoes: number; cliques: number; conversas: number }>()
    for (const r of campRows.data ?? []) {
      const cur = campGasto.get(r.campanha_id) ?? { gasto: 0, impressoes: 0, cliques: 0, conversas: 0 }
      cur.gasto += Number(r.gasto ?? 0)
      cur.impressoes += Number(r.impressoes ?? 0)
      cur.cliques += Number(r.cliques ?? 0)
      cur.conversas += Number(r.mensagens_iniciadas ?? 0)
      campGasto.set(r.campanha_id, cur)
    }

    const gastoTotal = [...campGasto.values()].reduce((s, g) => s + g.gasto, 0)
    const leadsTotal = leadsData.data?.length ?? 0
    const cpl = leadsTotal ? gastoTotal / leadsTotal : 0

    const dadosContexto = `CONTEXTO - DADOS DA CONTA META ADS (${since} a ${ateHoje}):

Gasto total: R$ ${gastoTotal.toFixed(2)}
Total de leads no CRM: ${leadsTotal}
Custo por lead (CPL): ${leadsTotal ? "R$ " + cpl.toFixed(2) : "N/A"}
Total de conversas iniciadas: ${[...campGasto.values()].reduce((s, g) => s + g.conversas, 0)}
Total de campanhas com gasto: ${campGasto.size}

CAMPANHAS:
${[...campGasto.entries()].map(([id, g]) => {
  const c = campMap.get(id)
  const ctr = g.impressoes ? ((g.cliques / g.impressoes) * 100).toFixed(2) : "0"
  const cpc = g.cliques ? (g.gasto / g.cliques).toFixed(2) : "0"
  const leadsCamp = (leadsData.data ?? []).filter((l: any) => l.meta_campaign_id === id).length
  return `- ${c?.nome ?? id} | Status: ${c?.status ?? "?"} | Gasto: R$ ${g.gasto.toFixed(2)} | Impressões: ${g.impressoes} | Cliques: ${g.cliques} | CTR: ${ctr}% | CPC: R$ ${cpc} | Conversas: ${g.conversas} | Leads CRM: ${leadsCamp}`
}).join("\n")}

LEADS RECENTES (${leadsTotal} total):
${(leadsData.data ?? []).slice(0, 5).map((l: any) => `- Lead #${l.id.slice(0, 8)} | Status: ${l.status ?? "novo"} | Corretor: ${l.corretor_id ?? "não atribuído"}`).join("\n")}`

    if (GEMINI_KEY) {
      try {
        const systemPrompt = `Você é um analista de Meta Ads da Imobiliária Colucci. Responda EM PORTUGUÊS BRASILEIRO de forma clara e direta, como se fosse um especialista conversando com o gestor da imobiliária. Use os dados fornecidos para responder. Seja específico: mencione nomes de campanhas, valores, métricas. Nunca invente dados. Máximo 4 parágrafos. Se não souber, diga que não tem dados suficientes.`

        const gemBody = {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [
            { role: "user", parts: [{ text: dadosContexto }] },
            { role: "model", parts: [{ text: "Entendi os dados. Agora vou responder a pergunta do usuário." }] },
            ...history.map((m) => ({
              role: m.role === "assistant" ? "model" as const : "user" as const,
              parts: [{ text: m.content }],
            })),
            { role: "user", parts: [{ text: message }] },
          ],
          generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
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
        console.error("Gemini error:", gemRes.status, errText.slice(0, 300))
      } catch (e) {
        console.error("Gemini exception:", e)
      }
    }

    return NextResponse.json({ response: fallbackResposta(message, campGasto, campMap, leadsData, gastoTotal, leadsTotal, cpl) })
  } catch (e: any) {
    return NextResponse.json({ response: `Erro ao processar: ${e.message}` }, { status: 500 })
  }
}

function fallbackResposta(
  message: string,
  campGasto: Map<string, { gasto: number; impressoes: number; cliques: number; conversas: number }>,
  campMap: Map<string, any>,
  leadsData: any,
  gastoTotal: number,
  leadsTotal: number,
  cpl: number,
) {
  const msg = message.toLowerCase()
  const lines: string[] = []
  const campList = [...campGasto.entries()].sort((a, b) => b[1].gasto - a[1].gasto)

  if (msg.includes("melhor") || msg.includes("top") || msg.includes("destaque") || msg.includes("bom")) {
    const top = [...campGasto.entries()].filter(([, g]) => g.conversas > 0)
      .sort((a, b) => b[1].conversas - a[1].conversas).slice(0, 3)
    if (top.length > 0) {
      lines.push("📊 *Melhores campanhas por resultado:*")
      top.forEach(([id, g]) => {
        const c = campMap.get(id)
        lines.push(`• ${c?.nome ?? id}: ${g.conversas} conversas, R$ ${g.gasto.toFixed(2)} gastos (CPA R$ ${g.conversas ? (g.gasto / g.conversas).toFixed(2) : "N/A"})`)
      })
    } else {
      lines.push("Nenhuma campanha gerou conversas no período analisado.")
    }
  } else if (msg.includes("pior") || msg.includes("ruim") || msg.includes("gasto") || msg.includes("caro") || msg.includes("problema")) {
    const ruins = campList.filter(([, g]) => g.gasto > 0 && g.conversas === 0).slice(0, 3)
    if (ruins.length > 0) {
      lines.push("⚠️ *Campanhas com gasto sem retorno:*")
      ruins.forEach(([id, g]) => {
        const c = campMap.get(id)
        lines.push(`• ${c?.nome ?? id}: R$ ${g.gasto.toFixed(2)} gastos, 0 conversas. ${g.cliques > 0 ? `${g.cliques} cliques mas sem engajamento.` : "Sem cliques — revisar."}`)
      })
    } else {
      lines.push("Todas as campanhas com gasto tiveram pelo menos 1 conversa.")
    }
  } else if (msg.includes("lead") || msg.includes("cpl") || msg.includes("custo")) {
    const leadsCamp = (leadsData.data ?? []).reduce((acc: any, l: any) => {
      const cid = l.meta_campaign_id
      if (!acc[cid]) acc[cid] = 0
      acc[cid]++
      return acc
    }, {})
    if (leadsTotal > 0) {
      lines.push(`👥 *Leads gerados:* ${leadsTotal} no período`)
      lines.push(`💰 *CPL médio:* R$ ${cpl.toFixed(2)}`)
      const topLeads = Object.entries(leadsCamp).sort((a: any, b: any) => b[1] - a[1]).slice(0, 3)
      topLeads.forEach(([cid, count]: [string, any]) => {
        const c = campMap.get(cid)
        const g = campGasto.get(cid)
        lines.push(`• ${c?.nome ?? cid}: ${count} leads ${g ? `(R$ ${(g.gasto / count).toFixed(2)} CPL)` : ""}`)
      })
    } else {
      lines.push("Nenhum lead foi registrado no CRM no período.")
    }
  } else if (msg.includes("geral") || msg.includes("resumo") || msg.includes("visão") || msg.includes("ontem") || msg.includes("hoje") || msg.includes("desempenho")) {
    const ativas = campList.filter(([, g]) => g.gasto > 0)
    lines.push(`📈 *Resumo do período:*`)
    lines.push(`• Gasto total: R$ ${gastoTotal.toFixed(2)}`)
    lines.push(`• Campanhas com atividade: ${ativas.length}`)
    lines.push(`• Leads gerados: ${leadsTotal}`)
    lines.push(`• CPL médio: ${leadsTotal ? "R$ " + cpl.toFixed(2) : "N/A"}`)
    const totalConv = [...campGasto.values()].reduce((s, g) => s + g.conversas, 0)
    lines.push(`• Conversas iniciadas: ${totalConv}`)
    if (ativas.length > 0) {
      const maiorGasto = ativas[0]
      const c = campMap.get(maiorGasto[0])
      lines.push(`• Maior investimento: ${c?.nome ?? maiorGasto[0]} (R$ ${maiorGasto[1].gasto.toFixed(2)})`)
    }
  } else {
    lines.push(`📊 *Análise dos seus anúncios Meta Ads*`)
    lines.push(`No período analisado, foram gastos R$ ${gastoTotal.toFixed(2)} em ${campList.length} campanhas, gerando ${leadsTotal} leads no CRM.`)
    const totalConv = [...campGasto.values()].reduce((s, g) => s + g.conversas, 0)
    if (totalConv > 0) lines.push(`${totalConv} conversas foram iniciadas.`)
    lines.push("")
    lines.push("💡 *Perguntas que posso responder:*")
    lines.push("• \"Qual o melhor anúncio de ontem?\"")
    lines.push("• \"Quanto gastei e quantos leads tive?\"")
    lines.push("• \"Quais campanhas estão com problema?\"")
    lines.push("• \"Resumo geral do desempenho\"")
  }

  return lines.join("\n")
}
