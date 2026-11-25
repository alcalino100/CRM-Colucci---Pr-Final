import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"
import { exigirSessao, negarAcesso } from "@/lib/auth/sessao"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Retorna o histórico de mensagens de uma conversa (um lead — ou um telefone, quando
// o contato não tem lead vinculado — dentro de uma instância), em ordem cronológica,
// para renderizar a thread do chat.
export async function GET(request: Request) {
  const auth = exigirSessao(request)
  if (!auth.ok) return negarAcesso(auth)

  const url = new URL(request.url)
  const instanceName = url.searchParams.get("instanceName")
  const leadId = url.searchParams.get("leadId")
  const telefone = url.searchParams.get("telefone")
  if (!instanceName || (!leadId && !telefone)) {
    return NextResponse.json({ error: "instanceName e leadId (ou telefone) são obrigatórios." }, { status: 400 })
  }

  const montar = (colunas: string) => {
    let q = wsupabase.from("whatsapp_mensagens").select(colunas).eq("instance_name", instanceName).order("criado_em", { ascending: true }).limit(1000)
    if (leadId) q = q.eq("lead_id", leadId)
    if (!leadId && telefone) q = q.eq("telefone", telefone)
    return q
  }
  const base = "id, corpo, de_mim, criado_em, veio_de_anuncio, anuncio_titulo, tipo_midia, midia_url, mime_type, nome_arquivo"
  // status_entrega/erro_entrega vêm da migration da API oficial; sem ela, cai para as colunas de sempre.
  let { data, error } = await montar(`${base}, status_entrega, erro_entrega`)
  if (error) ({ data, error } = await montar(base))
  if (error) return NextResponse.json({ error: "Não foi possível carregar as mensagens." }, { status: 500 })

  return NextResponse.json({ mensagens: data ?? [] })
}