import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"
import { exigirGestor, negarAcesso } from "@/lib/auth/sessao"
import { criarModelo, excluirModelo, listarModelos } from "@/lib/whatsapp-oficial/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const db = wsupabase as unknown as { from: (t: string) => any }

async function wabaDoCanal(canalId: string | null): Promise<string | null> {
  if (!canalId) return null
  const { data } = await db.from("whatsapp_oficial_canais").select("waba_id").eq("id", canalId).maybeSingle()
  return data?.waba_id ?? null
}
const semWaba = () => NextResponse.json({ ok: false, erro: "Este número ainda não tem o WABA ID. Edite o número e informe o WABA ID." }, { status: 422 })

// Todos os modelos da conta (qualquer status) — tela de gestão.
export async function GET(request: Request) {
  const auth = exigirGestor(request)
  if (!auth.ok) return negarAcesso(auth)
  const waba = await wabaDoCanal(new URL(request.url).searchParams.get("canalId"))
  if (!waba) return semWaba()
  const r = await listarModelos(waba)
  return r.ok ? NextResponse.json({ ok: true, modelos: r.modelos }) : NextResponse.json({ ok: false, erro: r.erro }, { status: 502 })
}

// Cria um modelo (vai para aprovação da Meta).
export async function POST(request: Request) {
  const auth = exigirGestor(request)
  if (!auth.ok) return negarAcesso(auth)
  let b: { canalId?: string; nome?: string; idioma?: string; categoria?: string; corpo?: string; exemplos?: string[] }
  try { b = await request.json() } catch { return NextResponse.json({ ok: false, erro: "Dados inválidos." }, { status: 400 }) }
  const waba = await wabaDoCanal(b.canalId ?? null)
  if (!waba) return semWaba()
  const nome = (b.nome ?? "").trim()
  const corpo = (b.corpo ?? "").trim()
  if (!/^[a-z0-9_]{1,512}$/.test(nome)) return NextResponse.json({ ok: false, erro: "Nome inválido: use só letras minúsculas, números e _ (ex.: lembrete_boleto)." }, { status: 400 })
  if (!corpo || corpo.length > 1024) return NextResponse.json({ ok: false, erro: "O texto é obrigatório (até 1024 caracteres)." }, { status: 400 })
  const variaveis = new Set(Array.from(corpo.matchAll(/\{\{(\d+)\}\}/g), (m) => m[1]))
  const exemplos = (b.exemplos ?? []).map((e) => String(e).trim())
  if (variaveis.size && (exemplos.length < variaveis.size || exemplos.slice(0, variaveis.size).some((e) => !e))) {
    return NextResponse.json({ ok: false, erro: `Informe um exemplo para cada uma das ${variaveis.size} variável(is) — a Meta exige.` }, { status: 400 })
  }
  const categoria = (["UTILITY", "MARKETING", "AUTHENTICATION"].includes(b.categoria ?? "") ? b.categoria : "UTILITY") as "UTILITY" | "MARKETING" | "AUTHENTICATION"
  const r = await criarModelo(waba, { nome, idioma: (b.idioma ?? "pt_BR").trim(), categoria, corpo, exemplos: exemplos.slice(0, variaveis.size) })
  return r.ok ? NextResponse.json({ ok: true, status: r.status }) : NextResponse.json({ ok: false, erro: r.erro }, { status: 502 })
}

export async function DELETE(request: Request) {
  const auth = exigirGestor(request)
  if (!auth.ok) return negarAcesso(auth)
  const p = new URL(request.url).searchParams
  const waba = await wabaDoCanal(p.get("canalId"))
  const nome = p.get("nome") ?? ""
  if (!waba) return semWaba()
  if (!nome) return NextResponse.json({ ok: false, erro: "Informe o nome do modelo." }, { status: 400 })
  const r = await excluirModelo(waba, nome)
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, erro: r.erro }, { status: 502 })
}
