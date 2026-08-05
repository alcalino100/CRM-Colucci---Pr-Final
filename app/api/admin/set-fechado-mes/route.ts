// Ajuste em massa: define fechado_em de todos os leads FECHADOS para o mês passado,
// exceto os que batem com os nomes em `excluir` (ex.: Junior - Moradas).
// GET  ?preview=1  -> lista o que seria alterado, sem escrever.
// POST             -> aplica (body: { mes?: "YYYY-MM", dia?: number, excluir?: string }).
// Protegido por CRON_SECRET.
import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function mesPassado(): { y: number; m: number } {
  const agora = new Date()
  let m = agora.getUTCMonth() - 1
  let y = agora.getUTCFullYear()
  if (m < 0) { m = 11; y -= 1 }
  return { y, m: m + 1 }
}

export async function GET(req: Request) {
  return handle(req, true)
}

export async function POST(req: Request) {
  let body: any = {}
  try { body = await req.json() } catch {}
  return handle(req, false, body)
}

async function handle(req: Request, preview: boolean, body: any = {}) {
  const secret = process.env.CRON_SECRET
  const url = new URL(req.url)
  const auth = req.headers.get("authorization")
  const qs = url.searchParams.get("secret")
  const autorizado = !!secret && (auth === `Bearer ${secret}` || qs === secret)
  if (!autorizado) return NextResponse.json({ erro: "não autorizado" }, { status: 401 })

  const mp = mesPassado()
  const mes = body.mes ?? url.searchParams.get("mes") ?? `${mp.y}-${String(mp.m).padStart(2, "0")}`
  const dia = Number(body.dia ?? url.searchParams.get("dia") ?? 15)
  const excluir = String(body.excluir ?? url.searchParams.get("excluir") ?? "moradas")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
  const idsLimite = String(body.ids ?? url.searchParams.get("ids") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean)

  if (!/^\d{4}-\d{2}$/.test(mes)) return NextResponse.json({ erro: "mes inválido (use YYYY-MM)" }, { status: 400 })
  const alvo = `${mes}-${String(dia).padStart(2, "0")}T12:00:00Z`

  try {
    const { data, error } = await wsupabase
      .from("leads")
      .select("id, nome, status, fechado_em")
      .eq("status", "fechado")

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })

    const alvoLista = (data ?? []).filter((l) => {
      if (idsLimite.length && !idsLimite.includes(l.id)) return false
      const n = String(l.nome ?? "").toLowerCase()
      return !excluir.some((e) => n.includes(e))
    })

    if (preview) {
      return NextResponse.json({ ok: true, preview: true, mes, alvo, excluir, total: data?.length ?? 0, seriamAlterados: alvoLista.length, leads: alvoLista.map((l) => ({ id: l.id, nome: l.nome, fechado_em: l.fechado_em })) })
    }

    const ids = alvoLista.map((l) => l.id)
    if (ids.length) {
      const { error: upErr } = await wsupabase.from("leads").update({ fechado_em: alvo }).in("id", ids)
      if (upErr) return NextResponse.json({ ok: false, erro: upErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, mes, alvo, excluir, atualizados: ids.length, nomes: alvoLista.map((l) => l.nome) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 })
  }
}
