import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"
function db(){ return createClient(SUPABASE_URL, SUPABASE_KEY) }

export async function GET(_req: NextRequest, { params }: { params: Promise<{id:string}> }){
  const { id } = await params
  // busca conversas da IA e suas mensagens com metadata de tokens
  const { data: convs } = await db().from("conversations_ia").select("id").eq("ai_id", id).limit(50)
  if(!convs || convs.length===0) return NextResponse.json([])
  const ids = convs.map(c=>c.id)
  const { data: msgs } = await db().from("messages_ia").select("id,role,content,metadata,created_at,conversation_id").in("conversation_id", ids).order("created_at", {ascending:false}).limit(100)
  const logs = (msgs||[]).map((m:any)=> ({
    id: m.id,
    role: m.role,
    content: m.content,
    tokens: m.metadata?.tokensUsed || m.metadata?.tokens || 0,
    model: m.metadata?.model || "",
    created_at: m.created_at,
    conversation_id: m.conversation_id,
  }))
  return NextResponse.json(logs)
}
