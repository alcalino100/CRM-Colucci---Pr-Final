import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Lista as conversas de uma instância: um item por LEAD cadastrado que tem mensagens
// nessa instância, com a última mensagem e a contagem. Só leads da base do CRM
// (mensagens com lead_id nulo — contatos que não viraram lead — ficam de fora).
export async function GET(request: Request) {
  const instanceName = new URL(request.url).searchParams.get("instanceName")
  if (!instanceName) return NextResponse.json({ error: "Instância não informada." }, { status: 400 })

  const { data: mensagens, error } = await wsupabase
    .from("whatsapp_mensagens")
    .select("lead_id, telefone, nome_contato, corpo, de_mim, criado_em")
    .eq("instance_name", instanceName)
    .not("lead_id", "is", null)
    .order("criado_em", { ascending: false })
    .limit(4000)
  if (error) return NextResponse.json({ error: "Não foi possível carregar as conversas." }, { status: 500 })

  // Agrupa por lead (a lista já vem da mais recente para a mais antiga)
  const porLead = new Map<string, { leadId: string; telefone: string; ultima: string; ultimaEm: string; ultimaDeMim: boolean; total: number }>()
  for (const m of mensagens ?? []) {
    const existente = porLead.get(m.lead_id)
    if (existente) {
      existente.total++
    } else {
      porLead.set(m.lead_id, {
        leadId: m.lead_id,
        telefone: m.telefone,
        ultima: m.corpo ?? "",
        ultimaEm: m.criado_em,
        ultimaDeMim: !!m.de_mim,
        total: 1,
      })
    }
  }

  const leadIds = Array.from(porLead.keys())
  const nomes: Record<string, { nome: string; status: string }> = {}
  if (leadIds.length) {
    const { data: leads } = await wsupabase.from("leads").select("id, nome, status").in("id", leadIds)
    for (const l of leads ?? []) nomes[l.id] = { nome: l.nome, status: l.status }
  }

  const conversas = Array.from(porLead.values())
    .map((c) => ({
      ...c,
      nome: nomes[c.leadId]?.nome ?? c.telefone,
      status: nomes[c.leadId]?.status ?? null,
    }))
    .sort((a, b) => (a.ultimaEm < b.ultimaEm ? 1 : -1))

  return NextResponse.json({ conversas })
}
