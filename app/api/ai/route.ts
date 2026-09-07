import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"

function db(){ return createClient(SUPABASE_URL, SUPABASE_KEY) }

export async function GET(){
  try{
    const { data, error } = await db().from("ai_agents").select("*").order("created_at", {ascending:false})
    if(error) throw error
    return NextResponse.json(data)
  }catch(e:any){
    // fallback para mock se tabela ainda não existe (Fase 1)
    return NextResponse.json([])
  }
}

export async function POST(req: NextRequest){
  try{
    const body = await req.json()
    const id = body.id || `ai_${Date.now()}`
    const row = {
      id,
      name: body.name,
      description: body.description || null,
      bot_template: body.botTemplate || body.bot_template || "vendas",
      channels: body.channels || ["whatsapp"],
      response_mode: body.responseMode || "auto",
      wait_time_ms: body.waitTimeMs ?? 2000,
      message_cap: body.messageCap ?? 10,
      api_token: body.apiToken || null,
      api_endpoint: body.apiEndpoint || null,
      model_name: body.modelName || body.model_name || "gpt-4",
      system_prompt: body.systemPrompt || "",
      additional_instructions: body.additionalInstructions || "",
      brand_voice: body.brandVoice || "",
      handoff_rules: body.handoffRules || "",
      is_active: !!body.isActive,
      config: body.config || null,
    }
    const { data, error } = await db().from("ai_agents").insert(row).select("*").single()
    if(error) throw error
    return NextResponse.json(data)
  }catch(e:any){
    return NextResponse.json({ error:e.message }, {status:500})
  }
}
