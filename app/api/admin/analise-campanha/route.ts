// Análise rápida: campanha(s) de um corretor no período vs. leads do CRM dele no mesmo período.
// GET ?corretor=<nome|id>&since=YYYY-MM-DD&until=YYYY-MM-DD (default: hoje, corretor Aline).
// Protegido por CRON_SECRET.
import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

function isoHoje(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
}
function dayStart(ymd: string): string {
  return new Date(`${ymd}T00:00:00-03:00`).toISOString()
}
function dayEnd(ymd: string): string {
  return new Date(`${ymd}T23:59:59.999-03:00`).toISOString()
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const url = new URL(req.url)
  const auth = req.headers.get("authorization")
  const qs = url.searchParams.get("secret")
  const autorizado = !!secret && (auth === `Bearer ${secret}` || qs === secret)
  if (!autorizado) return NextResponse.json({ erro: "não autorizado" }, { status: 401 })

  const hoje = isoHoje()
  const since = url.searchParams.get("since") || hoje
  const until = url.searchParams.get("until") || hoje
  const corretorParam = url.searchParams.get("corretor")?.trim() || "Aline"

  try {
    // Resolve o corretor (por nome ou id)
    let usuario: any = null
    if (corretorParam.includes("-")) {
      const { data } = await wsupabase.from("usuarios").select("id, nome").eq("id", corretorParam).maybeSingle()
      usuario = data
    }
    if (!usuario) {
      const { data } = await wsupabase.from("usuarios").select("id, nome").ilike("nome", `%${corretorParam}%`).maybeSingle()
      usuario = data
    }
    if (!usuario) {
      const { data: sugs } = await wsupabase.from("usuarios").select("id, nome, role").limit(50)
      return NextResponse.json({ ok: false, erro: `Corretor "${corretorParam}" não encontrado`, sugestoes: (sugs ?? []).map((s) => ({ id: s.id, nome: s.nome, role: s.role })) }, { status: 404 })
    }
    const uid = usuario.id

    // Campanhas do corretor
    const { data: campanhas } = await wsupabase.from("meta_campanhas").select("id, nome, status").eq("corretor_id", uid)
    const campIds = (campanhas ?? []).map((c) => c.id)

    // Insights por campanha no período
    const { data: insightsCamp } = campIds.length
      ? await wsupabase.from("meta_insights_campaign_daily").select("*").in("campanha_id", campIds).gte("data", since).lte("data", until)
      : { data: [] }

    // Ads dessas campanhas + insights por anúncio
    const { data: ads } = campIds.length
      ? await wsupabase.from("meta_ads").select("id, campanha_id, nome").in("campanha_id", campIds)
      : { data: [] }
    const adIds = (ads ?? []).map((a) => a.id)
    const { data: insightsAd } = adIds.length
      ? await wsupabase.from("meta_insights_ad_daily").select("*").in("ad_id", adIds).gte("data", since).lte("data", until)
      : { data: [] }

    // Leads do CRM do corretor no período
    const { data: leads } = await wsupabase
      .from("leads")
      .select("id, nome, status, origem, criado_em, valor_proposta, meta_campaign_id")
      .eq("corretor_id", uid)
      .gte("criado_em", dayStart(since))
      .lte("criado_em", dayEnd(until))

    // Agrega
    const soma = (rows: any[], key: string, campo: string) =>
      rows.reduce((s, r) => s + Number(r[campo] ?? 0), 0)

    const campMap = new Map((campanhas ?? []).map((c) => [c.id, c]))
    const porCampanha = (campIds.length ? campIds : []).map((cid) => {
      const rows = (insightsCamp ?? []).filter((r) => r.campanha_id === cid)
      return {
        campanha_id: cid,
        nome: campMap.get(cid)?.nome ?? cid,
        status: campMap.get(cid)?.status ?? null,
        gasto: soma(rows, "campanha_id", "gasto"),
        impressoes: soma(rows, "campanha_id", "impressoes"),
        cliques: soma(rows, "campanha_id", "cliques"),
        mensagens_iniciadas: soma(rows, "campanha_id", "mensagens_iniciadas"),
      }
    }).filter((c) => c.gasto > 0 || c.impressoes > 0 || c.mensagens_iniciadas > 0)

    const porAnuncio = (ads ?? []).map((a) => {
      const rows = (insightsAd ?? []).filter((r) => r.ad_id === a.id)
      return {
        ad_id: a.id,
        campanha_id: a.campanha_id,
        nome: a.nome,
        gasto: soma(rows, "ad_id", "gasto"),
        impressoes: soma(rows, "ad_id", "impressoes"),
        cliques: soma(rows, "ad_id", "cliques"),
        mensagens_iniciadas: soma(rows, "ad_id", "mensagens_iniciadas"),
      }
    }).filter((a) => a.gasto > 0 || a.impressoes > 0)

    const leadsLista = (leads ?? []).map((l) => ({
      id: l.id,
      nome: l.nome,
      status: l.status,
      origem: l.origem,
      criado_em: l.criado_em,
      valor: l.valor_proposta ?? null,
      veio_de_anuncio: !!l.meta_campaign_id || l.origem === "Tráfego Pago",
    })).sort((a, b) => (a.criado_em > b.criado_em ? 1 : -1))

    return NextResponse.json({
      ok: true,
      corretor: { id: uid, nome: usuario.nome },
      periodo: { since, until, hoje },
      campanhas: porCampanha,
      anuncios: porAnuncio,
      resumo_campanha: {
        gasto: porCampanha.reduce((s, c) => s + c.gasto, 0),
        impressoes: porCampanha.reduce((s, c) => s + c.impressoes, 0),
        cliques: porCampanha.reduce((s, c) => s + c.cliques, 0),
        mensagens_iniciadas: porCampanha.reduce((s, c) => s + c.mensagens_iniciadas, 0),
      },
      leads_crm: leadsLista,
      resumo_leads: {
        total: leadsLista.length,
        de_anuncio: leadsLista.filter((l) => l.veio_de_anuncio).length,
        criados_hoje_na_campanha: leadsLista.filter((l) => l.veio_de_anuncio).length,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 })
  }
}
