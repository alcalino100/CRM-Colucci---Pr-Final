import { NextResponse } from "next/server"
import { cookieLimpo } from "@/lib/auth/sessao"

export const runtime = "nodejs"

/** Encerra a sessão do servidor (apaga o cookie). A interface limpa o localStorage por conta própria. */
export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.headers.append("Set-Cookie", cookieLimpo())
  return res
}
