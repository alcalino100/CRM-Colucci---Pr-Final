import { META_BASE } from "@/lib/meta/token"
import { formatoDe, type PostIG } from "./analise"

export type ContaIG = { igId: string; username: string; nome: string | null; seguidores: number; seguindo: number; midias: number; foto: string | null; paginaId: string; paginaNome: string }
type Falha = { ok: false; erro: string; faltaPermissao?: boolean }

async function graph(caminho: string, token: string): Promise<{ ok: boolean; json: any; status: number }> {
  const sep = caminho.includes("?") ? "&" : "?"
  const r = await fetch(`${META_BASE}${caminho}${sep}access_token=${encodeURIComponent(token)}`)
  return { ok: r.ok, json: await r.json().catch(() => null), status: r.status }
}

const msgErro = (j: any, status: number) => `${status} ${j?.error?.message ?? "erro na API da Meta"}${j?.error?.code ? ` (código ${j.error.code})` : ""}`
const faltaPerm = (j: any) => [10, 200, 190].includes(Number(j?.error?.code)) || /permission|permiss/i.test(String(j?.error?.message ?? ""))

/** Permissões concedidas ao token (para diagnosticar o que falta reconectar). */
export async function permissoesConcedidas(token: string): Promise<string[] | null> {
  try {
    const r = await graph("/me/permissions", token)
    if (!r.ok) return null
    return (r.json?.data ?? []).filter((p: any) => p.status === "granted").map((p: any) => String(p.permission))
  } catch { return null }
}

export const PERMISSOES_INSTAGRAM = ["instagram_basic", "instagram_manage_insights", "pages_show_list", "pages_read_engagement"]

/** Contas do Instagram (profissionais) ligadas às Páginas que o token enxerga. */
export async function listarContasInstagram(token: string): Promise<{ ok: true; contas: ContaIG[] } | Falha> {
  try {
    const r = await graph("/me/accounts?fields=id,name,instagram_business_account{id,username,name,followers_count,follows_count,media_count,profile_picture_url}&limit=100", token)
    if (!r.ok) return { ok: false, erro: msgErro(r.json, r.status), faltaPermissao: faltaPerm(r.json) }
    const contas: ContaIG[] = (r.json?.data ?? []).filter((p: any) => p.instagram_business_account).map((p: any) => ({
      igId: p.instagram_business_account.id,
      username: p.instagram_business_account.username ?? "",
      nome: p.instagram_business_account.name ?? null,
      seguidores: Number(p.instagram_business_account.followers_count ?? 0),
      seguindo: Number(p.instagram_business_account.follows_count ?? 0),
      midias: Number(p.instagram_business_account.media_count ?? 0),
      foto: p.instagram_business_account.profile_picture_url ?? null,
      paginaId: p.id,
      paginaNome: p.name,
    }))
    return { ok: true, contas }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "falha de rede" }
  }
}

type MidiaBruta = { id: string; caption?: string; media_type: string; media_product_type?: string; permalink: string; thumbnail_url?: string; media_url?: string; timestamp: string; like_count?: number; comments_count?: number }

/** Mídias publicadas desde `desdeISO` (feed, reels e carrosséis; stories não entram na API de mídia). */
export async function buscarMidias(token: string, igId: string, desdeISO: string, max = 150): Promise<{ ok: true; midias: MidiaBruta[] } | Falha> {
  const out: MidiaBruta[] = []
  let url: string | null = `/${igId}/media?fields=id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count&limit=50`
  let guard = 0
  while (url && guard++ < 6 && out.length < max) {
    const r = await graph(url, token)
    if (!r.ok) return { ok: false, erro: msgErro(r.json, r.status), faltaPermissao: faltaPerm(r.json) }
    const lote: MidiaBruta[] = r.json?.data ?? []
    let passou = false
    for (const m of lote) { if (m.timestamp >= desdeISO) out.push(m); else passou = true }
    const prox: string | undefined = r.json?.paging?.next
    url = !passou && prox ? prox.replace(META_BASE, "").replace(/([?&])access_token=[^&]*&?/, "$1").replace(/[?&]$/, "") : null
  }
  return { ok: true, midias: out.slice(0, max) }
}

