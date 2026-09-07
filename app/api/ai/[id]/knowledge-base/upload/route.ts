import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"

function db(){ return createClient(SUPABASE_URL, SUPABASE_KEY) }

export async function POST(req: NextRequest, { params }: { params: Promise<{id:string}> }){
  const { id } = await params
  const form = await req.formData()
  const file = form.get("file") as File | null
  if(!file) return NextResponse.json({ error:"No file" }, {status:400})
  try{
    // garante KB
    let kbId: string
    const { data: kb } = await db().from("knowledge_bases").select("id").eq("ai_id", id).maybeSingle()
    if(kb?.id) kbId = kb.id
    else {
      const { data: created } = await db().from("knowledge_bases").insert({ id:`kb_${Date.now()}`, name:`KB for ${id}`, ai_id: id }).select("id").single()
      kbId = created!.id
    }
    // Mock S3 url + content (Fase 3 vai extrair texto real)
    const doc = {
      id: `doc_${Date.now()}`,
      name: file.name,
      type: file.type || "application/octet-stream",
      url: `https://mock-s3/${file.name}`,
      content: `Conteúdo extraído de ${file.name} (mock)`,
      file_size: file.size,
      knowledge_base_id: kbId,
    }
    const { data, error } = await db().from("documents").insert(doc).select("*").single()
    if(error) throw error
    return NextResponse.json(data)
  }catch(e:any){
    return NextResponse.json({ error:e.message }, {status:500})
  }
}
