// Painel de verba/teto mensal do Meta Ads.
// GET  → config + gasto real do mês (Meta Graph API) + métricas derivadas
//        (usado, restante, projeção com base no padrão de veiculação dia 01..20).
// POST → atualiza a configuração (somente gestor ativo).
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const VERSAO = process.env.META_API_VERSION || "v26.0"
const BASE = `https://graph.facebook.com/${VERSAO}`

const DEFAULTS = {
  tetoMensal: 10000,
  custoInicial: 1428.34,
  veiculacaoInicio: 1,
  veiculacaoFim: 20,
  contas: ["act_321873088505518", "act_2062030070601584"],
}

function db() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
}

// Mesmo fallback do /api/meta: meta_conexao (OAuth) → env → mock
async function resolveToken(): Promise<{ token: string | null; source: "oauth" | "env" | "mock" }> {
  try {
    const { data } = await db().from("meta_conexao").select("access_token").eq("id", 1).maybeSingle()
    if (data?.access_token) return { token: data.access_token, source: "oauth" }
  } catch { /* tabela pode não existir ainda */ }
  const raw = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN
  const envToken = raw?.trim().replace(/^['"]+|['"]+$/g, "")
  if (envToken) return { token: envToken, source: "env" }
  return { token: null, source: "mock" }
}

// Formata data no fuso local (não UTC) para não deslocar o dia
function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Fetch com paginação (mesmo padrão do /api/meta)
async function metaGetAll(url: string): Promise<any[]> {
  const out: any[] = []
  let next: string | null = url
  let guard = 0
  while (next && guard < 25) {
    guard++
    const r: Response = await fetch(next)
    const j: any = await r.json()
    if (j.error) throw Object.assign(new Error(j.error.message), { expired: j.error.code === 190 })
    if (Array.isArray(j.data)) out.push(...j.data)
    else return [j]
    next = j.paging?.next ?? null
  }
  return out
}

async function loadConfig(): Promise<typeof DEFAULTS> {
  try {
    const { data } = await db().from("meta_orcamento").select("*").eq("id", 1).maybeSingle()
    if (!data) return DEFAULTS
    return {
      tetoMensal: Number(data.teto_mensal ?? DEFAULTS.tetoMensal),
      custoInicial: Number(data.custo_inicial ?? DEFAULTS.custoInicial),
      veiculacaoInicio: Number(data.veiculacao_inicio ?? DEFAULTS.veiculacaoInicio),
      veiculacaoFim: Number(data.veiculacao_fim ?? DEFAULTS.veiculacaoFim),
      contas: Array.isArray(data.contas) && data.contas.length > 0 ? data.contas : DEFAULTS.contas,
    }
  } catch {
    return DEFAULTS
  }
}

async function saveConfig(cfg: typeof DEFAULTS) {
  const { error } = await db().from("meta_orcamento").upsert({
    id: 1,
    teto_mensal: cfg.tetoMensal,
    custo_inicial: cfg.custoInicial,
    veiculacao_inicio: cfg.veiculacaoInicio,
    veiculacao_fim: cfg.veiculacaoFim,
    contas: cfg.contas,
    atualizado_em: new Date().toISOString(),
  })
  if (error) throw error
}

// Gasto real do mês por conta de anúncio
async function gastoMes(token: string, contas: string[], since: string, until: string): Promise<{ total: number; porConta: Record<string, number> }> {
  const porConta: Record<string, number> = {}
  let total = 0
  for (const acc of contas) {
    let soma = 0
    try {
      const rows = await metaGetAll(`${BASE}/${acc}/insights?fields=spend&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}&limit=500&access_token=${token}`)
      for (const r of rows) soma += Number(r.spend || 0)
    } catch {
      // conta sem acesso: não derruba o painel
    }
    porConta[acc] = soma
    total += soma
  }
  return { total, porConta }
}

export async function GET() {
  const { token, source } = await resolveToken()
  const config = await loadConfig()

  const hoje = new Date()
  const since = isoLocal(new Date(hoje.getFullYear(), hoje.getMonth(), config.veiculacaoInicio))
  const until = isoLocal(hoje)

  const { total, porConta } = token
    ? await gastoMes(token, config.contas, since, until)
    : { total: 0, porConta: {} }

  const diasDecorridos = Math.max(0, hoje.getDate() - config.veiculacaoInicio + 1)
  const diasVeiculados = Math.min(diasDecorridos, config.veiculacaoFim)
  const usado = config.custoInicial + total
  const restante = Math.max(0, config.tetoMensal - usado)
  const mediaDiaria = diasVeiculados > 0 ? total / diasVeiculados : 0
  const projecaoGastoVeiculacao = diasDecorridos >= config.veiculacaoFim
    ? total
    : mediaDiaria * config.veiculacaoFim
  const projecao = config.custoInicial + projecaoGastoVeiculacao
  const dentroLimite = projecao <= config.tetoMensal
  const estouro = Math.max(0, projecao - config.tetoMensal)
  const diasRestantes = Math.max(0, config.veiculacaoFim - diasDecorridos)
  const verbaDiaRestante = diasRestantes > 0 ? restante / diasRestantes : 0

  return NextResponse.json({
    source,
    config,
    gastoReal: total,
    porConta,
    calc: {
      diasDecorridos,
      diasVeiculados,
      mediaDiaria,
      usado,
      restante,
      projecao,
      dentroLimite,
      estouro,
      diasRestantes,
      verbaDiaRestante,
      mesReferencia: isoLocal(hoje).slice(0, 7),
    },
  })
}

export async function POST(req: Request) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "body JSON inválido" }, { status: 400 })
  }

  // Somente gestor ativo pode alterar a verba
  const senderId: string | undefined = body.senderId
  if (!senderId) return NextResponse.json({ error: "informe senderId" }, { status: 400 })
  const { data: sender } = await db().from("usuarios").select("id,role,status").eq("id", senderId).maybeSingle()
  if (!sender || sender.role !== "gestor" || sender.status !== "ativo") {
    return NextResponse.json({ error: "Acesso restrito a gestores ativos." }, { status: 403 })
  }

  const tetoMensal = Number(body.tetoMensal)
  const custoInicial = Number(body.custoInicial)
  const veiculacaoInicio = Number(body.veiculacaoInicio)
  const veiculacaoFim = Number(body.veiculacaoFim)
  const contas: string[] = Array.isArray(body.contas) ? body.contas.filter((c: unknown) => typeof c === "string" && c) : []

  if (!Number.isFinite(tetoMensal) || tetoMensal <= 0) return NextResponse.json({ error: "teto mensal inválido" }, { status: 400 })
  if (!Number.isFinite(custoInicial) || custoInicial < 0) return NextResponse.json({ error: "custo inicial inválido" }, { status: 400 })
  if (!Number.isInteger(veiculacaoInicio) || !Number.isInteger(veiculacaoFim) || veiculacaoInicio < 1 || veiculacaoInicio > veiculacaoFim || veiculacaoFim > 31) {
    return NextResponse.json({ error: "período de veiculação inválido" }, { status: 400 })
  }
  if (contas.length === 0) return NextResponse.json({ error: "selecione pelo menos uma conta" }, { status: 400 })

  const config = { tetoMensal, custoInicial, veiculacaoInicio, veiculacaoFim, contas }
  try {
    await saveConfig(config)
  } catch (e: any) {
    return NextResponse.json({ error: "Não foi possível salvar. Rode o script scripts/021_meta_orcamento.sql no Supabase.", details: e.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, config })
}
