import { NextResponse } from "next/server"
import { sendWhatsAppText, wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Sugestao = { id: string; created_at: string; telefone: string; instance: string | null; sugestao: string }

// Lista sugestões pendentes da IA para um telefone (modo sugestão).
export async function GET(request: Request) {
  const telefone = new URL(request.url).searchParams.get("telefone")?.replace(/\D/g, "") ?? ""
  if (!telefone) return NextResponse.json({ ok: false, erro: "telefone é obrigatório." }, { status: 400 })
  try {
    const desde = new Date(Date.now() - 48 * 3600000).toISOString()
    const { data, error } = await wsupabase
      .from("automation_logs")
      .select("id,created_at,event_description,payload")
      .eq("event_type", "ia_sugestao_resposta")
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(20)
    if (error) throw error
    const out: Sugestao[] = []
    for (const r of (data ?? []) as { id: string; created_at: string; event_description: string; payload: unknown }[]) {
      let p: { telefone?: string; instance?: string; sugestao?: string } = {}
      try {
        p = typeof r.payload === "string" ? JSON.parse(r.payload) : ((r.payload ?? {}) as typeof p)
      } catch {
        continue
      }
      const tel = String(p.telefone ?? "").replace(/\D/g, "")
      if (tel !== telefone || !p.sugestao) continue
      out.push({ id: r.id, created_at: r.created_at, telefone: tel, instance: p.instance ?? null, sugestao: p.sugestao })
      if (out.length >= 5) break
    }
    return NextResponse.json({ ok: true, sugestoes: out })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// Enviar (dispara no WhatsApp) ou descartar uma sugestão — tudo auditado.
export async function POST(request: Request) {
  let body: { action?: string; telefone?: string; instanceName?: string; texto?: string; leadId?: string | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, erro: "Dados inválidos." }, { status: 400 })
  }
  const action = body.action
  const telefone = String(body.telefone ?? "").replace(/\D/g, "")
  const texto = String(body.texto ?? "").trim()
  if (!telefone || !texto) return NextResponse.json({ ok: false, erro: "telefone e texto são obrigatórios." }, { status: 400 })

  if (action === "descartar") {
    try {
      await wsupabase.from("automation_logs").insert({
        lead_id: body.leadId ?? null,
        event_type: "ia_sugestao_descartada",
        event_title: "Sugestão da IA descartada",
        event_description: `Gestor descartou sugestão para ${telefone}: "${texto.slice(0, 80)}"`,
        actor_type: "gestor",
      })
    } catch {
      /* log é best-effort */
    }
    return NextResponse.json({ ok: true, descartada: true })
  }

  if (action !== "enviar") return NextResponse.json({ ok: false, erro: "action deve ser enviar|descartar." }, { status: 400 })
  const instanceName = String(body.instanceName ?? "").trim()
  if (!instanceName) return NextResponse.json({ ok: false, erro: "instanceName é obrigatória para enviar." }, { status: 400 })
  const env = await sendWhatsAppText(instanceName, telefone, texto)
  try {
    await wsupabase.from("automation_logs").insert({
      lead_id: body.leadId ?? null,
      event_type: env.ok ? "ia_sugestao_enviada" : "ia_envio_falhou",
      event_title: env.ok ? "Sugestão da IA aprovada e enviada" : "Falha ao enviar sugestão aprovada",
      event_description: env.ok
        ? `Gestor aprovou e enviou via ${instanceName} para ${telefone}.`
        : `Falha ao enviar sugestão aprovada para ${telefone}: ${env.erro}`,
      actor_type: "gestor",
    })
  } catch {
    /* log é best-effort */
  }
  if (!env.ok) return NextResponse.json({ ok: false, erro: env.erro }, { status: 502 })
  return NextResponse.json({ ok: true, keyId: env.keyId ?? null })
}