type MetricasMidia = { alcance: number | null; salvamentos: number; compartilhamentos: number; visualizacoes: number | null }

/** Métricas de uma mídia. A Meta rejeita métricas não suportadas por tipo, então tenta listas menores até uma funcionar. */
export async function metricasDaMidia(token: string, midiaId: string): Promise<MetricasMidia> {
  for (const lista of ["reach,saved,shares,views", "reach,saved,shares", "reach,saved"]) {
    const r = await graph(`/${midiaId}/insights?metric=${lista}`, token)
    if (!r.ok) continue
    const v: Record<string, number> = {}
    for (const m of r.json?.data ?? []) v[m.name] = Number(m.values?.[0]?.value ?? m.total_value?.value ?? 0)
    return { alcance: v.reach ?? null, salvamentos: v.saved ?? 0, compartilhamentos: v.shares ?? 0, visualizacoes: v.views ?? null }
  }
  return { alcance: null, salvamentos: 0, compartilhamentos: 0, visualizacoes: null }
}

async function emLotes<T, R>(itens: T[], tamanho: number, fn: (i: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < itens.length; i += tamanho) out.push(...(await Promise.all(itens.slice(i, i + tamanho).map(fn))))
  return out
}

/** Posts do período já com métricas (5 chamadas em paralelo para respeitar limites). */
export async function postsComMetricas(token: string, igId: string, desdeISO: string, ateISO?: string): Promise<{ ok: true; posts: PostIG[] } | Falha> {
  const m = await buscarMidias(token, igId, desdeISO)
  if (!m.ok) return m
  const noPeriodo = ateISO ? m.midias.filter((x) => x.timestamp <= ateISO) : m.midias
  const metricas = await emLotes(noPeriodo, 5, (x) => metricasDaMidia(token, x.id))
  return {
    ok: true,
    posts: noPeriodo.map((x, i) => ({
      id: x.id,
      permalink: x.permalink,
      legenda: (x.caption ?? "").slice(0, 280),
      miniatura: x.thumbnail_url ?? x.media_url ?? null,
      formato: formatoDe(x.media_type, x.media_product_type),
      publicadoEm: x.timestamp,
      curtidas: Number(x.like_count ?? 0),
      comentarios: Number(x.comments_count ?? 0),
      ...metricas[i],
    })),
  }
}

export type InsightsConta = { alcance: number | null; visualizacoes: number | null; visitasPerfil: number | null; contasEngajadas: number | null; interacoes: number | null; novosSeguidores: number | null }

/** Métricas da conta no período (cada métrica é tentada à parte: uma não suportada não derruba as outras). */
export async function insightsDaConta(token: string, igId: string, since: string, until: string): Promise<InsightsConta> {
  const total = async (metrica: string): Promise<number | null> => {
    const r = await graph(`/${igId}/insights?metric=${metrica}&metric_type=total_value&period=day&since=${since}&until=${until}`, token)
    return r.ok ? Number(r.json?.data?.[0]?.total_value?.value ?? 0) : null
  }
  const [alcance, visualizacoes, visitasPerfil, contasEngajadas, interacoes] = await Promise.all(["reach", "views", "profile_views", "accounts_engaged", "total_interactions"].map(total))
  let novos: number | null = null
  const seg = await graph(`/${igId}/insights?metric=follower_count&period=day&since=${since}&until=${until}`, token)
  if (seg.ok) novos = (seg.json?.data?.[0]?.values ?? []).reduce((a: number, v: any) => a + Number(v.value ?? 0), 0)
  return { alcance, visualizacoes, visitasPerfil, contasEngajadas, interacoes, novosSeguidores: novos }
}
