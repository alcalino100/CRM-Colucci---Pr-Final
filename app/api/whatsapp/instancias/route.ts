import { NextResponse } from "next/server"
import { instanceNameFor, wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Lista todas as instâncias com o nome do corretor resolvido
export async function GET() {
  const { data: instancias, error } = await wsupabase
    .from("whatsapp_instancias")
    .select("*")
    .order("criado_em", { ascending: true })
  if (error) return NextResponse.json({ error: "Não foi possível carregar as instâncias." }, { status: 500 })

  const ids = Array.from(new Set((instancias ?? []).map((i) => i.corretor_id).filter(Boolean)))
  const nomes: Record<string, string> = {}
  if (ids.length) {
    const { data: users } = await wsupabase.from("usuarios").select("id, nome").in("id", ids)
    for (const u of users ?? []) nomes[u.id] = u.nome
  }

  const data = (instancias ?? []).map((i) => ({ ...i, corretorNome: nomes[i.corretor_id] ?? "—" }))
  return NextResponse.json({ data })
}

// Garante a instância do corretor (upsert por corretor_id)
export async function POST(request: Request) {
  let body: { corretorId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 })
  }
  if (!body.corretorId) return NextResponse.json({ error: "Corretor não informado." }, { status: 400 })

  const instanceName = instanceNameFor(body.corretorId)
  const { data, error } = await wsupabase
    .from("whatsapp_instancias")
    .upsert({ corretor_id: body.corretorId, instance_name: instanceName }, { onConflict: "corretor_id" })
    .select("*")
    .single()
  if (error) return NextResponse.json({ error: "Não foi possível criar a instância." }, { status: 500 })
  return NextResponse.json({ data })
}
