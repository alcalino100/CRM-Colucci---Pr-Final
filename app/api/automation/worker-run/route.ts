import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL } from "@/lib/supabase/config"
import { MASTER_EMAIL } from "@/lib/master"
import { runWorker } from "@/app/api/automation/worker/route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

function db() {
  const secret = process.env.SUPABASE_SECRET_KEY ?? ""
  return createClient(SUPABASE_URL, secret, { auth: { persistSession: false } })
}

function checkMaster(email: unknown): boolean {
  return String(email ?? "").toLowerCase().trim() === MASTER_EMAIL
}

// Disparo manual do worker pelo Master (sem expor CRON_SECRET no navegador).
// Somente o e-mail proprietário. Retorna o resumo da rodada.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const b = body as { email?: unknown; action?: unknown }
    if (!checkMaster(b.email)) {
      return NextResponse.json({ ok: false, erro: "Acesso Master necessário." }, { status: 403 })
    }
    // Recolocar falhas da queda: jobs failed por queda de conexão voltam à fila.
    // (Número inexistente não volta — falharia de novo.)
    if (b.action === "requeue-falhas") {
      const { data: fails } = await db().from("automation_jobs").select("id,failure_reason").eq("status", "failed").limit(1000)
      const ids = ((fails ?? []) as { id: string; failure_reason?: string }[])
        .filter((f) => !String(f.failure_reason ?? "").includes('"exists":false'))
        .map((f) => f.id)
      let movidos = 0
      // Em lotes para não estourar URL.
      for (let i = 0; i < ids.length; i += 100) {
        const lote = ids.slice(i, i + 100)
        const { error } = await db().from("automation_jobs").update({ status: "scheduled" }).in("id", lote)
        if (!error) movidos += lote.length
      }
      try {
        await db().from("automation_logs").insert({
          event_type: "worker_falhas_recolocadas",
          event_title: `Falhas recolocadas na fila (${movidos})`,
          event_description: "Jobs failed (queda de conexão) voltaram para scheduled; saem nas próximas rodadas.",
          actor_type: "gestor",
        })
      } catch { /* best-effort */ }
      return NextResponse.json({ ok: true, recolocados: movidos })
    }
    return await runWorker()
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// Saúde/contingência: estados das instâncias + backlog. Leitura (Master no front).
export async function GET() {
  try {
    const { evolutionConfig } = await import("@/lib/whatsapp/server")
    const cfg = evolutionConfig()
    const { data: insts } = await db().from("whatsapp_instancias").select("instance_name")
    const nomes = ((insts ?? []) as { instance_name: string }[]).map((i) => i.instance_name)
    const estados: { instance: string; state: string }[] = []
    for (const n of nomes) {
      let state = "desconhecido"
      try {
        if (cfg.ok) {
          const res = await fetch(`${cfg.url}/instance/connectionState/${encodeURIComponent(n)}`, {
            headers: { apikey: cfg.key },
            signal: AbortSignal.timeout(8000),
          })
          const j = await res.json().catch(() => null)
          state = (j as { instance?: { state?: string } } | null)?.instance?.state ?? "erro"
        }
      } catch {
        state = "erro"
      }
      estados.push({ instance: n, state })
    }
    const [{ count: fila }, { count: falhou7d }, { data: last }] = await Promise.all([
      db().from("automation_jobs").select("id", { count: "exact", head: true }).in("status", ["scheduled", "retrying"]),
      db().from("automation_jobs").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
      db().from("automation_logs").select("event_description,created_at").eq("event_type", "lead_evaluated").order("created_at", { ascending: false }).limit(1),
    ])
    const ultimo = ((last ?? []) as { event_description?: string; created_at?: string }[])[0]
    return NextResponse.json({
      ok: true,
      instancias: estados,
      backlog: { na_fila: fila ?? 0, falhou_7d: falhou7d ?? 0 },
      ultima_rodada: ultimo ? { em: ultimo.created_at, resumo: String(ultimo.event_description ?? "").slice(0, 200) } : null,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
