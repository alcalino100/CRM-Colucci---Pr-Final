import { NextResponse } from "next/server"
import { evolutionConfig, wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// fetch com timeout para não travar quando o servidor Evolution está inacessível
async function fetchWithTimeout(url: string, init: RequestInit, ms = 12000) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ac.signal })
  } finally {
    clearTimeout(timer)
  }
}

// Extrai o QR em base64 de formatos variados retornados pela Evolution
function extractQr(payload: any): string | null {
  if (!payload) return null
  const raw = payload.base64 ?? payload.code ?? payload.qrcode?.base64 ?? payload.qrcode?.code ?? null
  if (!raw || typeof raw !== "string") return null
  return raw.startsWith("data:image") ? raw : `data:image/png;base64,${raw}`
}

export async function POST(request: Request) {
  const cfg = evolutionConfig()
  if (!cfg.ok) return NextResponse.json({ error: "Integração WhatsApp não configurada." }, { status: 500 })

  let body: { instanceName?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 })
  }
  const instanceName = body.instanceName
  if (!instanceName) return NextResponse.json({ error: "Instância não informada." }, { status: 400 })

  try {
    // 1) Cria a instância (ignora caso já exista)
    const createRes = await fetchWithTimeout(`${cfg.url}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.key },
      body: JSON.stringify({ instanceName, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
    })
    if (!createRes.ok && createRes.status !== 403) {
      const txt = (await createRes.text()).toLowerCase()
      if (!txt.includes("already") && !txt.includes("exists") && !txt.includes("in use")) {
        return NextResponse.json({ error: "Não foi possível criar a instância na Evolution." }, { status: 502 })
      }
    }

    // 2) Solicita o QR de conexão
    const connectRes = await fetchWithTimeout(`${cfg.url}/instance/connect/${encodeURIComponent(instanceName)}`, {
      headers: { apikey: cfg.key },
    })
    const connectJson = await connectRes.json().catch(() => null)
    const qrCode = extractQr(connectJson)

    await wsupabase
      .from("whatsapp_instancias")
      .update({ qr_code: qrCode, status: "conectando", atualizado_em: new Date().toISOString() })
      .eq("instance_name", instanceName)

    if (!qrCode) return NextResponse.json({ error: "QR Code indisponível no momento. Tente novamente." }, { status: 502 })
    return NextResponse.json({ qrCode, status: "conectando" })
  } catch (err) {
    // Loga a causa real no servidor (sem expor URL/chave ao client)
    const cause = (err as any)?.cause?.code || (err as any)?.name || ""
    console.log("[v0] whatsapp connect error:", err instanceof Error ? err.message : String(err), cause)
    const inacessivel = cause === "ECONNRESET" || cause === "ECONNREFUSED" || cause === "ETIMEDOUT" || cause === "AbortError" || cause === "ENOTFOUND"
    const error = inacessivel
      ? "Não foi possível alcançar o servidor da Evolution API. Verifique se ele está online e acessível pela internet. (No preview do v0 o acesso a servidores HTTP internos é bloqueado; funciona no site publicado.)"
      : "Falha ao conectar com a Evolution API."
    return NextResponse.json({ error }, { status: 502 })
  }
}
