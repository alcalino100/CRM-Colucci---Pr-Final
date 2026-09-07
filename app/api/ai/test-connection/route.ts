import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"

export async function POST(req: NextRequest){
  const { apiToken, apiEndpoint, modelName } = await req.json()
  const token = apiToken || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY
  const endpoint = apiEndpoint || "https://api.openai.com/v1"
  const model = modelName || "gpt-4o-mini"
  if(!token) return NextResponse.json({ error:"Nenhum token fornecido e nenhum GEMINI_API_KEY no servidor" }, {status:400})
  try{
    // Tenta OpenAI primeiro
    if(token.startsWith("sk-") || endpoint.includes("openai")){
      const client = new OpenAI({ apiKey: token, baseURL: endpoint })
      const r = await client.chat.completions.create({
        model,
        messages: [{ role:"user", content:"Diga 'ok' se você está funcionando." }],
        max_tokens: 5,
      })
      return NextResponse.json({ ok:true, model, response: r.choices[0]?.message?.content, tokens: r.usage?.total_tokens })
    }
    // Fallback Gemini (usa REST)
    if(token.startsWith("AIza") || model.includes("gemini")){
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${token}`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ contents:[{ parts:[{ text:"Diga ok" }]}] })
      })
      const j = await r.json()
      if(!r.ok) throw new Error(j.error?.message || "Gemini falhou")
      return NextResponse.json({ ok:true, model, response: j.candidates?.[0]?.content?.parts?.[0]?.text })
    }
    return NextResponse.json({ ok:true, model, note:"Token parece válido, mas modelo não reconhecido como OpenAI/Gemini" })
  }catch(e:any){
    return NextResponse.json({ error: e.message || "Falha na conexão" }, {status:500})
  }
}
