import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function db() {
  return createClient(SUPABASE_URL, SUPABASE_KEY)
}

const diaISO = (d: Date) => d.toISOString().slice(0, 10)

// Agrega métricas reais do agente: conversas, respostas, escalações, tempo, tokens, custo.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 })
    const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days") ?? 7) || 7, 1), 90)
    const desde = new Date(Date.now() - days * 86400000).toISOString()
    const desde30 = new Date(Date.now() - 30 * 86400000).toISOString()

    const { data: convs } = await db()
      .from("conversations_ia")
      .select("id,started_at,status,escalation_reason")
      .eq("ai_id", id)
      .gte("started_at", desde)
      .order("started_at", { ascending: true })
      .limit(1000)
    const lista = (convs ?? []) as { id: string; started_at: string; status: string; escalation_reason: string | null }[]
    const ids = lista.map((c) => c.id).slice(0, 200)

    let respostas = 0
    if (ids.length) {
      const { count } = await db()
        .from("messages_ia")
        .select("id", { count: "exact", head: true })
        .in("conversation_id", ids)
        .eq("role", "ai")
        .gte("created_at", desde)
      respostas = count ?? 0
    }

    const { data: rows } = await db()
      .from("conversation_analytics")
      .select("response_time_ms,tokens_used,api_cost_usd,resolved_without_escalation,created_at")
      .eq("ai_id", id)
      .gte("created_at", desde)
      .order("created_at", { ascending: true })
      .limit(2000)
    const mets = (rows ?? []) as { response_time_ms: number; tokens_used: number; api_cost_usd: number; resolved_without_escalation: boolean; created_at: string }[]

    const { data: rows30 } = await db()
      .from("conversation_analytics")
      .select("tokens_used,api_cost_usd")
      .eq("ai_id", id)
      .gte("created_at", desde30)
      .limit(5000)
    const mets30 = (rows30 ?? []) as { tokens_used: number; api_cost_usd: number }[]

    const escaladas = lista.filter((c) => c.status === "escalated")
    const porMotivo: Record<string, number> = {}
    for (const c of escaladas) {
      const k = (c.escalation_reason || "sem motivo").slice(0, 60)
      porMotivo[k] = (porMotivo[k] ?? 0) + 1
    }

    const porDia: Record<string, { respostas: number; escalacoes: number }> = {}
    for (let i = days - 1; i >= 0; i--) {
      porDia[diaISO(new Date(Date.now() - i * 86400000))] = { respostas: 0, escalacoes: 0 }
    }
    for (const m of mets) {
      const k = diaISO(new Date(m.created_at))
      if (porDia[k]) porDia[k].respostas++
    }
    for (const c of escaladas) {
      const k = diaISO(new Date(c.started_at))
      if (porDia[k]) porDia[k].escalacoes++
    }

    const tempos = mets.map((m) => m.response_time_ms).filter((n) => typeof n === "number")
    const tempoMedio = tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : 0
    const tokens = mets.reduce((a, m) => a + (m.tokens_used || 0), 0)
    const custoMes = mets30.reduce((a, m) => a + Number(m.api_cost_usd || 0), 0)
    const tokensMes = mets30.reduce((a, m) => a + (m.tokens_used || 0), 0)

    return NextResponse.json({
      ok: true,
      periodo_dias: days,
      respostas,
      conversas: lista.length,
      escalados: escaladas.length,
      taxa_resolucao: lista.length ? Math.round(((lista.length - escaladas.length) / lista.length) * 100) : 100,
      tempo_medio_ms: tempoMedio,
      tempo_min_ms: tempos.length ? Math.min(...tempos) : 0,
      tempo_max_ms: tempos.length ? Math.max(...tempos) : 0,
      tokens,
      tokens_mes: tokensMes,
      custo_mes_usd: Number(custoMes.toFixed(4)),
      por_motivo: Object.entries(porMotivo).map(([motivo, total]) => ({ motivo, total })),
      por_dia: Object.entries(porDia).map(([dia, v]) => ({ dia, ...v })),
      amostra_metricas: mets.length,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
