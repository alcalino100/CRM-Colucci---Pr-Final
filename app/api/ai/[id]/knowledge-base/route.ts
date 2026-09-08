import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"
function db(){ return createClient(SUPABASE_URL, SUPABASE_KEY) }

export async function GET(_req: NextRequest, { params }: { params: Promise<{id:string}> }){
  const { id } = await params
  const { data: kb } = await db().from("knowledge_bases").select("*").eq("ai_id", id).maybeSingle()
  if(!kb) return NextResponse.json({ id:null, documents:[] })
  const { data: docs } = await db().from("documents").select("*").eq("knowledge_base_id", kb.id)
  return NextResponse.json({ ...kb, documents: docs||[] })
}
