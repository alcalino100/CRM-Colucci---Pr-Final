import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"

function db(){ return createClient(SUPABASE_URL, SUPABASE_KEY) }

export async function POST(req: NextRequest){
  const { aiId, contactId, channel, testMode } = await req.json()
  if(!aiId || !contactId) return NextResponse.json({ error:"aiId e contactId obrigatórios" }, {status:400})
  const id = `conv_${Date.now()}`
  const row: Record<string, unknown> = { id, ai_id: aiId, contact_id: contactId, channel: channel || (testMode ? "test" : "whatsapp"), status: testMode ? "test" : "active", ai_responding: true }
  // test_mode pode não existir em bancos antigos — tenta com, senão sem.
  let data, error
  const withFlag = await db().from("conversations_ia").insert({ ...row, test_mode: !!testMode }).select("*").single()
  if(withFlag.error && String(withFlag.error.message || "").includes("test_mode")){
    const fallback = await db().from("conversations_ia").insert(row).select("*").single()
    data = fallback.data; error = fallback.error
  } else { data = withFlag.data; error = withFlag.error }
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
