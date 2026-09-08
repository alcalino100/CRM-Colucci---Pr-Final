import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"
import { decryptToken } from "@/lib/encryption"
import OpenAI from "openai"

function db(){ return createClient(SUPABASE_URL, SUPABASE_KEY) }

type Input = {
  aiId: string
  userMessage: string
  conversationHistory: { role:string; content:string }[]
}

function providerFromModel(model?: string){
  const m = (model||"").toLowerCase()
  if(m.includes("gemini")) return "gemini"
  if(m.includes("claude")) return "claude"
  return "openai"
}

export async function generateAIResponse({ aiId, userMessage, conversationHistory }: Input){
  const { data: ai } = await db().from("ai_agents").select("*").eq("id", aiId).single()
  if(!ai) throw new Error("AI not found")

  let context = ""
  const { data: kb } = await db().from("knowledge_bases").select("id").eq("ai_id", aiId).maybeSingle()
  if(kb?.id){
    const { data: docs } = await db().from("documents").select("content").eq("knowledge_base_id", kb.id).limit(3)
    const { data: faqs } = await db().from("faqs").select("question,answer").eq("knowledge_base_id", kb.id).limit(2)
    const parts = [
      ...(docs||[]).map((d:any)=> d.content),
      ...(faqs||[]).map((f:any)=> `Q: ${f.question}\nA: ${f.answer}`)
    ]
    if(parts.length) context = "\n\n# CONTEXTO RELEVANTE:\n" + parts.join("\n\n")
  }

  let systemPrompt = (ai.system_prompt || "") + context + "\n\n" + (ai.additional_instructions || "")
  const brand = (ai as any).brand_voice || ""
  if(brand) systemPrompt += `\n\nTom de voz: ${brand}`

  let apiKey: string | undefined
  const rawToken = (ai as any).api_token
  if(rawToken){
    try{ apiKey = decryptToken(rawToken) }catch{ apiKey = rawToken }
  }
  const provider = providerFromModel((ai as any).model_name)
  if(provider==="gemini") apiKey = apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  else if(provider==="claude") apiKey = apiKey || process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY
  else apiKey = apiKey || process.env.OPENAI_API_KEY

  if(!apiKey) throw new Error(`API key não configurada para ${provider}`)

  const model = (ai as any).model_name || (provider==="gemini" ? "gemini-1.5-flash" : provider==="claude" ? "claude-3-5-sonnet" : "gpt-4o-mini")
  const endpoint = (ai as any).api_endpoint || ""

  // Gemini - auditoria: lista modelos disponíveis para a key e tenta em ordem (com fallback para alta demanda)
  if(provider==="gemini"){
    let available: string[] = []
    try{
      const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      const lr = await fetch(listUrl)
      const lj:any = await lr.json()
      if(lr.ok && Array.isArray(lj.models)){
        available = lj.models.filter((m:any)=> (m.supportedGenerationMethods||[]).includes("generateContent")).map((m:any)=> m.name.replace("models/",""))
      }
    }catch{}
    const preferred = [model, "gemini-2.5-flash", "gemini-2.5-pro", "gemini-flash-latest", "gemini-1.5-flash", "gemini-1.5-pro"]
    const tryModels = Array.from(new Set([...preferred.filter(m=> available.length===0 || available.includes(m)), ...available])).slice(0,6)
    let lastErr:any = null
    for(const m of tryModels){
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`
      const historyText = conversationHistory.map(mm=> `${mm.role==="ai"?"assistant":mm.role}: ${mm.content}`).join("\n")
      const contents = [
        { role:"user", parts:[{ text: systemPrompt + "\n\nHistórico:\n" + historyText + `\n\nUsuário: ${userMessage}` }] }
      ]
      const r = await fetch(url, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ contents }) })
      const j = await r.json()
      if(r.ok){
        const text = j.candidates?.[0]?.content?.parts?.[0]?.text || ""
        return { message: text, tokensUsed: j.usageMetadata?.totalTokenCount || 0, model: m }
      }
      lastErr = j.error?.message || "Gemini falhou"
      const isModelErr = String(lastErr).toLowerCase().includes("not found") || String(lastErr).toLowerCase().includes("no longer available") || String(lastErr).toLowerCase().includes("not supported") || String(lastErr).toLowerCase().includes("not found for api version")
      if(!isModelErr) break
    }
    throw new Error(lastErr || "Gemini falhou - nenhum modelo disponível para esta key. Verifique em https://aistudio.google.com/app/apikey e billing.")
  }

  // Claude - modelos atuais: sonnet-5, haiku-4-5, opus-5, fable-5-1
  if(provider==="claude"){
    const tryModels = Array.from(new Set([model, "claude-sonnet-5", "claude-haiku-4-5", "claude-opus-5", "claude-fable-5-1"]))
    let lastErr=""
    for(const m of tryModels){
      const url = "https://api.anthropic.com/v1/messages"
      const historyForClaude = conversationHistory.map(mm=> ({ role: (mm.role==="ai" ? "assistant" : mm.role) as "user"|"assistant", content: mm.content }))
      const r = await fetch(url, {
        method:"POST",
        headers:{ "Content-Type":"application/json", "x-api-key": apiKey, "anthropic-version":"2023-06-01" },
        body: JSON.stringify({
          model: m,
          max_tokens: 500,
          system: systemPrompt,
          messages: [...historyForClaude, { role:"user", content: userMessage }]
        })
      })
      const j = await r.json()
      if(r.ok){
        const text = j.content?.[0]?.text || ""
        return { message: text, tokensUsed: (j.usage?.input_tokens||0) + (j.usage?.output_tokens||0), model: m }
      }
      lastErr = j.error?.message || "Claude falhou"
      const isModelErr = String(lastErr).toLowerCase().includes("not found") || String(lastErr).toLowerCase().includes("model")
      if(!isModelErr) break
    }
    throw new Error(lastErr)
  }

  // OpenAI (default)
  const baseURL = endpoint && endpoint.includes("openai.com") ? endpoint : undefined
  const openai = new OpenAI({ apiKey, baseURL })
  const historyForOpenAI = conversationHistory.map(m=> ({ role: (m.role==="ai" ? "assistant" : m.role) as "user"|"assistant", content: m.content }))
  const resp = await openai.chat.completions.create({
    model,
    messages: [
      { role:"system", content: systemPrompt },
      ...historyForOpenAI,
      { role:"user", content: userMessage }
    ],
    temperature: 0.7,
    max_tokens: 500,
  })

  return {
    message: resp.choices[0]?.message?.content || "",
    tokensUsed: resp.usage?.total_tokens || 0,
    model,
  }
}
