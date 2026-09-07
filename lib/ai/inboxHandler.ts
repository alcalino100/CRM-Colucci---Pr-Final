import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"
import { generateAIResponse } from "./generateResponse"

function db(){ return createClient(SUPABASE_URL, SUPABASE_KEY) }

// Chamado pelo webhook do WhatsApp após salvar mensagem inbound da Patrícia
export async function handlePatriciaInbound({ telefone, texto, leadId }: { telefone: string; texto: string; leadId?: string }){
  const PATRICIA_AI = "ai_patricia_01"
  const INSTANCE = "patricia-6c2875b4"
  try{
    const { data: ai } = await db().from("ai_agents").select("id,is_active").eq("id", PATRICIA_AI).maybeSingle()
    if(!ai?.is_active) return // IA pausada

    // Se leadId existe, verifica se é Tráfego Pago (tag)
    if(leadId){
      const { data: lead } = await db().from("leads").select("origem,status").eq("id", leadId).maybeSingle()
      if(lead?.origem !== "Tráfego Pago") return
      if(lead?.status === "escalated" || lead?.status === "perdido") return
    }

    // Busca ou cria conversa IA para este contato
    let convId: string
    const { data: existing } = await db().from("conversations_ia").select("id").eq("ai_id", PATRICIA_AI).eq("contact_id", leadId || telefone).maybeSingle()
    if(existing?.id) convId = existing.id
    else {
      const { data: created } = await db().from("conversations_ia").insert({ id:`conv_${Date.now()}`, ai_id: PATRICIA_AI, contact_id: leadId || telefone, channel:"whatsapp", external_id: telefone, status:"active", ai_responding:true }).select("id").single()
      convId = created!.id
    }

    const { data: history } = await db().from("messages_ia").select("role,content").eq("conversation_id", convId).order("created_at", {ascending:true}).limit(10)
    await db().from("messages_ia").insert({ id:`msg_${Date.now()}`, conversation_id: convId, role:"user", content: texto })

    const { message: aiResp } = await generateAIResponse({ aiId: PATRICIA_AI, userMessage: texto, conversationHistory: (history||[]).map((m:any)=>({role:m.role, content:m.content})) })

    await db().from("messages_ia").insert({ id:`msg_${Date.now()+1}`, conversation_id: convId, role:"ai", content: aiResp })

    // Envia via WhatsApp da Patrícia
    await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || "https://crm-colucci-pre-final.vercel.app"}/api/whatsapp/send`, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ instanceName: INSTANCE, telefone, texto: aiResp })
    }).catch(()=>{})

    // Também envia direto pela Evolution se site_url falhar
    const evoUrl = process.env.EVOLUTION_API_URL
    const evoKey = process.env.EVOLUTION_API_KEY
    if(evoUrl && evoKey){
      await fetch(`${evoUrl}/message/sendText/${INSTANCE}`, {
        method:"POST",
        headers:{ "Content-Type":"application/json", "apikey": evoKey },
        body: JSON.stringify({ number: telefone, text: aiResp })
      }).catch(()=>{})
    }
  }catch(e){
    console.error("[IA Patricia] erro", e)
  }
}
