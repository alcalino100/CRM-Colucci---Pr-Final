import { NextResponse } from "next/server"
import { evolutionConfig, wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function fetchWithTimeout(url: string, init: RequestInit, ms = 10000) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ac.signal })
  } finally {
    clearTimeout(timer)
  }
}

// Faz logout da sessão na Evolution (mantém a instância para reconexão rápida)
// e marca a instância como desconectada no banco (fail-safe mesmo se a Evolution cair).
export async function POST(request: Request) {
  let body: { instanceName?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 })
  }
  const instanceName = body.instanceName
  if (!instanceName) return NextResponse.json({ error: "Instância não informada." }, { status: 400 })

  let evolutionErro: string | null = null
  const cfg = evolutionConfig()
  if (cfg.ok) {
    try {
      await fetchWithTimeout(`${cfg.url}/instance/logout/${encodeURIComponent(instanceName)}`, {
        method: "DELETE",
        headers: { apikey: cfg.key },
      })
      // Ignoramos o status: se já estava desconectada, o objetivo do usuário está cumprido.
    } catch (err) {
      const cause = (err as any)?.cause?.code || (err as any)?.name || ""
      console.log("[v0] whatsapp disconnect error:", err instanceof Error ? err.message : String(err), cause)
      evolutionErro = "Não foi possível confirmar a desconexão com o servidor, mas o WhatsApp foi marcado como desconectado no sistema."
    }
  }

  // Fail-safe: atualiza o banco para refletir a intenção do usuário de qualquer forma.
  await wsupabase
    .from("whatsapp_instancias")
    .update({ status: "desconectado", numero: null, qr_code: null, atualizado_em: new Date().toISOString() })
    .eq("instance_name", instanceName)

  if (evolutionErro) return NextResponse.json({ ok: true, status: "desconectado", aviso: evolutionErro }, { status: 200 })
  return NextResponse.json({ ok: true, status: "desconectado" })
}
