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
      wa = (data||[]).map((w:any)=> ({ id:`wa_${w.mensagem_id || w.criado_em}`, role: w.de_mim ? "você (WA)" : "lead (WA)", content:w.corpo, tokens:0, model:"whatsapp", created_at:w.criado_em, conversation_id: w.lead_id || w.telefone }))
    }

    // Fusão deduplicada: a mesma mensagem recebida aparece em messages_ia (role user)
    // E em whatsapp_mensagens (lead WA). Junta em um único evento com rótulo claro.
    const iaMsgs = (msgs as any[]).map((m:any)=>({
      id: m.id, role: m.role, content: m.content,
      tokens: m.metadata?.tokensUsed || m.metadata?.tokens || 0,
      model: m.metadata?.model || "",
      created_at: m.created_at, conversation_id: m.conversation_id,
    }))
    const timeline: any[] = [...iaMsgs, ...wa]
    const dedup: any[] = []
    const visto = new Set<string>()
    // normaliza "user" -> "lead (WA)" pois mesma origem
    for(const e of timeline.sort((a,b)=> (a.created_at<b.created_at?1:-1))){
      const chv = `${String(e.content||"").trim().toLowerCase()}|${new Date(e.created_at).getTime()/1000|0}`
      if(visto.has(chv)) continue
      visto.add(chv)
      const dedupezao = timeline.filter(t=> `${String(t.content||"").trim().toLowerCase()}|${new Date(t.created_at).getTime()/1000|0}` === chv)
      const temWA = dedupezao.some(t=> t.role==="lead (WA)" || t.role==="você (WA)")
      const temIAuser = dedupezao.some(t=> t.role==="user")
      dedup.push({ ...e, // usa o registro WA como base quando existe
        ...(temWA ? (dedupezao.find(t=> t.role==="lead (WA)" || t.role==="você (WA)")) : {}),
        role: e.role==="user" && temWA ? "lead (WA + IA)" : e.role,
        count: dedupezao.length,
      })
    }
    return NextResponse.json({ conversations: convs||[], messages: dedup, whatsapp: wa })
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
