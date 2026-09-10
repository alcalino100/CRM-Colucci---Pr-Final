import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"
import { GoalSchema, zodMessage } from "@/lib/ai/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function db() {
  return createClient(SUPABASE_URL, SUPABASE_KEY)
}

function mapRow(g: Record<string, unknown>) {
  const cfg = (g.config ?? {}) as Record<string, unknown>
  return {
    id: g.id,
    ai_id: g.ai_id,
    name: g.name,
    type: g.type,
    description: g.description ?? "",
    questions: Array.isArray(g.questions) ? g.questions : [],
    success_criteria: (cfg.success_criteria as Record<string, unknown> | undefined) ?? undefined,
    next_step: (cfg.next_step as string | undefined) ?? undefined,
    fallback: (cfg.fallback as string | undefined) ?? undefined,
    prompt: g.prompt,
    created_at: g.created_at,
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { data, error } = await db().from("goals").select("*").eq("ai_id", id).order("created_at", { ascending: true })
    if (error) throw error
    return NextResponse.json({ ok: true, goals: (data ?? []).map(mapRow) })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => null)
    const parsed = GoalSchema.safeParse(body ?? {})
    if (!parsed.success) return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 })
    const v = parsed.data
    const row = {
      id: `goal_${Date.now()}`,
      ai_id: id,
      name: v.name.trim(),
      type: v.type,
      description: v.description ?? "",
      prompt: v.prompt,
      questions: v.questions ?? [],
      is_active: true,
      config: { success_criteria: v.success_criteria ?? null, next_step: v.next_step ?? null, fallback: v.fallback ?? null },
    }
    const { data, error } = await db().from("goals").insert(row).select("*").single()
    if (error) throw error
    return NextResponse.json({ ok: true, goal: mapRow(data as Record<string, unknown>) })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// Substituição completa dos goals do agente (bulk). Valida cada item.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => null)
    if (!body || !Array.isArray(body.goals)) {
      return NextResponse.json({ error: "use goals array" }, { status: 400 })
    }
    const items = body.goals as unknown[]
    const rows = []
    for (let i = 0; i < items.length; i++) {
      const parsed = GoalSchema.safeParse(items[i] ?? {})
      if (!parsed.success) {
        return NextResponse.json({ error: `goal[${i}]: ${zodMessage(parsed.error)}` }, { status: 400 })
      }
      const v = parsed.data
      const raw = items[i] as Record<string, unknown>
      rows.push({
        id: typeof raw.id === "string" && raw.id ? raw.id : `goal_${Date.now()}_${i}`,
        ai_id: id,
        name: v.name.trim(),
        type: v.type,
        description: v.description ?? "",
        prompt: v.prompt,
        questions: v.questions ?? [],
        is_active: true,
        config: { success_criteria: v.success_criteria ?? null, next_step: v.next_step ?? null, fallback: v.fallback ?? null },
      })
    }
    const { error: delErr } = await db().from("goals").delete().eq("ai_id", id)
    if (delErr) throw delErr
    if (rows.length > 0) {
      const { error: insErr } = await db().from("goals").insert(rows)
      if (insErr) throw insErr
    }
    try {
      await db().from("automation_logs").insert({
        event_type: "ia_config_alterada",
        event_title: "Metas da IA atualizadas",
        event_description: `Agente ${id}: ${rows.length} meta(s) gravada(s) [(tipos: ${rows.map((r) => r.type).join(",") || "—"})].`,
        actor_type: "gestor",
      })
    } catch {
      /* log é best-effort */
    }
    return NextResponse.json({ ok: true, goals: rows.map(mapRow) })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// Desativa um goal (soft delete via is_active).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const goalId = new URL(req.url).searchParams.get("goalId")
    if (!goalId) return NextResponse.json({ error: "goalId é obrigatório" }, { status: 400 })
    const { error } = await db().from("goals").delete().eq("id", goalId).eq("ai_id", id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
