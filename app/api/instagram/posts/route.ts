import { NextResponse } from "next/server"
import { exigirGestor, negarAcesso } from "@/lib/auth/sessao"
import { montarAnaliseInstagram } from "@/lib/meta/relatorios"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

// Cache de 5 min: a tela dispara dezenas de chamadas à Meta (uma por post) e o período não muda a cada clique.
const cache = new Map<string, { em: number; corpo: unknown }>()
const TTL = 5 * 60_000

const iso = (d: Date) => d.toISOString().slice(0, 10)

// Posts do período com métricas e análise (formatos, dias/horários, ranking).
export async function GET(request: Request) {
  const auth = exigirGestor(request)
  if (!auth.ok) return negarAcesso(auth)
  const p = new URL(request.url).searchParams
  const dias = Math.min(180, Math.max(7, Number(p.get("dias")) || 30))
  const until = iso(new Date())
  const since = iso(new Date(Date.now() - (dias - 1) * 864e5))
  const chave = `${p.get("conta")}|${dias}|${since}`
  const hit = cache.get(chave)
  if (hit && Date.now() - hit.em < TTL && p.get("fresco") !== "1") return NextResponse.json(hit.corpo)
  try {
    const corpo = { ok: true, ...(await montarAnaliseInstagram(p.get("conta"), since, until, { completo: true })) }
    if (cache.size > 30) cache.clear()
    cache.set(chave, { em: Date.now(), corpo })
    return NextResponse.json(corpo)
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : "Falha ao carregar o Instagram." }, { status: 502 })
  }
}
