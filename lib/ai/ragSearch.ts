import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"
import OpenAI from "openai"

function db() {
  return createClient(SUPABASE_URL, SUPABASE_KEY)
}

export type ChunkHit = { chunk_text: string; similarity: number; document_id: string }
export type EmbeddingOut = { vector: number[]; dim: number; model: string }

// ---------------------------------------------------------------------------
// Puro / testável offline.
// ---------------------------------------------------------------------------

// Quebra o texto em chunks de ~size chars, preferindo fronteiras de parágrafo/linha.
export function chunkText(text: string, size = 500): string[] {
  const clean = String(text || "").replace(/\r/g, "").trim()
  if (!clean) return []
  if (clean.length <= size) return [clean]
  const out: string[] = []
  const paras = clean.split(/\n\s*\n/)
  let atual = ""
  const flush = () => {
    const t = atual.trim()
    if (t) out.push(t)
    atual = ""
  }
  for (const p of paras) {
    if ((atual + "\n\n" + p).trim().length <= size) {
      atual = (atual ? atual + "\n\n" : "") + p
      continue
    }
    if (atual.trim()) flush()
    if (p.length <= size) {
      atual = p
      continue
    }
    // Parágrafo longo: corta por sentenças e, no limite, por tamanho.
    const sents = p.split(/(?<=[.!?])\s+/)
    for (const s of sents) {
      if ((atual + " " + s).trim().length <= size) {
        atual = (atual ? atual + " " : "") + s
      } else {
        if (atual.trim()) flush()
        if (s.length <= size) atual = s
        else {
          for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size).trim())
        }
      }
    }
  }
  flush()
  return out.filter(Boolean)
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// ---------------------------------------------------------------------------
// Embeddings (OpenAI 1536d quando há key, senão Gemini 768d).
// ---------------------------------------------------------------------------

async function embeddingOpenAI(text: string): Promise<EmbeddingOut> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY as string })
  const res = await openai.embeddings.create({ model: "text-embedding-3-small", input: text })
  const vector = res.data[0]?.embedding ?? []
  return { vector, dim: vector.length, model: "text-embedding-3-small" }
}

async function embeddingGemini(text: string): Promise<EmbeddingOut> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!key) throw new Error("GEMINI_API_KEY não configurada")
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: { parts: [{ text }] } }),
  })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error(j?.error?.message || "Gemini embeddings falhou")
  const vector: number[] = j?.embedding?.values ?? []
  if (!vector.length) throw new Error("Embedding vazio")
  return { vector, dim: vector.length, model: "text-embedding-004" }
}

export async function generateEmbedding(text: string): Promise<EmbeddingOut> {
  const t = String(text || "").slice(0, 8000)
  if (!t.trim()) throw new Error("Texto vazio")
  if (process.env.OPENAI_API_KEY) return embeddingOpenAI(t)
  return embeddingGemini(t)
}

// ---------------------------------------------------------------------------
// Busca semântica: embedding da pergunta → cosseno em JS sobre os chunks da KB
// (KBs reais são pequenas; evita RPC/SQL custom e funciona em qualquer dim).
// ---------------------------------------------------------------------------

export async function searchKBSemantic(kb_id: string, query: string, limit = 3): Promise<ChunkHit[]> {
  if (!kb_id || !query.trim()) return []
  const q = await generateEmbedding(query).catch(() => null)
  if (!q || !q.vector.length) return []

  const { data: docs } = await db().from("documents").select("id").eq("knowledge_base_id", kb_id).limit(200)
  const docIds = (docs ?? []).map((d: { id: string }) => d.id)
  if (!docIds.length) return []

  const { data: rows } = await db()
    .from("document_embeddings")
    .select("document_id,chunk_text,embedding")
    .in("document_id", docIds)
    .limit(500)
  const scored: ChunkHit[] = []
  for (const r of (rows ?? []) as { document_id: string; chunk_text: string; embedding: unknown }[]) {
    const vec = Array.isArray(r.embedding)
      ? (r.embedding as number[])
      : typeof r.embedding === "string"
        ? (JSON.parse(r.embedding) as number[])
        : []
    if (vec.length !== q.dim) continue
    const sim = cosineSimilarity(q.vector, vec)
    if (sim >= 0.5) scored.push({ chunk_text: r.chunk_text, similarity: sim, document_id: r.document_id })
  }
  scored.sort((a, b) => b.similarity - a.similarity)
  return scored.slice(0, Math.max(1, limit))
}

// Indexa (ou reindexa) um documento: chunk + embedding + contagem.
export async function indexDocument(documentId: string, text: string): Promise<{ chunks: number; dim: number; model: string }> {
  const chunks = chunkText(text).slice(0, 40)
  await db().from("document_embeddings").delete().eq("document_id", documentId)
  let dim = 0
  let model = ""
  let n = 0
  for (let i = 0; i < chunks.length; i++) {
    const emb = await generateEmbedding(chunks[i]).catch(() => null)
    if (!emb || !emb.vector.length) continue
    dim = emb.dim
    model = emb.model
    const { error } = await db().from("document_embeddings").insert({
      id: `emb_${Date.now()}_${i}`,
      document_id: documentId,
      embedding: emb.vector,
      chunk_text: chunks[i],
      chunk_order: i,
    })
    if (!error) n++
  }
  try {
    await db().from("documents").update({ chunks_count: n }).eq("id", documentId)
  } catch {
    /* coluna pode não existir em bancos antigos */
  }
  return { chunks: n, dim, model }
}
