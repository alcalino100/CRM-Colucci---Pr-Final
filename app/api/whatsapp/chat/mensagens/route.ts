import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Retorna o histórico de mensagens de uma conversa (um lead dentro de uma instância),
// em ordem cronológica, para renderizar a thread do chat.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const instanceName = url.searchParams.get("instanceName")
  const leadId = url.searchParams.get("leadId")
  if (!instanceName || !leadId) {
    return NextResponse.json({ error: "instanceName e leadId são obrigatórios." }, { status: 400 })
  }

  const { data, error } = await wsupabase
    .from("whatsapp_mensagens")
    .select("id, corpo, de_mim, criado_em, veio_de_anuncio, anuncio_titulo")
    .eq("instance_name", instanceName)
    .eq("lead_id", leadId)
    .order("criado_em", { ascending: true })
    .limit(1000)
  if (error) return NextResponse.json({ error: "Não foi possível carregar as mensagens." }, { status: 500 })

  return NextResponse.json({ mensagens: data ?? [] })
}
