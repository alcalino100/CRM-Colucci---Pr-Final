import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"
import { normalizePhone } from "@/lib/labels"
import { getRules } from "@/lib/ai/rules"

function db(){ return createClient(SUPABASE_URL, SUPABASE_KEY) }

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Dashboard de atendimento por agente IA: QUEM está sendo respondido, QUANDO e COMO.
// Ordena por conversa mais recente, junta com lead (nome/telefone/tags), instância de
// origem (via envio de_mim na Evolution) e métricas por período.

const DIAS = ["dom","seg","ter","qua","qui","sex","sáb"]

function horaBrasil(iso: string): { diaISO: string; diaSemana: string; hora: string } {
  const d = new Date(iso)
  const s = new Date(d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }))
  return {
    diaISO: s.toISOString().slice(0,10),
    diaSemana: DIAS[s.getDay()],
    hora: s.toISOString().slice(11,16),
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{id:string}> }){
  const { id } = await params
  const url = new URL(req.url)
  const dias = Math.min(Math.max(parseInt(url.searchParams.get("days") || "7", 10), 1), 90)
  const inicio = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString()

  try{
    const [agente, convs, msgContagem, leads, deMim] = await Promise.all([
      db().from("ai_agents").select("id,name,is_active,config").eq("id", id).maybeSingle(),
      db().from("conversations_ia").select("id,ai_id,contact_id,channel,external_id,status,ai_responding,started_at,last_message_at").eq("ai_id", id).gte("started_at", inicio).order("started_at", { ascending:false }).limit(200),
      db().from("messages_ia").select("conversation_id").eq("role","ai").gte("created_at", inicio),
      db().from("leads").select("id,nome,telefone,origem,status,referencias,corretor_id"),
      db().from("whatsapp_mensagens").select("instance_name,telefone,de_mim,criado_em").eq("de_mim", true).gte("criado_em", inicio).limit(500),
    ])

    const conversas = convs.data ?? []
    const aiMsgs = msgContagem.data ?? []
    const leadsRows = (leads.data ?? []) as any[]
    const instancias = (deMim.data ?? []) as any[]

    // contagem de msgs IA por conversa
    const msgsPorConv: Record<string, number> = {}
    for (const m of aiMsgs as any[]) msgsPorConv[m.conversation_id as string] = (msgsPorConv[m.conversation_id as string] || 0) + 1

    // (telefone, instance) mais recente de_mim do periodo (para saber a instância de envio)
    const instanciaDeMaior: Record<string, { instance_name: string; criado_em: string }> = {}
    for (const m of instancias.sort((a:any,b:any)=> (a.criado_em||"").localeCompare(b.criado_em||""))) {
      const t = String(m.telefone||"")
      if(t) instanciaDeMaior[t] = { instance_name: m.instance_name, criado_em: m.criado_em }
    }

    const linhas = conversas.map((c: any) => {
      const lead = leadsRows.find((l) =>
        (c.contact_id && c.contact_id === l.id) || normalizePhone(l.telefone) === normalizePhone(String(c.external_id || c.contact_id || ""))
      )
      const telefone = c.external_id || (c.channel === "whatsapp" ? c.contact_id : null)
      const instEnv = instanciaDeMaior[String(telefone||"")]
      const t = horaBrasil(c.last_message_at || c.started_at)
      const primeira = c.started_at ? horaBrasil(c.started_at) : null
      const ultima = c.last_message_at ? horaBrasil(c.last_message_at) : null
      return {
        convId: c.id,
        status: c.status,
        ai_responding: c.ai_responding,
        canal: c.channel,
        telefone,
        instancia: instEnv?.instance_name ?? null,
        lead: lead ? { id: lead.id, nome: lead.nome, status: lead.status, origem: lead.origem } : null,
        tags: ((lead as any)?.referencias ?? []).map((r: any) => (typeof r === "string" ? r : r?.ref ?? String(r))).filter(Boolean),
        nome: lead?.nome || (c.channel === "web" ? "Visitante do site" : telefone),
        primeiraResposta: primeira ? `${primeira.diaSemana} ${primeira.hora}` : null,
        ultimaMensagem: ultima ? `${ultima.diaISO} ${ultima.hora}` : null,
        dia: t.diaISO,
        hora: t.hora,
        diaSemana: t.diaSemana,
        totalMensagensIa: msgsPorConv[c.id] || 0,
      }
    }).filter((r: any) => r.totalMensagensIa > 0 || r.primeiraResposta)

    // agregações por dia
    const porDia: Record<string, { dia: string; conversas: number; mensagens: number }> = {}
    for (let i = dias - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24*3600*1000).toISOString().slice(0,10)
      porDia[d] = { dia: d, conversas: 0, mensagens: 0 }
    }
    for (const r of linhas) {
      if (!porDia[r.dia]) continue
      porDia[r.dia].conversas += 1
      porDia[r.dia].mensagens += r.totalMensagensIa
    }

    // por tag
    const porTag: Record<string, number> = {}
    for (const r of linhas) for (const tg of r.tags) porTag[tg] = (porTag[tg] || 0) + 1

    // por instância
    const porInstancia: Record<string, number> = {}
    for (const r of linhas) if (r.instancia) porInstancia[r.instancia] = (porInstancia[r.instancia] || 0) + 1

    const totalMsgs = linhas.reduce((a: number, r: any) => a + r.totalMensagensIa, 0)

    // única consulta de leads para tags sugeridas (todas em uso) — sempre como string
    const todasTags = Array.from(new Set(leadsRows.flatMap((l: any) => (l.referencias || []).map((r: any) => (typeof r === "string" ? r : r?.ref ?? String(r))).filter(Boolean)))).sort()

    return NextResponse.json({
      ok: true,
      agente: { id, name: (agente.data as any)?.name, is_active: !!((agente.data as any)?.is_active), config: (agente.data as any)?.config ?? {} },
      regras: getRules((agente.data as any)?.config ?? {}),
      resumo: {
        conversas: linhas.length,
        mensagens: totalMsgs,
        ativas: linhas.filter((r: any) => r.status === "active").length,
        pausadas: linhas.filter((r: any) => r.ai_responding === false).length,
        comLead: linhas.filter((r: any) => r.lead).length,
        porDia: Object.values(porDia),
        porTag,
        porInstancia,
        todasTags,
      },
      conversas: linhas.slice(0, 100),
      geradoEm: new Date().toISOString(),
    })
  }catch(e:any){
    return NextResponse.json({ ok:false, erro: e.message }, { status:500 })
  }
}