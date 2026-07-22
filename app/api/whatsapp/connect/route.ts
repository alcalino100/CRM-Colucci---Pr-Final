import { NextResponse } from "next/server"
import { evolutionConfig, wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

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
    const createRes = await fetch(`${cfg.url}/instance/create`, {
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
    const connectRes = await fetch(`${cfg.url}/instance/connect/${encodeURIComponent(instanceName)}`, {
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
  } catch {
    return NextResponse.json({ error: "Falha ao conectar com a Evolution API." }, { status: 500 })
  }
}
