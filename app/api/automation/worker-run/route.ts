import { NextResponse } from "next/server"
import { MASTER_EMAIL } from "@/lib/master"
import { runWorker } from "@/app/api/automation/worker/route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

// Disparo manual do worker pelo Master (sem expor CRON_SECRET no navegador).
// Somente o e-mail proprietário. Retorna o resumo da rodada.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = String((body as { email?: unknown }).email ?? "").toLowerCase().trim()
    if (email !== MASTER_EMAIL) {
      return NextResponse.json({ ok: false, erro: "Acesso Master necessário." }, { status: 403 })
    }
    return await runWorker()
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
