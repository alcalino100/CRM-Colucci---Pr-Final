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
  try{ apiKey = (ai as any).api_token ? decryptToken((ai as any).api_token) : undefined }catch{}
  const provider = providerFromModel((ai as any).model_name)
  if(provider==="gemini") apiKey = apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  else if(provider==="claude") apiKey = apiKey || process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY
  else apiKey = apiKey || process.env.OPENAI_API_KEY

  if(!apiKey) throw new Error(`API key não configurada para ${provider}`)

  const model = (ai as any).model_name || (provider==="gemini" ? "gemini-1.5-flash" : provider==="claude" ? "claude-3-5-sonnet" : "gpt-4o-mini")
  const endpoint = (ai as any).api_endpoint || ""

  // Gemini - auditoria: lista modelos disponíveis para a key e tenta em ordem
  if(provider==="gemini"){
    // Descobre modelos permitidos para esta key (free tier pode ter 1.5 com limite 0)
    let available: string[] = []
    try{
      const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      const lr = await fetch(listUrl)
      const lj:any = await lr.json()
      if(lr.ok && Array.isArray(lj.models)){
        available = lj.models.filter((m:any)=> (m.supportedGenerationMethods||[]).includes("generateContent")).map((m:any)=> m.name.replace("models/",""))
      }
    }catch{}
    const preferred = [model, "gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.0-pro", "gemini-flash-latest", "gemini-pro-latest"]
    // prioriza os que estão na lista retornada pela API
    const tryModels = Array.from(new Set([...preferred.filter(m=> available.length===0 || available.includes(m)), ...available])).slice(0,6)
    let lastErr:any = null
    for(const m of tryModels){
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`
      const contents = [
        { role:"user", parts:[{ text: systemPrompt + "\n\nHistórico:\n" + conversationHistory.map(mm=> `${mm.role}: ${mm.content}`).join("\n") + `\n\nUsuário: ${userMessage}` }] }
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

  // Claude
  if(provider==="claude"){
    const url = endpoint.includes("anthropic.com") ? `${endpoint.replace(/\/$/,"")}/v1/messages` : "https://api.anthropic.com/v1/messages"
    const r = await fetch(url, {
      method:"POST",
      headers:{ "Content-Type":"application/json", "x-api-key": apiKey, "anthropic-version":"2023-06-01" },
      body: JSON.stringify({
        model,
        max_tokens: 500,
        system: systemPrompt,
        messages: [...conversationHistory.map(m=> ({ role: m.role as "user"|"assistant", content: m.content })), { role:"user", content: userMessage }]
      })
    })
    const j = await r.json()
    if(!r.ok) throw new Error(j.error?.message || "Claude falhou")
    const text = j.content?.[0]?.text || ""
    return { message: text, tokensUsed: j.usage?.input_tokens + j.usage?.output_tokens || 0, model }
  }

  // OpenAI (default)
  const baseURL = endpoint && endpoint.includes("openai.com") ? endpoint : undefined
  const openai = new OpenAI({ apiKey, baseURL })
  const resp = await openai.chat.completions.create({
    model,
    messages: [
      { role:"system", content: systemPrompt },
      ...conversationHistory.map(m=> ({ role: m.role as "user"|"assistant", content: m.content })),
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
