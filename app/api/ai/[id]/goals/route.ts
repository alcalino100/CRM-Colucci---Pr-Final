import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"
function db(){ return createClient(SUPABASE_URL, SUPABASE_KEY) }

export async function GET(_req: NextRequest, { params }: { params: Promise<{id:string}> }){
  const { id } = await params
  const { data } = await db().from("goals").select("*").eq("ai_id", id)
  return NextResponse.json(data||[])
}

export async function POST(req: NextRequest, { params }: { params: Promise<{id:string}> }){
  const { id } = await params
  const body = await req.json()
  const row = { id: body.id || `goal_${Date.now()}`, name: body.name, type: body.type || "qualification", prompt: body.prompt || "", ai_id: id, is_active: true }
  const { data, error } = await db().from("goals").insert(row).select("*").single()
  if(error) return NextResponse.json({ error:error.message }, {status:500})
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{id:string}> }){
  const body = await req.json()
  // body deve conter goals array completo para simplificar (usado pelo store)
  if(Array.isArray(body.goals)){
    // apaga e reinsere (simples para MVP)
    const { id } = await params
    await db().from("goals").delete().eq("ai_id", id)
    if(body.goals.length>0){
      const rows = body.goals.map((g:any)=> ({ id:g.id, name:g.name, type:g.type, prompt:g.prompt, ai_id:id }))
      await db().from("goals").insert(rows)
    }
    return NextResponse.json({ ok:true })
  }
  return NextResponse.json({ error:"use goals array" }, {status:400})
}
