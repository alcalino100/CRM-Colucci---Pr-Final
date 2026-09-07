import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"

function db(){ return createClient(SUPABASE_URL, SUPABASE_KEY) }

export async function PUT(req: NextRequest, { params }: { params: Promise<{id:string}> }){
  const { id } = await params
  const body = await req.json()
  try{
    const patch: any = {}
    if(body.name!==undefined) patch.name = body.name
    if(body.description!==undefined) patch.description = body.description
    if(body.botTemplate!==undefined) patch.bot_template = body.botTemplate
    if(body.channels!==undefined) patch.channels = body.channels
    if(body.responseMode!==undefined) patch.response_mode = body.responseMode
    if(body.waitTimeMs!==undefined) patch.wait_time_ms = body.waitTimeMs
    if(body.messageCap!==undefined) patch.message_cap = body.messageCap
    if(body.apiToken!==undefined) patch.api_token = body.apiToken
    if(body.systemPrompt!==undefined) patch.system_prompt = body.systemPrompt
    if(body.additionalInstructions!==undefined) patch.additional_instructions = body.additionalInstructions
    if(body.brandVoice!==undefined) patch.brand_voice = body.brandVoice
    if(body.handoffRules!==undefined) patch.handoff_rules = body.handoffRules
    if(body.isActive!==undefined) patch.is_active = body.isActive
    patch.updated_at = new Date().toISOString()
    const { data, error } = await db().from("ai_agents").update(patch).eq("id", id).select("*").single()
    if(error) throw error
    return NextResponse.json(data)
  }catch(e:any){
    return NextResponse.json({ error:e.message }, {status:500})
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{id:string}> }){
  const { id } = await params
  try{
    const { error } = await db().from("ai_agents").delete().eq("id", id)
    if(error) throw error
    return NextResponse.json({ success:true })
  }catch(e:any){
    return NextResponse.json({ error:e.message }, {status:500})
  }
}
