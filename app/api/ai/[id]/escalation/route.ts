import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"
import { TriggerSchema, zodMessage } from "@/lib/ai/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function db() {
  return createClient(SUPABASE_URL, SUPABASE_KEY)
}

// Lista triggers de escalação do agente (mais recentes primeiro).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 })
    const { data, error } = await db()
      .from("escalation_triggers")
      .select("*")
      .eq("ai_id", id)
      .order("created_at", { ascending: false })
    if (error) throw error
    return NextResponse.json({ ok: true, triggers: data ?? [] })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// Cria um trigger de escalação + auditoria.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 })
    const body = await req.json().catch(() => null)
    const parsed = TriggerSchema.safeParse(body ?? {})
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 })
    }
    const v = parsed.data
    const row = {
      id: `trig_${Date.now()}`,
      ai_id: id,
      name: v.name.trim(),
      condition: v.condition,
      detection_keywords: (v.detection_keywords ?? []).map((k) => String(k).trim()).filter(Boolean),
      action: v.action,
      notification_channels: v.notification_channels ?? [],
    }
    const { data, error } = await db().from("escalation_triggers").insert(row).select("*").single()
    if (error) throw error
    try {
      await db().from("automation_logs").insert({
        event_type: "ia_trigger_criado",
        event_title: `Trigger de escalação criado (${row.name})`,
        event_description: `Agente ${id}: condição=${row.condition}, ação=${row.action}, canais=[${row.notification_channels.join(",") || "—"}].`,
        actor_type: "gestor",
      })
    } catch {
      /* log é best-effort */
    }
    return NextResponse.json({ ok: true, trigger: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
