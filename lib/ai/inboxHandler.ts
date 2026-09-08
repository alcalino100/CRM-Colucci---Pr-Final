import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"
import { generateAIResponse } from "./generateResponse"
import { normalizePhone } from "@/lib/labels"

function db(){ return createClient(SUPABASE_URL, SUPABASE_KEY) }

function parseConfig(cfg: unknown): Record<string, any> {
  if (!cfg) return {}
  if (typeof cfg === "string") { try { return JSON.parse(cfg) } catch { return {} } }
  if (typeof cfg === "object") return cfg as Record<string, any>
  return {}
}

// Retorna a instância WhatsApp vinculada ao agente (config.testInstance),
// ou null se o agente não tiver vínculo explícito.
function instanciaVinculada(agente: any): string | null {
  const cfg = parseConfig(agente?.config)
  return cfg?.testInstance || cfg?.instance || null
}

// Resolve a IA que responde numa instância. REGRA NOVA (correção do bug):
// SÓ responde na instância explicitamente vinculada ao agente (config.testInstance).
// Se a instância não está vinculada a NENHUM agente ativo, não responde NUNCA —
// independentemente de quem mandou mensagem. Sem fallback para "outras instâncias".
async function agenteParaInstancia(instanceName: string | undefined): Promise<any | null> {
  if (!instanceName) return null
  const { data: agentes, error } = await db().from("ai_agents").select("id,name,is_active,config")
  if (error || !agentes?.length) return null
  return (agentes as any[]).find((a) => a.is_active && instanciaVinculada(a) === instanceName) || null
}

// Acha o lead do mesmo corretor da instância cujo telefone bate com o contato.
// Só respondemos para lead EXISTENTE de Tráfego Pago (ou número de teste) — nunca
// para contato orgânico/pessoal sem vínculo (foi isso que causou respostas indevidas).
async function acharLeadVinculado(telefone: string | undefined, instanceName: string | undefined): Promise<string | null> {
  if (!telefone) return null
  const { data: candidatos } = await db().from("leads").select("id, telefone, origem, status, corretor_id")
  const instancia = instanceName
    ? (await db().from("whatsapp_instancias").select("corretor_id").eq("instance_name", instanceName).maybeSingle()).data
    : null
  const corretorId = (instancia as any)?.corretor_id ?? null
  return (candidatos ?? [])
    .filter((l: any) => !corretorId || !l.corretor_id || l.corretor_id === corretorId)
    .find((l: any) => normalizePhone(l.telefone) === normalizePhone(telefone))?.id ?? null
}

export async function handlePatriciaInbound({ telefone, texto, leadId, instanceName }: { telefone: string; texto: string; leadId?: string; instanceName?: string }){
  try{
    // 1) REGRA DE OURO: a instância precisa estar vinculada a uma IA ATIVA.
    //    Sem isso, não respondemos (correção do bug que respondia em TODAS as instâncias).
    const agente = await agenteParaInstancia(instanceName)
    if(!agente) return // instância sem IA ativa vinculada → ignora completamente
    const AI_ID = agente.id as string

    // 2) Só respondemos para o número de teste ou para LEAD real de Tráfego Pago
    const isTestNumber = telefone === "5518981729340" || telefone === "18981729340"
    if(!isTestNumber){
      const leadResolvido = leadId || (await acharLeadVinculado(telefone, instanceName))
      if(!leadResolvido){
        // Mensagem orgânica/pessoal sem vínculo com lead Tráfego Pago → NÃO responde
        return
      }
      leadId = leadResolvido
      const { data: lead } = await db().from("leads").select("origem,status").eq("id", leadId).maybeSingle()
      if(lead?.origem !== "Tráfego Pago") return
      if(lead?.status === "escalated" || lead?.status === "perdido") return
    }

    // 3) Busca ou cria conversa IA para este contato
    let convId: string
    const key = leadId || telefone
    const { data: existing } = await db().from("conversations_ia").select("id,ai_responding").eq("ai_id", AI_ID).eq("contact_id", key).maybeSingle()
    if(existing?.id) convId = existing.id
    else {
      const { data: created } = await db().from("conversations_ia").insert({ id:`conv_${Date.now()}`, ai_id: AI_ID, contact_id: key, channel:"whatsapp", external_id: telefone, status:"active", ai_responding:true }).select("id").single()
      convId = created!.id
    }

    // Atendimento pausado pelo gestor: IA não responde (e volta a responder quando reativado)
    if(existing?.ai_responding === false) return

    const { data: history } = await db().from("messages_ia").select("role,content").eq("conversation_id", convId).order("created_at", {ascending:true}).limit(10)
    await db().from("messages_ia").insert({ id:`msg_${Date.now()}`, conversation_id: convId, role:"user", content: texto })

    const { message: aiResp } = await generateAIResponse({ aiId: AI_ID, userMessage: texto, conversationHistory: (history||[]).map((m:any)=>({role:m.role, content:m.content})) })

    await db().from("messages_ia").insert({ id:`msg_${Date.now()+1}`, conversation_id: convId, role:"ai", content: aiResp })

    // 4) Envia via WhatsApp da instância — UMA única chamada (evita duplicação).
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://crm-colucci-pre-final.vercel.app"
    let envRes = await fetch(`${siteUrl}/api/whatsapp/send`, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ instanceName, telefone, texto: aiResp })
    }).then(async r=>({ok:r.ok, erro: r.ok ? "" : await r.text()})).catch((e:any)=>({ok:false, erro:String(e)}))
    if(!envRes.ok){
      const evoUrl = process.env.EVOLUTION_API_URL
      const evoKey = process.env.EVOLUTION_API_KEY
      if(evoUrl && evoKey){
        envRes = await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
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
      event_description: envRes.ok ? `IA respondeu via ${instanceName} para ${telefone}` : `Falha ao enviar resposta via WhatsApp para ${telefone}: ${envRes.erro}`,
      actor_type: "ia",
      payload: JSON.stringify({ ai_id: AI_ID, convId, instance: instanceName }).slice(0,400),
    }).catch(()=>{})
  }catch(e){
    console.error("[IA] erro inbox", e)
  }
}