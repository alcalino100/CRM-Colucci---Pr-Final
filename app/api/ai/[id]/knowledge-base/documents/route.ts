import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

function db() {
  return createClient(SUPABASE_URL, SUPABASE_KEY)
}

async function ensureKB(aiId: string): Promise<string> {
  const { data: kb } = await db().from("knowledge_bases").select("id").eq("ai_id", aiId).maybeSingle()
  if (kb?.id) return kb.id as string
  const row = { id: `kb_${Date.now()}`, ai_id: aiId, name: "Base de conhecimento" }
  const { data: created, error } = await db().from("knowledge_bases").insert(row).select("id").single()
  if (error) throw error
  return (created as { id: string }).id
}

// Lista documentos da KB do agente (com contagem de chunks).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const kbId = await ensureKB(id)
    const { data, error } = await db()
      .from("documents")
      .select("id,name,type,content,file_size,uploaded_at,chunks_count")
      .eq("knowledge_base_id", kbId)
      .order("uploaded_at", { ascending: false })
    if (error) throw error
    return NextResponse.json({ ok: true, kb_id: kbId, documents: (data ?? []).map((d: Record<string, unknown>) => ({ ...d, content: undefined })) })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// Salva documento (texto extraído no cliente) + indexa chunks/embeddings.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => null)
    const name = String(body?.name ?? "").trim()
    if (!name) return NextResponse.json({ error: "name é obrigatório" }, { status: 400 })
    const content = String(body?.content ?? "")
    const kbId = await ensureKB(id)
    const row = {
      id: `doc_${Date.now()}`,
      name,
      type: String(body?.type ?? "text"),
      url: "",
      content,
      file_size: content.length,
      knowledge_base_id: kbId,
    }
    const { data, error } = await db().from("documents").insert(row).select("id").single()
    if (error) throw error
    const docId = (data as { id: string }).id
    let indexed = { chunks: 0, dim: 0, model: "", erro: null as string | null }
    if (content.trim()) {
      try {
        const { indexDocument } = await import("@/lib/ai/ragSearch")
        const r = await indexDocument(docId, content)
        indexed = { chunks: r.chunks, dim: r.dim, model: r.model, erro: r.chunks === 0 ? (r.erro ?? "embedding falhou para todos os chunks") : null }
      } catch (e: unknown) {
        indexed.erro = e instanceof Error ? e.message : String(e)
        console.error("[KB] falha ao indexar", indexed.erro)
      }
    }
    try {
      await db().from("automation_logs").insert({
        event_type: "ia_config_alterada",
        event_title: `Documento adicionado à base (${name})`,
        event_description: `Agente ${id}: "${name}" salvo com ${indexed.chunks} chunk(s) indexado(s)${indexed.model ? ` (${indexed.model})` : " — sem texto para indexar"}.`,
        actor_type: "gestor",
      })
    } catch {
      /* log é best-effort */
    }
    return NextResponse.json({ ok: true, id: docId, kb_id: kbId, indexed })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// Remove documento (embeddings apagam em cascata).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const docId = new URL(req.url).searchParams.get("docId")
    if (!docId) return NextResponse.json({ error: "docId é obrigatório" }, { status: 400 })
    const kbId = await ensureKB(id)
    const { error } = await db().from("documents").delete().eq("id", docId).eq("knowledge_base_id", kbId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
