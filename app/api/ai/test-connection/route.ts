import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"

function providerFrom(model?: string, token?: string, endpoint?: string){
  const m=(model||"").toLowerCase()
  if(m.includes("gemini")) return "gemini"
  if(m.includes("claude")) return "claude"
  if(endpoint?.includes("generativelanguage")) return "gemini"
  if(endpoint?.includes("anthropic")) return "claude"
  if(token?.startsWith("AIza")) return "gemini"
  if(token?.startsWith("sk-ant-")) return "claude"
  return "openai"
}

export async function POST(req: NextRequest){
  const { apiToken, apiEndpoint, modelName } = await req.json()
  const model = modelName || "gemini-1.5-flash"
  const provider = providerFrom(modelName, apiToken, apiEndpoint)
  const token = apiToken || (provider==="gemini" ? (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) : provider==="claude" ? (process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY) : process.env.OPENAI_API_KEY)
  const endpoint = apiEndpoint || (provider==="gemini" ? "https://generativelanguage.googleapis.com" : provider==="claude" ? "https://api.anthropic.com" : "https://api.openai.com/v1")
  if(!token) return NextResponse.json({ error:`Nenhum token para ${provider}. Preencha no Bot Settings ou configure ${provider==="gemini"?"GEMINI_API_KEY":provider==="claude"?"CLAUDE_API_KEY":"OPENAI_API_KEY"} no servidor` }, {status:400})
  try{
    if(provider==="gemini"){
      const url = `${endpoint.replace(/\/$/,"")}/v1beta/models/${model}:generateContent?key=${token}`
      const r = await fetch(url, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ contents:[{ parts:[{ text:"Diga 'ok' se você está funcionando." }]}] }) })
      const j = await r.json()
      if(!r.ok) throw new Error(j.error?.message || "Gemini falhou")
      return NextResponse.json({ ok:true, provider, model, response: j.candidates?.[0]?.content?.parts?.[0]?.text, tokens: j.usageMetadata?.totalTokenCount })
    }
    if(provider==="claude"){
      const url = endpoint.includes("anthropic.com") ? `${endpoint.replace(/\/$/,"")}/v1/messages` : "https://api.anthropic.com/v1/messages"
      const r = await fetch(url, { method:"POST", headers:{"Content-Type":"application/json", "x-api-key": token, "anthropic-version":"2023-06-01"}, body: JSON.stringify({ model, max_tokens:10, messages:[{role:"user", content:"Diga ok"}] }) })
      const j = await r.json()
      if(!r.ok) throw new Error(j.error?.message || "Claude falhou")
      return NextResponse.json({ ok:true, provider, model, response: j.content?.[0]?.text })
    }
    const client = new OpenAI({ apiKey: token, baseURL: endpoint.includes("openai.com") ? endpoint : undefined })
    const r = await client.chat.completions.create({ model, messages: [{ role:"user", content:"Diga 'ok' se você está funcionando." }], max_tokens: 5 })
    return NextResponse.json({ ok:true, provider, model, response: r.choices[0]?.message?.content, tokens: r.usage?.total_tokens })
  }catch(e:any){
    return NextResponse.json({ error: e.message || "Falha na conexão", provider, model }, {status:500})
  }
}
