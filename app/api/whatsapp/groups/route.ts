// Descoberta e configuração do grupo de notificações de venda.
// - GET  ?instanceName=...        -> lista os grupos da instância (para achar o JID).
// - POST { instanceName, groupJid } -> salva o grupo na instância (coluna notif_grupo).
// Ambos protegidos por CRON_SECRET (mesma convenção do backfill).
import { NextResponse } from "next/server"
import { evolutionConfig, wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function autorizado(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get("authorization")
  const qs = new URL(req.url).searchParams.get("secret")
  return auth === `Bearer ${secret}` || qs === secret
}

async function fetchGroups(cfg: { url: string; key: string }, instanceName: string): Promise<{ grupos: any[]; detalhes: any[] }> {
  const rotas = [
    `${cfg.url}/group/fetchInstances/${encodeURIComponent(instanceName)}`,
    `${cfg.url}/group/fetchAllInstances/${encodeURIComponent(instanceName)}`,
    `${cfg.url}/chat/findInstances/${encodeURIComponent(instanceName)}?isGroup=true`,
  ]
  const detalhes: any[] = []
  for (const rota of rotas) {
    const rot = rota.replace(cfg.url, "").replace(instanceName, "{instance}")
    try {
      const res = await fetch(rota, { headers: { apikey: cfg.key } })
      const txt = (await res.text().catch(() => "")).slice(0, 400)
      detalhes.push({ rota: rot, status: res.status, corpo: txt })
      let parsed: any = null
      try {
        parsed = JSON.parse(txt)
      } catch {
        parsed = null
      }
      if (parsed == null) continue
      const arr = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.groups)
          ? parsed.groups
          : Array.isArray(parsed?.data)
            ? parsed.data
            : null
      if (Array.isArray(arr)) {
        const grupos = arr
          .map((g: any) => ({
            id: g?.id ?? g?.jid ?? g?.remoteJid ?? null,
            subject: g?.subject ?? g?.name ?? g?.title ?? "—",
          }))
          .filter((g: any) => g.id)
        if (grupos.length) return { grupos, detalhes }
      }
    } catch {
      detalhes.push({ rota: rot, erro: "fetch falhou" })
    }
  }
  return { grupos: [], detalhes }
}

export async function GET(request: Request) {
  if (!autorizado(request)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 })
  const cfg = evolutionConfig()
  if (!cfg.ok) return NextResponse.json({ erro: "Integração WhatsApp não configurada." }, { status: 500 })
  const instanceName = new URL(request.url).searchParams.get("instanceName")
  if (!instanceName) return NextResponse.json({ erro: "instanceName é obrigatório" }, { status: 400 })
  try {
    const { grupos, detalhes } = await fetchGroups(cfg, instanceName)
    return NextResponse.json({ ok: true, total: grupos.length, grupos, detalhes })
  } catch (err) {
    return NextResponse.json({ ok: false, erro: (err as Error).message }, { status: 502 })
  }
}

export async function POST(request: Request) {
  if (!autorizado(request)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 })
  let body: { instanceName?: string; groupJid?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ erro: "JSON inválido" }, { status: 400 })
  }
  if (!body.instanceName || !body.groupJid)
    return NextResponse.json({ erro: "instanceName e groupJid são obrigatórios" }, { status: 400 })

  const { error } = await wsupabase
    .from("whatsapp_instancias")
    .update({ notif_grupo: body.groupJid, atualizado_em: new Date().toISOString() })
    .eq("instance_name", body.instanceName)
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
