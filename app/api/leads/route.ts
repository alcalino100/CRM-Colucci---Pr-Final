import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Lista/busca leads (usado pelo Inbox para vincular uma conversa ao lead por telefone).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const search = searchParams.get("search") ?? ""
  const digits = search.replace(/\D/g, "")

  let query = wsupabase.from("leads").select("id,nome,telefone,status,origem,referencias").limit(50)
  if (digits) {
    query = query.or(`telefone.ilike.%${search}%,telefone.ilike.%${digits}%`)
  } else if (search) {
    query = query.or(`nome.ilike.%${search}%`)
  }
  query = query.order("atualizado_em", { ascending: false })

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, leads: data ?? [] })
}

// Cria um lead a partir do Inbox (conversa sem lead ainda).
export async function POST(request: Request) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, erro: "Dados inválidos." }, { status: 400 })
  }

  const nome = String(body.nome ?? "").trim()
  const telefone = String(body.telefone ?? "").trim()
  if (!nome || !telefone) {
    return NextResponse.json({ ok: false, erro: "Nome e telefone são obrigatórios." }, { status: 400 })
  }

  const tags: string[] = Array.isArray(body.referencias) ? body.referencias.filter(Boolean) : []
  const referencias = tags.map((t, i) => ({ ref: String(t), principal: i === 0 }))
  const origem = ["Instagram", "Tráfego Pago", "WhatsApp", "Marketplace", "Indicação", "Outro"].includes(body.origem) ? body.origem : "WhatsApp"

  const { data, error } = await wsupabase.from("leads").insert({
    nome,
    telefone,
    email: body.email ?? "",
    origem,
    status: body.status ?? "novo",
    temperatura: body.temperatura ?? "morno",
    referencia_imovel: body.referenciaImovel ?? tags[0] ?? "inbox",
    referencias,
    observacoes: body.observacoes ?? "",
    corretor_id: body.corretorId ?? null,
  }).select("id").maybeSingle()

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })

  try {
    await wsupabase.from("automation_logs").insert({
      event_type: "lead_criado_inbox",
      event_title: `Lead criado pelo Inbox (${nome})`,
      event_description: `Lead ${nome} (${telefone}) criado com origem "${origem}" e tags [${tags.join(", ") || "—"}].`,
      actor_type: "gestor",
      lead_id: data?.id ?? null,
    })
  } catch { /* log é best-effort */ }

  return NextResponse.json({ ok: true, lead: { id: data?.id } })
}
