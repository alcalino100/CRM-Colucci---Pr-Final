import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function db() {
  return createClient(SUPABASE_URL, SUPABASE_KEY)
}

// Apaga conversa de TESTE + mensagens (somente test_mode/channel=test —
// nunca apaga conversa real de produção por aqui).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 })
    const { data: conv } = await db().from("conversations_ia").select("id,test_mode,channel").eq("id", id).maybeSingle()
    if (!conv) return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 })
    const c = conv as { test_mode?: boolean; channel?: string }
    if (!c.test_mode && c.channel !== "test") {
      return NextResponse.json({ error: "Somente conversas de teste podem ser apagadas por aqui." }, { status: 403 })
    }
    await db().from("messages_ia").delete().eq("conversation_id", id)
    const { error } = await db().from("conversations_ia").delete().eq("id", id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
