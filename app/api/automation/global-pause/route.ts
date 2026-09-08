import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Kill-switch global: pausa TUDO de uma vez (automações ativas, jobs pendentes e IA).
// Botão vermelho de fácil acesso no sidebar e no dashboard de automações.
// RESUME volta tudo para active (automações + IA), sem recriar jobs já cancelados.

const TERMINAL = ["sent", "delivered", "read", "responded", "cancelled_human", "cancelled_condition", "cancelled_manual", "blocked_limit", "failed", "cancelled"]

export async function GET() {
  const [autos, jobs, ais] = await Promise.all([
    wsupabase.from("automations").select("id, status").is("deleted_at", null),
    wsupabase.from("automation_jobs").select("id, status").in("status", ["scheduled", "pending_validation", "retrying", "processing", "blocked_hour"]),
    wsupabase.from("ai_agents").select("id, is_active"),
  ])

  const autoRows = autos.data ?? []
  const activeAutos = autoRows.filter((a) => a.status === "active").length
  const pausedAutos = autoRows.filter((a) => a.status === "paused").length
  const pendingJobs = (jobs.data ?? []).length
  const aiRows = (ais.data ?? [])
  const activeAi = aiRows.filter((a) => a.is_active !== false).length

  // Pausado = nenhuma automação ativa e nenhuma IA ativa e nenhum job pendente
  const pausado = activeAutos === 0 && activeAi === 0 && pendingJobs === 0

  return NextResponse.json({
    ok: true,
    pausado,
    active_automations: activeAutos,
    paused_automations: pausedAutos,
    pending_jobs: pendingJobs,
    active_ai_agents: activeAi,
    total_automations: autoRows.length,
    total_ai_agents: aiRows.length,
    timestamp: new Date().toISOString(),
  })
}

export async function POST(request: Request) {
  let body: { pausado?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, erro: "Dados inválidos." }, { status: 400 })
  }
  const pausar = !!body.pausado

  if (pausar) {
    // 1) Desativa todas as automações ativas
    const { error: e1 } = await wsupabase
      .from("automations")
      .update({ status: "paused" })
      .eq("status", "active")
      .is("deleted_at", null)

    // 2) Cancela jobs pendentes (não processa nada que estava na fila)
    const { error: e2 } = await wsupabase
      .from("automation_jobs")
      .update({ status: "cancelled_manual", cancelled_at: new Date().toISOString(), cancellation_reason: "Parada de emergência (botão global)" })
      .not("status", "in", `(${TERMINAL.join(",")})`)

    // 3) Desativa a IA automática (respostas no WhatsApp)
    const { error: e3 } = await wsupabase
      .from("ai_agents")
      .update({ is_active: false })
      .eq("is_active", true)

    const erro = [e1?.message, e2?.message, e3?.message].filter(Boolean).join(" | ")
    if (erro) return NextResponse.json({ ok: false, erro }, { status: 500 })

    try {
      await wsupabase.from("automation_logs").insert({
        event_type: "global_pause",
        event_title: "Stop automático — TUDO pausado",
        event_description: "Parada de emergência: automações desativadas, jobs pendentes cancelados e IA desligada.",
        actor_type: "gestor",
      })
    } catch { /* log é best-effort */ }

    return NextResponse.json({ ok: true, pausado: true })
  }

  // RESUME: volta automações e IA para active
  const { error: e1 } = await wsupabase
    .from("automations")
    .update({ status: "active" })
    .eq("status", "paused")
    .is("deleted_at", null)

  const { error: e3 } = await wsupabase
    .from("ai_agents")
    .update({ is_active: true })
    .eq("is_active", false)

  const erro = [e1?.message, e3?.message].filter(Boolean).join(" | ")
  if (erro) return NextResponse.json({ ok: false, erro }, { status: 500 })

  try {
    await wsupabase.from("automation_logs").insert({
      event_type: "global_resume",
      event_title: "Automações retomadas",
      event_description: "Automações reativadas e IA ligada novamente. Jobs pendentes cancelados NÃO são recriados automaticamente.",
      actor_type: "gestor",
    })
  } catch { /* log é best-effort */ }

  return NextResponse.json({ ok: true, pausado: false })
}