import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"
import { generateAIResponse } from "./generateResponse"

function db(){ return createClient(SUPABASE_URL, SUPABASE_KEY) }

// Mapeia instância -> AI (para teste, Guilherme usa ai_guilherme_01)
const INSTANCE_AI_MAP: Record<string,string> = {
  "patricia-6c2875b4": "ai_patricia_01",
  "guilherme-garcia-c044c57d": "ai_guilherme_01",
}

export async function handlePatriciaInbound({ telefone, texto, leadId, instanceName }: { telefone: string; texto: string; leadId?: string; instanceName?: string }){
  // compat: se chamado com 3 args, usa Patricia como default
  const INSTANCE = instanceName || "patricia-6c2875b4"
  const AI_ID = INSTANCE_AI_MAP[INSTANCE] || "ai_patricia_01"
  try{
    const { data: ai } = await db().from("ai_agents").select("id,is_active").eq("id", AI_ID).maybeSingle()
    if(!ai?.is_active) return // IA pausada

    // Para teste com número da namorada (sem lead), não exige Tráfego Pago
    const isTestNumber = telefone === "5518981729340" || telefone === "18981729340"
    if(leadId && !isTestNumber){
      const { data: lead } = await db().from("leads").select("origem,status").eq("id", leadId).maybeSingle()
      if(lead?.origem !== "Tráfego Pago") return
      if(lead?.status === "escalated" || lead?.status === "perdido") return
    }

    // Busca ou cria conversa IA para este contato
    let convId: string
    const { data: existing } = await db().from("conversations_ia").select("id,ai_responding").eq("ai_id", AI_ID).eq("contact_id", leadId || telefone).maybeSingle()
    if(existing?.id) convId = existing.id
    else {
      const { data: created } = await db().from("conversations_ia").insert({ id:`conv_${Date.now()}`, ai_id: AI_ID, contact_id: leadId || telefone, channel:"whatsapp", external_id: telefone, status:"active", ai_responding:true }).select("id").single()
      convId = created!.id
    }

    // Atendimento pausado pelo gestor: IA não responde (e volta a responder quando reativado)
    if(existing?.ai_responding === false) return

    const { data: history } = await db().from("messages_ia").select("role,content").eq("conversation_id", convId).order("created_at", {ascending:true}).limit(10)
    await db().from("messages_ia").insert({ id:`msg_${Date.now()}`, conversation_id: convId, role:"user", content: texto })

    const { message: aiResp } = await generateAIResponse({ aiId: AI_ID, userMessage: texto, conversationHistory: (history||[]).map((m:any)=>({role:m.role, content:m.content})) })

    await db().from("messages_ia").insert({ id:`msg_${Date.now()+1}`, conversation_id: convId, role:"ai", content: aiResp })

    // Envia via WhatsApp da instância — UMA única chamada (evita duplicação).
    // Preferência: rota interna; fallback direto EVOLUTION só se a rota falhar.
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://crm-colucci-pre-final.vercel.app"
    let envRes = await fetch(`${siteUrl}/api/whatsapp/send`, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ instanceName: INSTANCE, telefone, texto: aiResp })
    }).then(async r=>({ok:r.ok, erro: r.ok ? "" : await r.text()})).catch((e:any)=>({ok:false, erro:String(e)}))
    if(!envRes.ok){
      const evoUrl = process.env.EVOLUTION_API_URL
      const evoKey = process.env.EVOLUTION_API_KEY
      if(evoUrl && evoKey){
        envRes = await fetch(`${evoUrl}/message/sendText/${INSTANCE}`, {
          method:"POST",
          headers:{ "Content-Type":"application/json", "apikey": evoKey },
          body: JSON.stringify({ number: telefone, text: aiResp })
        }).then(async r=>({ok:r.ok, erro: r.ok ? "" : await r.text()})).catch((e:any)=>({ok:false, erro:String(e)}))
      }
    }
    // Registra o resultado para auditoria/alertas imediatos
    await db().from("automation_logs").insert({
      lead_id: leadId || null,
      event_type: envRes.ok ? "ia_resposta_enviada" : "ia_envio_falhou",
      event_title: envRes.ok ? "IA respondeu no WhatsApp" : "Falha ao enviar resposta da IA",
      event_description: envRes.ok ? `IA respondeu via ${INSTANCE} para ${telefone}` : `Falha ao enviar resposta via WhatsApp para ${telefone}: ${envRes.erro}`,
      actor_type: "ia",
      payload: JSON.stringify({ ai_id: AI_ID, convId, instance: INSTANCE }).slice(0,400),
    }).catch(()=>{})
  }catch(e){
    console.error("[IA Patricia] erro", e)
  }
}
