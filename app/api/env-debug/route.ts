// app/api/env-debug/route.ts — TEMP: diagnostica CRON_SECRET sem vazar o valor
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const cron = process.env.CRON_SECRET
  const wpp = process.env.WHATSAPP_WEBHOOK_SECRET
  return NextResponse.json({
    cronSecretDefinido: !!cron,
    cronSecretLength: cron?.length ?? null,
    cronSecretIgualGuilherme: cron === "guilherme1412",
    whatsappWebhookDefinido: !!wpp,
    whatsappWebhookLength: wpp?.length ?? null,
  })
}
