import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Retorna o histórico de mensagens de uma conversa (um lead — ou um telefone, quando
// o contato não tem lead vinculado — dentro de uma instância), em ordem cronológica,
// para renderizar a thread do chat.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const instanceName = url.searchParams.get("instanceName")
  const leadId = url.searchParams.get("leadId")
  const telefone = url.searchParams.get("telefone")
  if (!instanceName || (!leadId && !telefone)) {
    return NextResponse.json({ error: "instanceName e leadId (ou telefone) são obrigatórios." }, { status: 400 })
  }

  let query = wsupabase
    .from("whatsapp_mensagens")
    .select("id, corpo, de_mim, criado_em, veio_de_anuncio, anuncio_titulo, tipo_midia, midia_url, mime_type, nome_arquivo")
    .eq("instance_name", instanceName)
    .order("criado_em", { ascending: true })
    .limit(1000)
  if (leadId) query = query.eq("lead_id", leadId)
  if (!leadId && telefone) query = query.eq("telefone", telefone)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: "Não foi possível carregar as mensagens." }, { status: 500 })

  return NextResponse.json({ mensagens: data ?? [] })
}