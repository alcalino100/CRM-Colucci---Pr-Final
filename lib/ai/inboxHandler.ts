import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"
import { generateAIResponse } from "./generateResponse"
import { normalizePhone } from "@/lib/labels"
import { getBoundInstances, getRules, dentroDoHorario, leadAptoParaResposta, regrasParaPrompt, sleep, type AgentRules } from "./rules"

function db(){ return createClient(SUPABASE_URL, SUPABASE_KEY) }
const normalize = (v: string) => (v || "").toLowerCase().trim()

// Resolve a IA que responde numa instância. REGRA DE OURO: a instância precisa estar
// vinculada a um agente (config.testInstance ou whitelistInstances) E o agente precisa
// estar ATIVO (is_active) com regras habilitadas (rules.enable). Sem isso, não responde NUNCA.
async function agenteParaInstancia(instanceName: string | undefined): Promise<any | null> {
  if (!instanceName) return null
  const { data: agentes, error } = await db().from("ai_agents").select("id,name,is_active,config,wait_time_ms,message_cap,response_mode")
  if (error || !agentes?.length) return null
  const ativos = (agentes as any[]).filter((a) => a.is_active && getRules(a.config).enable)
  return ativos.find((a) => getBoundInstances(a.config).includes(instanceName)) || null
}

// Acha o lead cujo telefone bate com o contato (mesmo corretor da instância quando possível).
async function acharLeadVinculado(telefone: string | undefined, instanceName: string | undefined): Promise<any | null> {
  if (!telefone) return null
  const { data: candidatos } = await db().from("leads").select("id, telefone, origem, status, corretor_id, referencias")
  const instancia = instanceName
    ? (await db().from("whatsapp_instancias").select("corretor_id").eq("instance_name", instanceName).maybeSingle()).data
    : null
  const corretorId = (instancia as any)?.corretor_id ?? null
  return (candidatos ?? [])
    .filter((l: any) => !corretorId || !l.corretor_id || l.corretor_id === corretorId)
    .find((l: any) => normalizePhone(l.telefone) === normalizePhone(telefone)) ?? null
}

