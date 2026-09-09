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
    // Coleta o que será desligado para a retomada restaurar SOMENTE isso
    // (um agente que já estava desligado antes continua desligado depois).
    const [{ data: autosAtivas }, { data: agentesAtivos }] = await Promise.all([
      wsupabase.from("automations").select("id").eq("status", "active").is("deleted_at", null),
      wsupabase.from("ai_agents").select("id").eq("is_active", true),
    ])
    const idsAutos = (autosAtivas ?? []).map((a: any) => a.id)
    const idsAgentes = (agentesAtivos ?? []).map((a: any) => a.id)

    // 1) Desativa todas as automações ativas
    const { error: e1 } = idsAutos.length
      ? await wsupabase.from("automations").update({ status: "paused" }).in("id", idsAutos)
      : { error: null }

    // 2) Cancela jobs pendentes (não processa nada que estava na fila)
    const { error: e2 } = await wsupabase
      .from("automation_jobs")
      .update({ status: "cancelled_manual", cancelled_at: new Date().toISOString(), cancellation_reason: "Parada de emergência (botão global)" })
      .not("status", "in", `(${TERMINAL.join(",")})`)

    // 3) Desativa a IA automática (respostas no WhatsApp)
    const { error: e3 } = idsAgentes.length
      ? await wsupabase.from("ai_agents").update({ is_active: false }).in("id", idsAgentes)
      : { error: null }

    const erro = [e1?.message, e2?.message, e3?.message].filter(Boolean).join(" | ")
    if (erro) return NextResponse.json({ ok: false, erro }, { status: 500 })

    try {
      await wsupabase.from("automation_logs").insert({
        event_type: "global_pause",
        event_title: "Stop automático — TUDO pausado",
        event_description: `Parada de emergência: ${idsAutos.length} automação(ões) desativada(s), jobs pendentes cancelados e ${idsAgentes.length} IA(s) desligada(s).`,
        actor_type: "gestor",
        payload: { agentes_pausados: idsAgentes, automacoes_pausadas: idsAutos },
      })
    } catch { /* log é best-effort */ }

    return NextResponse.json({ ok: true, pausado: true })
  }

  // RESUME: reativa SOMENTE o que a última pausa desligou (não ressuscita agentes
  // que já estavam desligados antes — ex.: Patrícia em teste do Guilherme).
  let idsAgentes: string[] = []
  let idsAutos: string[] = []
  try {
    const { data: ultimo } = await wsupabase
      .from("automation_logs")
      .select("payload")
      .eq("event_type", "global_pause")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    const p: any = (ultimo as any)?.payload
    const obj = typeof p === "string" ? JSON.parse(p) : (p ?? {})
    if (Array.isArray(obj.agentes_pausados)) idsAgentes = obj.agentes_pausados.filter(Boolean)
    if (Array.isArray(obj.automacoes_pausadas)) idsAutos = obj.automacoes_pausadas.filter(Boolean)
  } catch { /* sem memória: cai no fallback abaixo */ }
  const semMemoria = idsAgentes.length === 0 && idsAutos.length === 0

  const { error: e1 } = semMemoria
    ? await wsupabase.from("automations").update({ status: "active" }).eq("status", "paused").is("deleted_at", null)
    : idsAutos.length
      ? await wsupabase.from("automations").update({ status: "active" }).in("id", idsAutos)
      : { error: null }

  const { error: e3 } = semMemoria
    ? await wsupabase.from("ai_agents").update({ is_active: true }).eq("is_active", false)
    : idsAgentes.length
      ? await wsupabase.from("ai_agents").update({ is_active: true }).in("id", idsAgentes)
      : { error: null }

  const erro = [e1?.message, e3?.message].filter(Boolean).join(" | ")
  if (erro) return NextResponse.json({ ok: false, erro }, { status: 500 })

  try {
    await wsupabase.from("automation_logs").insert({
      event_type: "global_resume",
      event_title: "Automações retomadas",
      event_description: semMemoria
        ? "Automações reativadas e IA ligada novamente (sem memória da pausa anterior). Jobs pendentes cancelados NÃO são recriados automaticamente."
        : `Retomada seletiva: ${idsAutos.length} automação(ões) e ${idsAgentes.length} IA(s) religadas (somente o que a pausa desligou). Jobs cancelados NÃO são recriados.`,
      actor_type: "gestor",
      payload: { agentes_reativados: idsAgentes, automacoes_reativadas: idsAutos, seletivo: !semMemoria },
    })
  } catch { /* log é best-effort */ }

  return NextResponse.json({ ok: true, pausado: false })
}