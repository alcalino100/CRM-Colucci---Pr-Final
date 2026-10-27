import { NextResponse } from "next/server"
import { evolutionConfig, mapConnectionState, notifyDisconnection, onlyDigits, wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function fetchWithTimeout(url: string, init: RequestInit, ms = 6000) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ac.signal })
  } finally {
    clearTimeout(timer)
  }
}

// Sincroniza o estado de conexão de todas as instâncias ativas consultando a Evolution API
export async function POST() {
  const { data: instancias, error } = await wsupabase
    .from("whatsapp_instancias")
    .select("id, corretor_id, instance_name, status, numero")

  if (error || !instancias) {
    return NextResponse.json({ error: "Não foi possível carregar as instâncias." }, { status: 500 })
  }

  const cfg = evolutionConfig()
  if (!cfg.ok) {
    return NextResponse.json({
      error: "Evolution API não configurada no servidor.",
      instancias,
    }, { status: 503 })
  }

  const results = await Promise.allSettled(
    instancias.map(async (inst) => {
      const name = inst.instance_name
      try {
        const res = await fetchWithTimeout(`${cfg.url}/instance/connectionState/${encodeURIComponent(name)}`, {
          headers: { apikey: cfg.key },
        })
        if (!res.ok) {
          return { name, status: inst.status, unchanged: true }
        }
        const json = await res.json().catch(() => null)
        const state = json?.instance?.state ?? json?.state
        const newStatus = state ? mapConnectionState(state) : inst.status
        let numero = inst.numero

        if (newStatus === "conectado" && !numero) {
          try {
            const fi = await fetchWithTimeout(
              `${cfg.url}/instance/fetchInstances?instanceName=${encodeURIComponent(name)}`,
              { headers: { apikey: cfg.key } },
            )
            const arr = await fi.json().catch(() => null)
            const item = Array.isArray(arr) ? arr[0] : arr
            const owner = item?.instance?.owner ?? item?.owner ?? item?.instance?.ownerJid ?? item?.ownerJid
            if (owner) numero = onlyDigits(String(owner).split("@")[0])
          } catch {
            /* número opcional */
          }
        }

        const mudou = newStatus !== inst.status || numero !== inst.numero
        if (mudou) {
          const patch: Record<string, unknown> = {
            status: newStatus,
            atualizado_em: new Date().toISOString(),
          }
          if (numero) patch.numero = numero
          if (newStatus === "conectado") patch.qr_code = null
          await wsupabase.from("whatsapp_instancias").update(patch).eq("instance_name", name)

          if (newStatus === "desconectado" && inst.status === "conectado") {
            void notifyDisconnection(name)
          }
        }

        return { name, status: newStatus, numero, mudou }
      } catch (err) {
        return { name, status: inst.status, error: String(err) }
      }
    }),
  )

  return NextResponse.json({
    ok: true,
    total: instancias.length,
    resultados: results.map((r) => (r.status === "fulfilled" ? r.value : { error: String(r.reason) })),
  })
}
