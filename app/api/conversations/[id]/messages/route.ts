import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"
import { generateAIResponse } from "@/lib/ai/generateResponse"

function db(){ return createClient(SUPABASE_URL, SUPABASE_KEY) }

export async function POST(req: NextRequest, { params }: { params: Promise<{id:string}> }){
  const { id } = await params
  const { message, aiId } = await req.json()
  if(!message || !aiId) return NextResponse.json({ error:"message e aiId obrigatórios" }, {status:400})
  try{
    const { data: conv } = await db().from("conversations_ia").select("*").eq("id", id).single()
    if(!conv) return NextResponse.json({ error:"Conversation not found" }, {status:404})

    const { data: history } = await db().from("messages_ia").select("role,content").eq("conversation_id", id).order("created_at", {ascending:true}).limit(10)

    const userMsg = await db().from("messages_ia").insert({ id:`msg_${Date.now()}`, conversation_id: id, role:"user", content: message }).select("*").single()

    const { message: aiResp, tokensUsed } = await generateAIResponse({ aiId, userMessage: message, conversationHistory: (history||[]).map((m:any)=>({role:m.role, content:m.content})) })

    // Checa escalation simples por keywords
    const { data: triggers } = await db().from("escalation_triggers").select("*").eq("ai_id", aiId)
    let shouldEscalate = false
    for(const t of triggers||[]){
      if((t.detection_keywords||[]).some((kw:string)=> message.toUpperCase().includes(kw.toUpperCase()))){
        shouldEscalate = true; break
      }
      if(t.condition==="max_turns" && (history?.length||0) >= 10) { shouldEscalate = true; break }
    }

    let aiMsg
    if(shouldEscalate){
      const { data: ai } = await db().from("ai_agents").select("handoff_rules").eq("id", aiId).single()
      aiMsg = await db().from("messages_ia").insert({ id:`msg_${Date.now()+1}`, conversation_id: id, role:"ai", content: ai?.handoff_rules || "Deixe-me conectar você com um especialista...", metadata:{ escalated:true, tokensUsed } }).select("*").single()
      await db().from("conversations_ia").update({ status:"escalated", ai_responding:false, last_message_at: new Date().toISOString() }).eq("id", id)
      // TODO: notifyTeamOfEscalation(id, aiId) -> integrar com Slack/Email da Patrícia
    } else {
      aiMsg = await db().from("messages_ia").insert({ id:`msg_${Date.now()+1}`, conversation_id: id, role:"ai", content: aiResp, metadata:{ tokensUsed } }).select("*").single()
      await db().from("conversations_ia").update({ last_message_at: new Date().toISOString() }).eq("id", id)
    }

    return NextResponse.json({ userMessage: userMsg.data, aiMessage: aiMsg.data, escalated: shouldEscalate })
  }catch(e:any){
    console.error(e)
    return NextResponse.json({ error:e.message }, {status:500})
  }
}
