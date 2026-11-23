import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL } from "@/lib/supabase/config"
import { SUPABASE_SERVER_KEY } from "@/lib/supabase/server-key"
import { KNOWLEDGE_BASES_COLUMNS, DOCUMENTS_COLUMNS } from "@/lib/supabase/projections"
function db(){ return createClient(SUPABASE_URL, SUPABASE_SERVER_KEY) }

export async function GET(_req: NextRequest, { params }: { params: Promise<{id:string}> }){
  const { id } = await params
  const { data: kb } = await db().from("knowledge_bases").select(KNOWLEDGE_BASES_COLUMNS).eq("ai_id", id).maybeSingle()
  if(!kb) return NextResponse.json({ id:null, documents:[] })
  const { data: docs } = await db().from("documents").select(DOCUMENTS_COLUMNS).eq("knowledge_base_id", kb.id)
  return NextResponse.json({ ...kb, documents: docs||[] })
}
