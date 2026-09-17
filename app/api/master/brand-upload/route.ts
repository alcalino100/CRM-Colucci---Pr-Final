import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL } from "@/lib/supabase/config"
import { MASTER_EMAIL } from "@/lib/master"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const KINDS = { logo: "logo", favicon: "favicon" } as const
const MIME_OK = new Set(["image/png", "image/jpeg", "image/webp", "image/x-icon", "image/vnd.microsoft.icon", "image/svg+xml"])
const MAX_BYTES = 2 * 1024 * 1024

function extOf(mime: string, filename: string): string {
  if (mime === "image/png") return "png"
  if (mime === "image/jpeg") return "jpg"
  if (mime === "image/webp") return "webp"
  if (mime === "image/x-icon" || mime === "image/vnd.microsoft.icon") return "ico"
  if (mime === "image/svg+xml") return "svg"
  const parts = filename.split(".")
  return (parts.length > 1 ? parts.pop() : "png")!.slice(0, 5).toLowerCase()
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const { email, kind, filename, mime, dataBase64 } = body as {
      email?: string; kind?: keyof typeof KINDS; filename?: string; mime?: string; dataBase64?: string
    }
    // Somente o proprietário (mesma trava do menu Master).
    if ((email || "").toLowerCase().trim() !== MASTER_EMAIL) {
      return NextResponse.json({ ok: false, erro: "Acesso Master necessário." }, { status: 403 })
    }
    if (!kind || !(kind in KINDS)) return NextResponse.json({ ok: false, erro: "Tipo inválido (logo|favicon)." }, { status: 400 })
    if (!mime || !MIME_OK.has(mime)) return NextResponse.json({ ok: false, erro: "Formato inválido (png/jpg/webp/ico/svg)." }, { status: 400 })
    if (!dataBase64) return NextResponse.json({ ok: false, erro: "Arquivo vazio." }, { status: 400 })
    const buf = Buffer.from(dataBase64, "base64")
    if (!buf.length || buf.length > MAX_BYTES) return NextResponse.json({ ok: false, erro: "Arquivo vazio ou maior que 2MB." }, { status: 400 })

    const secret = process.env.SUPABASE_SECRET_KEY
    if (!secret) return NextResponse.json({ ok: false, erro: "Storage indisponível." }, { status: 500 })
    const admin = createClient(SUPABASE_URL, secret, { auth: { persistSession: false } })
    const path = `${kind}.${extOf(mime, filename || "file.png")}`
    const { error } = await admin.storage.from("brand").upload(path, buf, { contentType: mime, upsert: true })
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
    const { data } = admin.storage.from("brand").getPublicUrl(path)
    return NextResponse.json({ ok: true, url: `${data.publicUrl}?v=${Date.now()}` })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
