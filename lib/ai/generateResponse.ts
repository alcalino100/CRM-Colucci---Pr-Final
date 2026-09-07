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

export async function generateAIResponse({ aiId, userMessage, conversationHistory }: Input){
  const { data: ai } = await db().from("ai_agents").select("*").eq("id", aiId).single()
  if(!ai) throw new Error("AI not found")

  // Busca KB (documents + faqs) para RAG simples
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

  // Usa token descriptografado se existir, senão env
  let apiKey: string | undefined
  try{ apiKey = ai.api_token ? decryptToken(ai.api_token) : undefined }catch{}
  apiKey = apiKey || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY
  if(!apiKey) throw new Error("API key não configurada")

  const openai = new OpenAI({ apiKey })
  const model = ai.model_name || "gpt-4o-mini"

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
