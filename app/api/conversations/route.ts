import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"

function db(){ return createClient(SUPABASE_URL, SUPABASE_KEY) }

export async function POST(req: NextRequest){
  const { aiId, contactId, channel } = await req.json()
  if(!aiId || !contactId) return NextResponse.json({ error:"aiId e contactId obrigatórios" }, {status:400})
  const id = `conv_${Date.now()}`
  const { data, error } = await db().from("conversations_ia").insert({ id, ai_id: aiId, contact_id: contactId, channel: channel||"whatsapp", status:"active", ai_responding:true }).select("*").single()
  if(error) return NextResponse.json({ error:error.message }, {status:500})
  return NextResponse.json(data)
}

export async function GET(req: NextRequest){
  const aiId = new URL(req.url).searchParams.get("aiId")
  const q = db().from("conversations_ia").select("*").order("last_message_at", {ascending:false}).limit(50)
  if(aiId) q.eq("ai_id", aiId)
  const { data } = await q
  return NextResponse.json(data||[])
}
