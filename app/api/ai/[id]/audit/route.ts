import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"
function db(){ return createClient(SUPABASE_URL, SUPABASE_KEY) }

export async function GET(req: NextRequest, { params }: { params: Promise<{id:string}> }){
  const { id } = await params
  const url = new URL(req.url)
  const total = url.searchParams.get("total")==="1"
  // se total=1, busca também whatsapp e automações para auditoria completa
  if(total){
    const { data: convs } = await db().from("conversations_ia").select("id,contact_id,channel,status,ai_responding,last_message_at").eq("ai_id", id).order("last_message_at", {ascending:false}).limit(100)
    const ids = (convs||[]).map(c=>c.id)
    let msgs:any[] = []
    if(ids.length>0){
      const { data } = await db().from("messages_ia").select("id,role,content,metadata,created_at,conversation_id").in("conversation_id", ids).order("created_at", {ascending:false}).limit(200)
      msgs = data||[]
    }
    // também puxa whatsapp da instância mapeada (para cruzar)
    const instanceMap: Record<string,string> = { "ai_patricia_01":"patricia-6c2875b4", "ai_guilherme_01":"guilherme-garcia-c044c57d" }
    const inst = instanceMap[id]
    let wa:any[] = []
    if(inst){
      const { data } = await db().from("whatsapp_mensagens").select("mensagem_id,corpo,de_mim,criado_em,telefone,lead_id").eq("instance_name", inst).order("criado_em", {ascending:false}).limit(100)
      wa = (data||[]).map((w:any)=> ({ id:w.mensagem_id, role: w.de_mim ? "você (WA)" : "lead (WA)", content:w.corpo, tokens:0, model:"whatsapp", created_at:w.criado_em, conversation_id: w.lead_id || w.telefone }))
    }
    return NextResponse.json({ conversations: convs||[], messages: msgs, whatsapp: wa })
  }
  const { data: convs } = await db().from("conversations_ia").select("id").eq("ai_id", id).limit(50)
  if(!convs || convs.length===0) return NextResponse.json([])
  const ids = convs.map(c=>c.id)
  const { data: msgs } = await db().from("messages_ia").select("id,role,content,metadata,created_at,conversation_id").in("conversation_id", ids).order("created_at", {ascending:false}).limit(100)
  const logs = (msgs||[]).map((m:any)=> ({
    id: m.id,
    role: m.role,
    content: m.content,
    tokens: m.metadata?.tokensUsed || m.metadata?.tokens || 0,
    model: m.metadata?.model || "",
    created_at: m.created_at,
    conversation_id: m.conversation_id,
  }))
  return NextResponse.json(logs)
}