export async function handlePatriciaInbound({ telefone, texto, leadId, instanceName }: { telefone: string; texto: string; leadId?: string; instanceName?: string }){
  try{
    // 1) REGRA DE OURO: instância vinculada a IA ativa + regras habilitadas
    const agente = await agenteParaInstancia(instanceName)
    if(!agente) return
    const AI_ID = agente.id as string
    const rules: AgentRules = getRules(agente.config, agente)
    const isTestNumber = rules.target.numeroTeste.includes(telefone)

    // 2) QUANDO: se houve horário configurado e fora do expediente, não responde agora
    if (!isTestNumber && !dentroDoHorario(rules)) return

    // 3) ONDE: canal habilitado
    if (rules.channels.length && !rules.channels.includes("whatsapp")) return

    // 4) QUEM: só responde para lead apto (origem + tags) ou número de teste.
    //    Mensagem orgânica/pessoal sem vínculo com lead permitido → NÃO responde.
    let lead: any = null
    if (leadId) {
      const { data: l } = await db().from("leads").select("id,origem,status,referencias,corretor_id").eq("id", leadId).maybeSingle()
      lead = l
    } else if (!isTestNumber) {
      lead = await acharLeadVinculado(telefone, instanceName)
    }
    if (!isTestNumber && !leadAptoParaResposta(rules, lead)) return
    // Status bloqueados configurados (ex.: perdido/escalated) — nunca responde
    if (lead && rules.target.statusBloqueados.map(normalize).includes(normalize(String(lead.status || "")))) return

    const leadIdEfetivo = lead?.id ?? undefined

    // 5) Busca ou cria conversa IA para este contato
    let convId: string
    const key = leadIdEfetivo || telefone
    const { data: existing } = await db().from("conversations_ia").select("id,ai_responding,last_message_at").eq("ai_id", AI_ID).eq("contact_id", key).maybeSingle()
    if(existing?.id) convId = existing.id
    else {
      const { data: created } = await db().from("conversations_ia").insert({ id:`conv_${Date.now()}`, ai_id: AI_ID, contact_id: key, channel:"whatsapp", external_id: telefone, status:"active", ai_responding:true }).select("id").single()
      convId = created!.id
    }

    // Atendimento pausado pelo gestor: IA não responde
    if(existing?.ai_responding === false) return

    // 5b) Auto-pausa por inatividade: lead não respondeu há X min → pausa e libera p/ automação
    if (rules.coordination.pausarPorInatividade && rules.coordination.tempoInatividadeMin > 0 && existing?.last_message_at) {
      const ultimaMsg = new Date(existing.last_message_at).getTime()
      if (Date.now() - ultimaMsg > rules.coordination.tempoInatividadeMin * 60_000) {
        await db().from("conversations_ia").update({ ai_responding: false }).eq("id", convId)
        return
      }
    }

    // 5c) Modo sugestão: não envia — só registra a sugestão para aprovação humana
    if (rules.style.responseMode === "sugestao") {
      try {
        await db().from("automation_logs").insert({
          lead_id: leadIdEfetivo ?? null,
          event_type: "ia_sugestao_resposta",
          event_title: "IA sugeriu resposta (modo sugestão)",
          event_description: `Sugestão para ${telefone} via ${instanceName}: "${texto.slice(0,80)}"`,
          actor_type: "ia",
        })
      } catch { /* best-effort */ }
      return
    }

    // 5d) Limite de mensagens: máx. msgs da IA por conversa (messageCap)
    if (rules.style.maxMessages > 0) {
      const { count } = await db().from("messages_ia").select("id", { count: "exact", head: true }).eq("conversation_id", convId).eq("role", "ai")
      if ((count ?? 0) >= rules.style.maxMessages) {
        await db().from("conversations_ia").update({ ai_responding: false }).eq("id", convId)
        try {
          await db().from("automation_logs").insert({
            lead_id: leadIdEfetivo ?? null,
            event_type: "ia_limite_atingido",
            event_title: "Limite de mensagens da IA atingido",
            event_description: `Conversa ${convId} pausada após ${count} respostas da IA (máx. ${rules.style.maxMessages}).`,
            actor_type: "ia",
          })
        } catch { /* best-effort */ }
        return
      }
    }

    // 5e) Espera configurada antes de responder (anti-robô)
    if (rules.style.waitMs > 0) await sleep(Math.min(rules.style.waitMs, 15000))

    const { data: history } = await db().from("messages_ia").select("role,content").eq("conversation_id", convId).order("created_at", {ascending:true}).limit(10)
    await db().from("messages_ia").insert({ id:`msg_${Date.now()}`, conversation_id: convId, role:"user", content: texto })

    const { message: aiResp } = await generateAIResponse({
      aiId: AI_ID,
      userMessage: texto,
      conversationHistory: (history||[]).map((m:any)=>({role:m.role, content:m.content})),
      regrasSuplementares: regrasParaPrompt(rules, (agente.name || "assistente da Colucci Imóveis")),
    })

    await db().from("messages_ia").insert({ id:`msg_${Date.now()+1}`, conversation_id: convId, role:"ai", content: aiResp })

    // 6) Envia via WhatsApp da instância — UMA única chamada (evita duplicação).
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
    try {
      await db().from("automation_logs").insert({
        lead_id: leadIdEfetivo || null,
        event_type: envRes.ok ? "ia_resposta_enviada" : "ia_envio_falhou",
        event_title: envRes.ok ? "IA respondeu no WhatsApp" : "Falha ao enviar resposta da IA",
        event_description: envRes.ok ? `IA respondeu via ${instanceName} para ${telefone}` : `Falha ao enviar resposta via WhatsApp para ${telefone}: ${envRes.erro}`,
        actor_type: "ia",
        payload: JSON.stringify({ ai_id: AI_ID, convId, instance: instanceName }).slice(0,400),
      })
    } catch { /* log é best-effort */ }
  }catch(e){
    console.error("[IA] erro inbox", e)
  }
}