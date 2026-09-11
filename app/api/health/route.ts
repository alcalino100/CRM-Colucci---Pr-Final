// Healthcheck: GET /api/health → { ok: true }. Sem dependências externas
// (não toca banco nem Evolution) para o monitor não gerar ruído.
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({ ok: true, service: "crm-colucci", timestamp: new Date().toISOString() })
}
