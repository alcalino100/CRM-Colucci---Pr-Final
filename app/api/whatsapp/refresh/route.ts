import { NextResponse } from "next/server"
import { evolutionConfig, mapConnectionState, onlyDigits, wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function fetchWithTimeout(url: string, init: RequestInit, ms = 8000) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ac.signal })
  } finally {
    clearTimeout(timer)
  }
}

// Atualização manual: consulta o estado real na Evolution (fonte de verdade nesta chamada)
// e sincroniza o banco. Em caso de falha, devolve o último dado salvo com stale=true.
export async function GET(request: Request) {
  const instanceName = new URL(request.url).searchParams.get("instanceName")
  if (!instanceName) return NextResponse.json({ error: "Instância não informada." }, { status: 400 })

  const { data: row } = await wsupabase
    .from("whatsapp_instancias")
    .select("status, numero")
    .eq("instance_name", instanceName)
    .maybeSingle()
  const fallbackStatus: string = row?.status ?? "desconectado"
  const fallbackNumero: string | null = row?.numero ?? null

  const cfg = evolutionConfig()
  if (!cfg.ok) {
    return NextResponse.json({ status: fallbackStatus, numero: fallbackNumero, stale: true })
  }

  try {
    const res = await fetchWithTimeout(`${cfg.url}/instance/connectionState/${encodeURIComponent(instanceName)}`, {
      headers: { apikey: cfg.key },
    })
    if (!res.ok) {
      return NextResponse.json({ status: fallbackStatus, numero: fallbackNumero, stale: true })
    }
    const json = await res.json().catch(() => null)
    const state = json?.instance?.state ?? json?.state
    const status = state ? mapConnectionState(state) : fallbackStatus
    let numero: string | null = status === "conectado" ? fallbackNumero : null

    if (status === "conectado" && !numero) {
      try {
        const fi = await fetchWithTimeout(
          `${cfg.url}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,
          { headers: { apikey: cfg.key } },
        )
        const arr = await fi.json().catch(() => null)
        const inst = Array.isArray(arr) ? arr[0] : arr
        const owner = inst?.instance?.owner ?? inst?.owner ?? inst?.instance?.ownerJid ?? inst?.ownerJid
        if (owner) numero = onlyDigits(String(owner).split("@")[0])
      } catch {
        /* número é opcional */
      }
    }

    // Sincroniza o banco (a Evolution é a fonte de verdade nesta chamada)
    const patch: Record<string, unknown> = { status, numero, atualizado_em: new Date().toISOString() }
    if (status !== "conectado") patch.qr_code = null
    await wsupabase.from("whatsapp_instancias").update(patch).eq("instance_name", instanceName)

    return NextResponse.json({ status, numero })
  } catch (err) {
    const cause = (err as any)?.cause?.code || (err as any)?.name || ""
    console.log("[v0] whatsapp refresh error:", err instanceof Error ? err.message : String(err), cause)
    return NextResponse.json({ status: fallbackStatus, numero: fallbackNumero, stale: true })
  }
}
