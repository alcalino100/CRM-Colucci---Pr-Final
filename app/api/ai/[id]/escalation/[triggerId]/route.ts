import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function db() {
  return createClient(SUPABASE_URL, SUPABASE_KEY)
}

// Deleta um trigger de escalação (escopado ao agente) + auditoria.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; triggerId: string }> },
) {
  try {
    const { id, triggerId } = await params
    if (!id || !triggerId) {
      return NextResponse.json({ error: "id e triggerId são obrigatórios" }, { status: 400 })
    }
    const { data: existing } = await db()
      .from("escalation_triggers")
      .select("id,name")
      .eq("id", triggerId)
      .eq("ai_id", id)
      .maybeSingle()
    if (!existing) return NextResponse.json({ error: "Trigger não encontrado." }, { status: 404 })
    const { error } = await db().from("escalation_triggers").delete().eq("id", triggerId).eq("ai_id", id)
    if (error) throw error
    try {
      await db().from("automation_logs").insert({
        event_type: "ia_trigger_deletado",
        event_title: `Trigger de escalação excluído (${(existing as { name?: string }).name ?? triggerId})`,
        event_description: `Agente ${id}: trigger ${triggerId} removido.`,
        actor_type: "gestor",
      })
    } catch {
      /* log é best-effort */
    }
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
