import { NextResponse } from "next/server"
import { evolutionConfig, mapConnectionState, notifyDisconnection, onlyDigits, wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

async function fetchWithTimeout(url: string, init: RequestInit, ms = 8000) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ac.signal })
  } finally {
    clearTimeout(timer)
  }
}

// Sincroniza o estado de conexão de todas as instâncias consultando a Evolution API.
// Inclui auto-healing (restart de socket fechado) e atualização automática de QR Code.
export async function sincronizarInstanciasWhatsApp() {
  const { data: instancias, error } = await wsupabase
    .from("whatsapp_instancias")
    .select("id, corretor_id, instance_name, status, numero, qr_code")

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
        let newStatus = state ? mapConnectionState(state) : inst.status
        let numero = inst.numero
        let qrCode: string | null = inst.qr_code

        // Auto-healing: Se a Evolution reportou "close" ou "connecting" (queda de socket),
        // tenta reiniciar a sessão automaticamente para reatar antes de declarar desconectado.
        if (newStatus !== "conectado") {
          try {
            await fetchWithTimeout(`${cfg.url}/instance/restart/${encodeURIComponent(name)}`, {
              method: "POST",
              headers: { apikey: cfg.key },
            }, 6000)

            await new Promise((r) => setTimeout(r, 2500))

            const checkRes = await fetchWithTimeout(`${cfg.url}/instance/connectionState/${encodeURIComponent(name)}`, {
              headers: { apikey: cfg.key },
            }, 5000)

            if (checkRes.ok) {
              const checkJson = await checkRes.json().catch(() => null)
              const checkState = checkJson?.instance?.state ?? checkJson?.state
              if (checkState) {
                newStatus = mapConnectionState(checkState)
              }
            }
          } catch {
            /* restart falhou */
          }
        }

        // Se continuou desconectado, busca QR Code para que o corretor já veja no painel
        if (newStatus === "desconectado") {
          try {
            const qrRes = await fetchWithTimeout(`${cfg.url}/instance/connect/${encodeURIComponent(name)}`, {
              headers: { apikey: cfg.key },
            }, 6000)
            if (qrRes.ok) {
              const qrJson = await qrRes.json().catch(() => null)
              if (qrJson?.base64) {
                qrCode = qrJson.base64
              }
            }
          } catch {
            /* QR code opcional */
          }
        }

        if (newStatus === "conectado") {
          qrCode = null
          if (!numero) {
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
        }

        const mudou = newStatus !== inst.status || numero !== inst.numero || qrCode !== inst.qr_code
        if (mudou) {
          const patch: Record<string, unknown> = {
            status: newStatus,
            qr_code: qrCode,
            atualizado_em: new Date().toISOString(),
          }
          if (numero) patch.numero = numero
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

// Suporte para Vercel Cron (GET) e chamadas do frontend (POST)
export async function GET() {
  return sincronizarInstanciasWhatsApp()
}

export async function POST() {
  return sincronizarInstanciasWhatsApp()
}
