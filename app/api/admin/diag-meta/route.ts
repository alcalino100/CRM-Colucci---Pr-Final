// Diagnóstico Meta: campanhas (com corretor_id) + insights de hoje + leads de hoje por campanha.
// Protegido por CRON_SECRET.
import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

function isoHoje(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  const qs = new URL(req.url).searchParams.get("secret")
  const autorizado = !!secret && (auth === `Bearer ${secret}` || qs === secret)
  if (!autorizado) return NextResponse.json({ erro: "não autorizado" }, { status: 401 })

  const hoje = isoHoje()
  const ontem = new Date();
  try {
    const [{ data: campanhas }, { data: insightsHoje }, { data: leadsHoje }, { data: adsHoje }, { data: insightsAdHoje }] = await Promise.all([
      wsupabase.from("meta_campanhas").select("id, nome, status, corretor_id").order("nome"),
      wsupabase.from("meta_insights_campaign_daily").select("*").eq("data", hoje),
      wsupabase.from("leads").select("id, nome, corretor_id, origem, criado_em, meta_campaign_id").gte("criado_em", `${hoje}T00:00:00-03:00`).lte("criado_em", `${hoje}T23:59:59.999-03:00`),
      wsupabase.from("meta_ads").select("id, nome, campanha_id"),
      wsupabase.from("meta_insights_ad_daily").select("*").eq("data", hoje),
    ])

    const leadsPorCamp = new Map<string, number>()
    for (const l of leadsHoje ?? []) if (l.meta_campaign_id) leadsPorCamp.set(l.meta_campaign_id, (leadsPorCamp.get(l.meta_campaign_id) ?? 0) + 1)

    const adMap = new Map((adsHoje ?? []).map((a) => [a.id, a]))
    const ades = (insightsAdHoje ?? []).map((r) => {
      const ad = adMap.get(r.ad_id)
      return { ad_id: r.ad_id, nome: ad?.nome ?? r.ad_id, campanha_id: ad?.campanha_id ?? null, gasto: r.gasto, impressoes: r.impressoes, cliques: r.cliques, mensagens: r.mensagens_iniciadas }
    }).filter((a) => a.gasto > 0 || a.impressoes > 0).sort((a, b) => b.gasto - a.gasto)

    return NextResponse.json({
      ok: true,
      hoje,
      campanhas: (campanhas ?? []).map((c) => ({ ...c, leads_crm_hoje: leadsPorCamp.get(c.id) ?? 0 })),
      total_campanhas: (campanhas ?? []).length,
      insights_hoje: (insightsHoje ?? []).map((r) => ({ campanha_id: r.campanha_id, data: r.data, gasto: r.gasto, impressoes: r.impressoes, cliques: r.cliques, mensagens: r.mensagens_iniciadas })),
      total_insights_hoje: (insightsHoje ?? []).length,
      anuncios_hoje: ades,
      total_anuncios_hoje: ades.length,
      leads_hoje: (leadsHoje ?? []).map((l) => ({ nome: l.nome, origem: l.origem, corretor_id: l.corretor_id, meta_campaign_id: l.meta_campaign_id, criado_em: l.criado_em })),
      total_leads_hoje: (leadsHoje ?? []).length,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 })
  }
}
