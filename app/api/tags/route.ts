import { NextResponse } from "next/server"
import { getTagsCatalog, saveTagsCatalog, tagColor, type TagDef } from "@/lib/ai/tags-catalog"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/tags — catálogo central de tags (configurado + em uso nos leads).
export async function GET() {
  try {
    const catalog = await getTagsCatalog()
    return NextResponse.json({ ok: true, ...catalog })
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 })
  }
}

// POST /api/tags — cria uma tag no catálogo. Body: { name, color? }
// Bulk (usado pelo painel para salvar a lista inteira): { _bulk: true, _tags: [{name,color,responderIA,followUp}] }
export async function POST(request: Request) {
  try {
    const body = await request.json()

    if (body._bulk && Array.isArray(body._tags)) {
      const next: TagDef[] = body._tags.map((t: any) => ({
        name: String(t.name ?? "").trim().toLowerCase(),
        color: t.color || tagColor(String(t.name ?? "")),
        responderIA: Boolean(t.responderIA),
        followUp: Boolean(t.followUp),
      })).filter((t: TagDef) => t.name.length >= 2)
      const saved = await saveTagsCatalog(next)
      if (!saved.ok) return NextResponse.json({ ok: false, erro: saved.error }, { status: 500 })
      return NextResponse.json({ ok: true, tags: next })
    }

    const name = String(body.name ?? "").trim().toLowerCase()
    if (name.length < 2) return NextResponse.json({ ok: false, erro: "A tag precisa ter pelo menos 2 caracteres." }, { status: 400 })

    const catalog = await getTagsCatalog(false)
    if (catalog.tags.some((t) => t.name === name)) {
      return NextResponse.json({ ok: false, erro: `A tag "${name}" já existe.` }, { status: 409 })
    }

    const next: TagDef[] = [...catalog.tags, { name, color: body.color || tagColor(name) }]
    const saved = await saveTagsCatalog(next)
    if (!saved.ok) return NextResponse.json({ ok: false, erro: saved.error }, { status: 500 })
    return NextResponse.json({ ok: true, tag: { name, color: body.color || tagColor(name) } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 })
  }
}