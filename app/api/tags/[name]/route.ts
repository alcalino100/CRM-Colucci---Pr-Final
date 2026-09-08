import { NextResponse } from "next/server"
import { getTagsCatalog, saveTagsCatalog, tagColor, type TagDef } from "@/lib/ai/tags-catalog"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// PATCH /api/tags/:name — edita cor/comportamento/renomeia uma tag.
// Body: { color?, responderIA?, followUp?, novoNome? }
export async function PATCH(request: Request, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params
    const alvo = decodeURIComponent(name).trim().toLowerCase()
    const body = await request.json()

    const catalog = await getTagsCatalog(false)
    const alvoDef = catalog.tags.find((t) => t.name === alvo)
    if (!alvoDef) return NextResponse.json({ ok: false, erro: `Tag "${alvo}" não encontrada no catálogo.` }, { status: 404 })

    const proximoNome = body.novoNome ? String(body.novoNome).trim().toLowerCase() : alvo
    if (proximoNome.length < 2) return NextResponse.json({ ok: false, erro: "A tag precisa ter pelo menos 2 caracteres." }, { status: 400 })

    const idx = catalog.tags.findIndex((t) => t.name === alvo)
    const atualizada: TagDef = {
      name: proximoNome,
      color: body.color ?? alvoDef.color ?? tagColor(alvo),
      responderIA: body.responderIA !== undefined ? Boolean(body.responderIA) : alvoDef.responderIA,
      followUp: body.followUp !== undefined ? Boolean(body.followUp) : alvoDef.followUp,
    }

    const next = catalog.tags.map((t, i) => (i === idx ? atualizada : t))
    const saved = await saveTagsCatalog(next)
    if (!saved.ok) return NextResponse.json({ ok: false, erro: saved.error }, { status: 500 })
    return NextResponse.json({ ok: true, tag: atualizada })
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 })
  }
}

// DELETE /api/tags/:name — remove a tag do catálogo.
export async function DELETE(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params
    const alvo = decodeURIComponent(name).trim().toLowerCase()

    const catalog = await getTagsCatalog(false)
    const alvoDef = catalog.tags.find((t) => t.name === alvo)
    if (!alvoDef) return NextResponse.json({ ok: false, erro: `Tag "${alvo}" não encontrada no catálogo.` }, { status: 404 })

    const next = catalog.tags.filter((t) => t.name !== alvo)
    const saved = await saveTagsCatalog(next)
    if (!saved.ok) return NextResponse.json({ ok: false, erro: saved.error }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 })
  }
}