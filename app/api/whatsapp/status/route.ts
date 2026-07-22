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

// Consulta ativa: pergunta o estado à Evolution e persiste no banco.
// Assim o status atualiza mesmo sem o webhook estar configurado.
export async function GET(request: Request) {
  const instanceName = new URL(request.url).searchParams.get("instanceName")
  if (!instanceName) return NextResponse.json({ error: "Instância não informada." }, { status: 400 })

  // Valor atual no banco (fallback caso a Evolution esteja inacessível)
  const { data: row } = await wsupabase
    .from("whatsapp_instancias")
    .select("status, numero")
    .eq("instance_name", instanceName)
    .maybeSingle()
  let status: string = row?.status ?? "desconectado"
  let numero: string | null = row?.numero ?? null

  const cfg = evolutionConfig()
  if (cfg.ok) {
    try {
      const res = await fetchWithTimeout(`${cfg.url}/instance/connectionState/${encodeURIComponent(instanceName)}`, {
        headers: { apikey: cfg.key },
      })
      if (res.ok) {
        const json = await res.json().catch(() => null)
        const state = json?.instance?.state ?? json?.state
        if (state) status = mapConnectionState(state)

        // Busca o número apenas quando conectado e ainda não conhecido
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

        // Persiste para sustentar o status entre sessões
        const patch: Record<string, unknown> = { status, atualizado_em: new Date().toISOString() }
        if (status === "conectado") {
          patch.qr_code = null
          if (numero) patch.numero = numero
        }
        await wsupabase.from("whatsapp_instancias").update(patch).eq("instance_name", instanceName)
      }
    } catch {
      /* mantém o valor do banco */
    }
  }

  return NextResponse.json({ status, numero })
}
