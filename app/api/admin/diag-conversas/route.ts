// Diagnóstico de conversas: mensagens WhatsApp reais por instância (CTWA vs orgânica),
// cruzadas com os leads criados. Protegido por CRON_SECRET.
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
  const dias = Number(new URL(req.url).searchParams.get("dias") ?? "3")
  const desde = new Date()
  desde.setDate(desde.getDate() - dias)
  const desdeIso = desde.toISOString()

  try {
    const [{ data: mensagens }, { data: mensagensTodas }, { data: instancias }, { data: leads }] = await Promise.all([
      wsupabase.from("whatsapp_mensagens").select("id, instance_name, telefone, nome_contato, lead_id, veio_de_anuncio, anuncio_id, anuncio_titulo, criado_em").gte("criado_em", desdeIso).order("criado_em", { ascending: true }),
      wsupabase.from("whatsapp_mensagens").select("criado_em").order("criado_em", { ascending: false }).limit(5),
      wsupabase.from("whatsapp_instancias").select("instance_name, corretor_id, numero, status"),
      wsupabase.from("leads").select("id, nome, telefone, corretor_id, origem, status, meta_campaign_id, criado_em, observacoes").gte("criado_em", desdeIso).order("criado_em", { ascending: true }),
    ])

    const instMap = new Map((instancias ?? []).map((i) => [i.instance_name, i]))
    const instPorCorretor = new Map<string, string>()
    for (const i of instancias ?? []) if (i.corretor_id) instPorCorretor.set(i.corretor_id, i.instance_name)

    const nomes = new Map<string, string>()
    if (instancias?.length) {
      const corrIds = Array.from(new Set((instancias ?? []).map((i) => i.corretor_id).filter(Boolean)))
      const { data: usuarios } = await wsupabase.from("usuarios").select("id, nome").in("id", corrIds)
      for (const u of usuarios ?? []) nomes.set(u.id, u.nome)
    }

    // Mensagens por instância (hoje) — a fonte da verdade de CTWA
    const hojeIni = `${hoje}T00:00:00-03:00`
    const hojeFim = `${hoje}T23:59:59.999-03:00`
    const msgHoje = (mensagens ?? []).filter((m) => m.criado_em >= hojeIni && m.criado_em <= hojeFim)

    const porInstancia = new Map<string, { instance_name: string; corretor_id: string | null; corretor: string | null; total: number; de_anuncio: number; orgânicas: number; ctwa_sem_lead: number }>()
    for (const m of msgHoje) {
      const inst = instMap.get(m.instance_name)
      const e = porInstancia.get(m.instance_name) ?? {
        instance_name: m.instance_name,
        corretor_id: inst?.corretor_id ?? null,
        corretor: inst?.corretor_id ? (nomes.get(inst.corretor_id) ?? null) : null,
        total: 0, de_anuncio: 0, orgânicas: 0, ctwa_sem_lead: 0,
      }
      e.total++
      if (m.veio_de_anuncio) {
        e.de_anuncio++
        if (!m.lead_id) e.ctwa_sem_lead++
      } else {
        e.orgânicas++
      }
      porInstancia.set(m.instance_name, e)
    }

    // Leads de hoje com origem, e se há mensagem CTWA vinculada (prova de que veio do clique)
    const leadsHoje = (leads ?? []).filter((l) => l.criado_em >= hojeIni && l.criado_em <= hojeFim)
    const msgPorLead = new Map<string, any>()
    for (const m of msgHoje) if (m.lead_id && m.veio_de_anuncio) msgPorLead.set(m.lead_id, m)

    const alineId = new URL(req.url).searchParams.get("corretor_id")

    const cruzamento = leadsHoje
      .filter((l) => !alineId || l.corretor_id === alineId)
      .map((l) => {
        const msg = msgPorLead.get(l.id)
        return {
          nome: l.nome,
          origem: l.origem,
          status: l.status,
          meta_campaign_id: l.meta_campaign_id ?? null,
          criado_em: l.criado_em,
          observacoes: (l.observacoes ?? "").slice(0, 80),
          tem_mensagem_ctwa_hoje: !!msg,
          ctwa_hora: msg?.criado_em ?? null,
          ctwa_anuncio: msg?.anuncio_titulo ?? msg?.anuncio_id ?? null,
          mensagem_total: (msgHoje ?? []).filter((m) => m.lead_id === l.id).length,
        }
      })

    // Totais do período (para ver volume real por corretor)
    const porCorretorPeriodo = new Map<string, { corretor: string | null; total: number; de_anuncio: number }>()
    for (const m of mensagens ?? []) {
      const inst = instMap.get(m.instance_name)
      const cid = inst?.corretor_id ?? "?"
      const e = porCorretorPeriodo.get(cid) ?? { corretor: nomes.get(cid) ?? (cid === "?" ? "sem instância" : cid), total: 0, de_anuncio: 0 }
      e.total++
      if (m.veio_de_anuncio) e.de_anuncio++
      porCorretorPeriodo.set(cid, e)
    }

    return NextResponse.json({
      ok: true,
      hoje,
      desde: desdeIso,
      total_mensagens_tabela_recentes: (mensagensTodas ?? []).map((m) => m.criado_em),
      resumo_hoje: Array.from(porInstancia.values()).sort((a, b) => b.de_anuncio - a.de_anuncio),
      total_mensagens_hoje: msgHoje.length,
      total_ctwa_hoje: msgHoje.filter((m) => m.veio_de_anuncio).length,
      total_organicas_hoje: msgHoje.filter((m) => !m.veio_de_anuncio).length,
      leads_hoje: leadsHoje.length,
      cruzamento: cruzamento,
      volume_por_corretor_ultimos_dias: Array.from(porCorretorPeriodo.values()).sort((a, b) => b.de_anuncio - a.de_anuncio),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 })
  }
}
