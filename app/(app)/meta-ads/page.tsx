"use client"

// Meta Ads — visão gerencial (somente gestores, read-only).
// Drill-down: Conta > Campanha > Conjunto > Anúncio > Criativo, com KPIs comparativos,
// gráficos, tabela detalhada e cruzamento com leads reais do CRM.

import { useMemo, useState } from "react"
import useSWR from "swr"
import {
  CircleDollarSign, Eye, MousePointerClick, Percent, Coins, BarChart3, Users, Target,
  ChevronRight, Link2, TriangleAlert, ArrowUpRight, ArrowDownRight, Plug, RefreshCw,
} from "lucide-react"
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Legend,
} from "recharts"
import { useAuth } from "@/lib/auth-context"
import { useLeads } from "@/lib/leads-store"
import { Badge, Card, CardContent, CardHeader, CardTitle, Select, Skeleton, Input } from "@/components/ui/primitives"
import { brl } from "@/lib/labels"
import { cn } from "@/lib/utils"

// ---------- helpers ----------
const fetcher = (u: string) => fetch(u).then(async (r) => {
  const j = await r.json()
  if (!r.ok) throw Object.assign(new Error(j.error || "Erro"), { expired: j.expired })
  return j
})

const fmt = (n: number, d = 0) => n.toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: d })
const iso = (d: Date) => d.toISOString().slice(0, 10)

type Nivel = "account" | "campaign" | "adset" | "ad"
const FILHO: Record<Nivel, Nivel | null> = { account: "campaign", campaign: "adset", adset: "ad", ad: null }
const NIVEL_LABEL: Record<Nivel, string> = { account: "Conta", campaign: "Campanha", adset: "Conjunto", ad: "Anúncio" }

const STATUS_PT: Record<string, { label: string; variant: string }> = {
  ACTIVE: { label: "Ativo", variant: "green" },
  PAUSED: { label: "Pausado", variant: "amber" },
  ARCHIVED: { label: "Arquivado", variant: "gray" },
  DELETED: { label: "Removido", variant: "red" },
  CAMPAIGN_PAUSED: { label: "Campanha pausada", variant: "amber" },
  ADSET_PAUSED: { label: "Conjunto pausado", variant: "amber" },
}
function StatusBadge({ s }: { s?: string | null }) {
  const m = STATUS_PT[(s || "").toUpperCase()] ?? { label: s || "—", variant: "gray" }
  return <Badge variant={m.variant as any}>{m.label}</Badge>
}

// Extrai "resultados" (leads/conversas) do array actions do Insights
function resultados(row: any): number {
  const acts: any[] = row?.actions || []
  return acts
    .filter((a) => a.action_type === "lead" || a.action_type.includes("messaging_conversation_started"))
    .reduce((s, a) => s + Number(a.value || 0), 0)
}
function agrega(rows: any[]) {
  const t = { spend: 0, impressions: 0, clicks: 0, reach: 0, results: 0 }
  for (const r of rows) {
    t.spend += Number(r.spend || 0)
    t.impressions += Number(r.impressions || 0)
    t.clicks += Number(r.clicks || 0)
    t.reach += Number(r.reach || 0)
    t.results += resultados(r)
  }
  return {
    ...t,
    ctr: t.impressions ? (t.clicks / t.impressions) * 100 : 0,
    cpc: t.clicks ? t.spend / t.clicks : 0,
    cpm: t.impressions ? (t.spend / t.impressions) * 1000 : 0,
    freq: t.reach ? t.impressions / t.reach : 0,
    cpr: t.results ? t.spend / t.results : 0,
  }
}

// ---------- períodos ----------
const PRESETS = [
  { id: "hoje", label: "Hoje" },
  { id: "7d", label: "Últimos 7 dias" },
  { id: "30d", label: "Últimos 30 dias" },
  { id: "mes", label: "Este mês" },
  { id: "custom", label: "Personalizado" },
] as const

function rangeFor(preset: string, cSince: string, cUntil: string): { since: string; until: string } {
  const hoje = new Date()
  if (preset === "hoje") return { since: iso(hoje), until: iso(hoje) }
  if (preset === "7d") return { since: iso(new Date(Date.now() - 6 * 864e5)), until: iso(hoje) }
  if (preset === "mes") return { since: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), until: iso(hoje) }
  if (preset === "custom" && cSince && cUntil) return { since: cSince, until: cUntil }
  return { since: iso(new Date(Date.now() - 29 * 864e5)), until: iso(hoje) }
}
// Período anterior de mesma duração (para variação percentual)
function periodoAnterior(since: string, until: string) {
  const d0 = new Date(since + "T12:00:00Z"), d1 = new Date(until + "T12:00:00Z")
  const dias = Math.round((d1.getTime() - d0.getTime()) / 864e5) + 1
  return { since: iso(new Date(d0.getTime() - dias * 864e5)), until: iso(new Date(d0.getTime() - 864e5)) }
}

// ---------- página ----------
export default function MetaAdsPage() {
  const { user } = useAuth()
  if (user && user.role !== "gestor") {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">Acesso restrito a gestores.</CardContent>
      </Card>
    )
  }
  return <MetaAdsDashboard />
}

function MetaAdsDashboard() {
  const { leads, userName } = useLeads()
  const [preset, setPreset] = useState("30d")
  const [cSince, setCSince] = useState(iso(new Date(Date.now() - 29 * 864e5)))
  const [cUntil, setCUntil] = useState(iso(new Date()))
  const [comparar, setComparar] = useState(true)
  const [compacto, setCompacto] = useState(false)
  // trilha do drill-down: [{nivel, id, nome, creativeId?}]
  const [trilha, setTrilha] = useState<{ nivel: Nivel; id: string; nome: string; creativeId?: string; status?: string }[]>([])

  const { since, until } = rangeFor(preset, cSince, cUntil)
  const prev = periodoAnterior(since, until)

  const { data: status } = useSWR("/api/meta?op=status", fetcher, { refreshInterval: 120_000 })
  const { data: contas, error: errContas } = useSWR("/api/meta?op=accounts", fetcher)
  const [contaId, setContaId] = useState("")
  const conta = useMemo(() => {
    const list = contas?.data ?? []
    return list.find((c: any) => c.id === contaId) ?? list[0]
  }, [contas, contaId])

  // Nó selecionado (último da trilha, ou a conta)
  const selecionado = trilha[trilha.length - 1] ?? (conta ? { nivel: "account" as Nivel, id: conta.id, nome: conta.name } : null)
  const nivelFilho = selecionado ? FILHO[selecionado.nivel] : null

  // ---- dados do nível filho (lista de linhas da tabela / drill) ----
  const filhosKey = selecionado && nivelFilho
    ? nivelFilho === "campaign"
      ? `/api/meta?op=campaigns&account=${selecionado.id}`
      : nivelFilho === "adset"
        ? `/api/meta?op=adsets&campaign=${selecionado.id}`
        : `/api/meta?op=ads&adset=${selecionado.id}`
    : null
  const { data: filhos, error: errFilhos, isLoading: loadFilhos } = useSWR(filhosKey, fetcher)

  // ---- insights agregados do nó selecionado (KPIs) + período anterior ----
  const insKey = selecionado ? `/api/meta?op=insights&node=${selecionado.id}&since=${since}&until=${until}` : null
  const { data: insAtual, error: errIns, isLoading: loadIns } = useSWR(insKey, fetcher)
  const { data: insPrev } = useSWR(comparar && selecionado ? `/api/meta?op=insights&node=${selecionado.id}&since=${prev.since}&until=${prev.until}` : null, fetcher)

  // ---- série diária (gráfico de linha) ----
  const { data: insDiario } = useSWR(selecionado ? `/api/meta?op=insights&node=${selecionado.id}&since=${since}&until=${until}&daily=1` : null, fetcher)

  // ---- insights por filho (gráfico de barras + tabela) ----
  const { data: insFilhos } = useSWR(
    selecionado && nivelFilho ? `/api/meta?op=insights&node=${selecionado.id}&level=${nivelFilho}&since=${since}&until=${until}` : null,
    fetcher,
  )

  const kpi = useMemo(() => agrega(insAtual?.data ?? []), [insAtual])
  const kpiPrev = useMemo(() => agrega(insPrev?.data ?? []), [insPrev])

  const serie = useMemo(() => {
    const porDia = new Map<string, { gasto: number; resultados: number }>()
    for (const r of insDiario?.data ?? []) {
      const cur = porDia.get(r.date_start) ?? { gasto: 0, resultados: 0 }
      cur.gasto += Number(r.spend || 0)
      cur.resultados += resultados(r)
      porDia.set(r.date_start, cur)
    }
    return [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([d, v]) => ({
      dia: d.slice(5).split("-").reverse().join("/"), gasto: Number(v.gasto.toFixed(2)), resultados: v.resultados,
    }))
  }, [insDiario])

  // Mapa de insights por id do filho
  const insPorFilho = useMemo(() => {
    const m = new Map<string, any>()
    const keyField = nivelFilho === "campaign" ? "campaign_id" : nivelFilho === "adset" ? "adset_id" : "ad_id"
    for (const r of insFilhos?.data ?? []) m.set(r[keyField], r)
    return m
  }, [insFilhos, nivelFilho])

  // ---- cruzamento CRM: leads reais por campanha ----
  const leadsPorCampanha = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of leads) {
      if (l.origem === "Tráfego Pago" && l.metaCampaignId) m.set(l.metaCampaignId, (m.get(l.metaCampaignId) ?? 0) + 1)
    }
    return m
  }, [leads])

  const barras = useMemo(
    () =>
      (filhos?.data ?? []).map((f: any) => {
        const i = insPorFilho.get(f.id)
        return { nome: f.name.length > 22 ? f.name.slice(0, 22) + "…" : f.name, gasto: Number(Number(i?.spend ?? 0).toFixed(2)), resultados: i ? resultados(i) : 0 }
      }).filter((b: any) => b.gasto > 0 || b.resultados > 0),
    [filhos, insPorFilho],
  )

  const tokenExpirado = errIns?.expired || errFilhos?.expired || errContas?.expired
  const modoMock = status?.source === "mock"

  function drill(nivel: Nivel, id: string, nome: string, extra?: { creativeId?: string; status?: string }) {
    setTrilha((t) => [...t, { nivel, id, nome, ...extra }])
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Cabeçalho + conexão */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Meta Ads</h1>
          <p className="text-sm text-muted-foreground text-pretty">Performance das campanhas com dados da Meta Graph API e leads reais do CRM.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status && (
            <Badge variant={status.connected ? "green" : "amber"} className="gap-1">
              <Plug className="size-3" />
              {status.connected ? (status.source === "env" ? "Conectado (token)" : "Conectado") : "Modo demonstração"}
            </Badge>
          )}
          {!status?.connected && (
            <a href="/api/meta/oauth/start" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
              <Link2 className="size-4" /> Conectar Meta Business
            </a>
          )}
        </div>
      </div>

      {/* Avisos */}
      {status?.warnExpiring && (
        <Aviso texto="O token da conta Meta expira em menos de 7 dias. Reconecte para evitar interrupção." acao="Reconectar" />
      )}
      {tokenExpirado && (
        <Aviso texto="Token expirado. Reconecte sua conta Meta Business para continuar vendo os dados." acao="Reconectar" erro />
      )}
      {modoMock && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Exibindo dados de demonstração no formato real da Graph API. Conecte a conta Meta Business (ou defina META_ACCESS_TOKEN) para ver dados reais.
        </p>
      )}

      {/* Conta + período */}
      <Card>
        <CardContent className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Conta de anúncios</span>
            <Select value={conta?.id ?? ""} onChange={(e) => { setContaId(e.target.value); setTrilha([]) }} aria-label="Conta de anúncios">
              {(contas?.data ?? []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.name} · {c.currency}</option>
              ))}
              {!contas && <option>Carregando…</option>}
            </Select>
            {conta && (
              <span className="text-xs text-muted-foreground">
                {conta.timezone_name} · {conta.account_status === 1 ? "Conta ativa" : "Conta inativa"}
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Período</span>
            <Select value={preset} onChange={(e) => setPreset(e.target.value)} aria-label="Período">
              {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </Select>
          </div>
          {preset === "custom" ? (
            <>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">De</span>
                <Input type="date" value={cSince} onChange={(e) => setCSince(e.target.value)} />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Até</span>
                <Input type="date" value={cUntil} onChange={(e) => setCUntil(e.target.value)} />
              </div>
            </>
          ) : (
            <div className="flex items-end md:col-span-1 xl:col-span-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={comparar} onChange={(e) => setComparar(e.target.checked)} className="accent-primary" />
                Comparar com período anterior ({prev.since.split("-").reverse().join("/")} – {prev.until.split("-").reverse().join("/")})
              </label>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Breadcrumb do drill-down */}
      <nav aria-label="Navegação da hierarquia" className="flex flex-wrap items-center gap-1 text-sm">
        <button type="button" className="font-medium text-primary hover:underline" onClick={() => setTrilha([])}>
          {conta?.name ?? "Conta"}
        </button>
        {trilha.map((t, i) => (
          <span key={t.id} className="flex items-center gap-1">
            <ChevronRight className="size-4 text-muted-foreground" />
            <button
              type="button"
              className={i === trilha.length - 1 ? "font-medium" : "font-medium text-primary hover:underline"}
              onClick={() => setTrilha((arr) => arr.slice(0, i + 1))}
            >
              <span className="text-xs text-muted-foreground">{NIVEL_LABEL[t.nivel]}: </span>{t.nome}
            </button>
          </span>
        ))}
      </nav>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {loadIns ? (
          Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : (
          <>
            <Kpi icon={CircleDollarSign} label="Gasto total" value={brl(kpi.spend)} prev={comparar ? kpiPrev.spend : undefined} cur={kpi.spend} invert />
            <Kpi icon={Eye} label="Impressões" value={fmt(kpi.impressions)} prev={comparar ? kpiPrev.impressions : undefined} cur={kpi.impressions} />
            <Kpi icon={MousePointerClick} label="Cliques" value={fmt(kpi.clicks)} prev={comparar ? kpiPrev.clicks : undefined} cur={kpi.clicks} />
            <Kpi icon={Percent} label="CTR" value={`${fmt(kpi.ctr, 2)}%`} prev={comparar ? kpiPrev.ctr : undefined} cur={kpi.ctr} />
            <Kpi icon={Coins} label="CPC" value={brl(kpi.cpc)} prev={comparar ? kpiPrev.cpc : undefined} cur={kpi.cpc} invert />
            <Kpi icon={BarChart3} label="CPM" value={brl(kpi.cpm)} prev={comparar ? kpiPrev.cpm : undefined} cur={kpi.cpm} invert />
            <Kpi icon={Users} label="Resultados (leads)" value={fmt(kpi.results)} prev={comparar ? kpiPrev.results : undefined} cur={kpi.results} />
            <Kpi icon={Target} label="Custo por resultado" value={kpi.results ? brl(kpi.cpr) : "—"} prev={comparar ? kpiPrev.cpr : undefined} cur={kpi.cpr} invert />
          </>
        )}
      </div>

      {/* Gráficos */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Evolução diária — gasto × resultados</CardTitle></CardHeader>
          <CardContent>
            {!insDiario ? <Skeleton className="h-64 rounded-xl" /> : serie.length === 0 ? (
              <Vazio texto="Sem dados no período selecionado." />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="g" tick={{ fontSize: 11 }} width={52} />
                    <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} width={32} />
                    <Tooltip formatter={(v: any, n: any) => (n === "gasto" ? brl(Number(v)) : v)} />
                    <Legend />
                    <Line yAxisId="g" type="monotone" dataKey="gasto" name="Gasto (R$)" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
                    <Line yAxisId="r" type="monotone" dataKey="resultados" name="Resultados" stroke="#64748b" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Comparação entre {nivelFilho ? NIVEL_LABEL[nivelFilho].toLowerCase() + "s" : "itens"}</CardTitle></CardHeader>
          <CardContent>
            {!insFilhos && nivelFilho ? <Skeleton className="h-64 rounded-xl" /> : barras.length === 0 ? (
              <Vazio texto={nivelFilho ? "Nenhum item com dados no período." : "Nível de anúncio não possui subitens."} />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barras} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="nome" tick={{ fontSize: 10 }} interval={0} angle={-12} height={48} />
                    <YAxis tick={{ fontSize: 11 }} width={52} />
                    <Tooltip formatter={(v: any, n: any) => (n === "gasto" ? brl(Number(v)) : v)} />
                    <Legend />
                    <Bar dataKey="gasto" name="Gasto (R$)" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="resultados" name="Resultados" fill="#64748b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabela detalhada / drill-down */}
      {nivelFilho ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{NIVEL_LABEL[nivelFilho]}s {selecionado && selecionado.nivel !== "account" ? `de "${selecionado.nome}"` : ""}</CardTitle>
            <button
              type="button"
              onClick={() => setCompacto((v) => !v)}
              className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
            >
              {compacto ? "Ver todas as colunas" : "Ver menos colunas"}
            </button>
          </CardHeader>
          <CardContent>
            {loadFilhos ? (
              <Skeleton className="h-48 rounded-xl" />
            ) : (filhos?.data ?? []).length === 0 ? (
              <Vazio texto="Nenhuma campanha encontrada no período selecionado." />
            ) : (
              // Scroll horizontal isolado: só a tabela rola, com fade na borda direita
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-8 bg-gradient-to-l from-card to-transparent" aria-hidden="true" />
                <div className="max-h-[32rem] overflow-auto overscroll-x-contain rounded-lg border border-border">
                  <table className="w-full text-xs sm:text-sm">
                    <thead className="sticky top-0 z-10 bg-card">
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="sticky left-0 z-20 min-w-52 max-w-64 bg-card py-2 pl-3 pr-3">Nome</th>
                        <th className="min-w-24 py-2 pr-3">Status</th>
                        {!compacto && nivelFilho === "campaign" && <th className="min-w-28 py-2 pr-3">Objetivo</th>}
                        {/* Bloco Orçamento/Gasto */}
                        {!compacto && <th className="min-w-[110px] border-l border-border/60 py-2 pl-3 pr-3 text-right">Orçamento/dia</th>}
                        <th className={cn("min-w-[100px] py-2 pr-3 text-right", compacto && "border-l border-border/60 pl-3")}>Gasto</th>
                        {/* Bloco Tráfego */}
                        {!compacto && <th className="min-w-[90px] border-l border-border/60 py-2 pl-3 pr-3 text-right">Impr.</th>}
                        <th className={cn("min-w-[90px] py-2 pr-3 text-right", compacto && "border-l border-border/60 pl-3")}>Cliques</th>
                        <th className="min-w-[80px] py-2 pr-3 text-right">CTR</th>
                        {!compacto && <th className="min-w-[90px] py-2 pr-3 text-right">CPC</th>}
                        {!compacto && <th className="min-w-[90px] py-2 pr-3 text-right">CPM</th>}
                        {/* Bloco Alcance */}
                        {!compacto && <th className="min-w-[95px] border-l border-border/60 py-2 pl-3 pr-3 text-right">Alcance</th>}
                        {!compacto && <th className="min-w-[80px] py-2 pr-3 text-right">Freq.</th>}
                        {/* Bloco Resultados */}
                        <th className="min-w-[90px] border-l border-border/60 py-2 pl-3 pr-3 text-right">Result.</th>
                        <th className="min-w-[110px] py-2 pr-3 text-right">Custo/Result.</th>
                        {/* Bloco CRM */}
                        {nivelFilho === "campaign" && <th className="min-w-[95px] border-l border-border/60 py-2 pl-3 pr-3 text-right">Leads CRM</th>}
                        {nivelFilho === "campaign" && <th className="min-w-[95px] py-2 pr-3 text-right">CPL real</th>}
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {(filhos?.data ?? []).map((f: any) => {
                        const i = insPorFilho.get(f.id)
                        const res = i ? resultados(i) : 0
                        const spend = Number(i?.spend ?? 0)
                        const crmLeads = nivelFilho === "campaign" ? (leadsPorCampanha.get(f.id) ?? 0) : 0
                        return (
                          <tr key={f.id} className="group border-b border-border/60 hover:bg-muted/40">
                            {/* Nome fixo à esquerda com fundo sólido */}
                            <td className="sticky left-0 z-10 min-w-52 max-w-64 bg-card py-2 pl-3 pr-3 group-hover:bg-muted">
                              <button
                                type="button"
                                title={f.name}
                                className="block w-full truncate text-left font-medium text-primary hover:underline"
                                onClick={() => drill(nivelFilho, f.id, f.name, { creativeId: f.creative?.id, status: f.effective_status })}
                              >
                                {f.name}
                              </button>
                              {nivelFilho === "campaign" && f.start_time && (
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {f.start_time.slice(0, 10).split("-").reverse().join("/")}{f.stop_time ? ` – ${f.stop_time.slice(0, 10).split("-").reverse().join("/")}` : ""}
                                </p>
                              )}
                            </td>
                            <td className="py-2 pr-3"><StatusBadge s={f.effective_status} /></td>
                            {!compacto && nivelFilho === "campaign" && <td className="py-2 pr-3 text-xs">{(f.objective || "—").replace("OUTCOME_", "")}</td>}
                            {!compacto && <td className="border-l border-border/60 py-2 pl-3 pr-3 text-right">{f.daily_budget ? brl(Number(f.daily_budget) / 100) : "—"}</td>}
                            <td className={cn("py-2 pr-3 text-right font-medium", compacto && "border-l border-border/60 pl-3")}>{brl(spend)}</td>
                            {!compacto && <td className="border-l border-border/60 py-2 pl-3 pr-3 text-right">{fmt(Number(i?.impressions ?? 0))}</td>}
                            <td className={cn("py-2 pr-3 text-right", compacto && "border-l border-border/60 pl-3")}>{fmt(Number(i?.clicks ?? 0))}</td>
                            <td className="py-2 pr-3 text-right">{fmt(Number(i?.ctr ?? 0), 2)}%</td>
                            {!compacto && <td className="py-2 pr-3 text-right">{brl(Number(i?.cpc ?? 0))}</td>}
                            {!compacto && <td className="py-2 pr-3 text-right">{brl(Number(i?.cpm ?? 0))}</td>}
                            {!compacto && <td className="border-l border-border/60 py-2 pl-3 pr-3 text-right">{fmt(Number(i?.reach ?? 0))}</td>}
                            {!compacto && <td className="py-2 pr-3 text-right">{fmt(Number(i?.frequency ?? 0), 2)}</td>}
                            <td className="border-l border-border/60 py-2 pl-3 pr-3 text-right font-medium">{fmt(res)}</td>
                            <td className="py-2 pr-3 text-right">{res ? brl(spend / res) : "—"}</td>
                            {nivelFilho === "campaign" && <td className="border-l border-border/60 py-2 pl-3 pr-3 text-right font-medium">{crmLeads}</td>}
                            {nivelFilho === "campaign" && <td className="py-2 pr-3 text-right">{crmLeads ? brl(spend / crmLeads) : "—"}</td>}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        // Nível de anúncio: preview do criativo
        selecionado && (
          <Card>
            <CardHeader><CardTitle>Criativo do anúncio</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <CreativeCard
                ad={{ id: selecionado.id, name: selecionado.nome, effective_status: (selecionado as any).status ?? "ACTIVE", creative: { id: (selecionado as any).creativeId ?? `cr_${selecionado.id}` } }}
                ins={insAtual?.data?.[0]}
                adsetNome={trilha.length >= 2 ? trilha[trilha.length - 2].nome : "—"}
              />
            </CardContent>
          </Card>
        )
      )}

      {/* Grid de criativos ao navegar em um conjunto */}
      {selecionado?.nivel === "adset" && (filhos?.data ?? []).length > 0 && (
        <Card>
          <CardHeader><CardTitle>Criativos do conjunto</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(filhos?.data ?? []).map((ad: any) => (
              <CreativeCard key={ad.id} ad={ad} ins={insPorFilho.get(ad.id)} adsetNome={selecionado.nome} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------- componentes ----------
function Kpi({ icon: Icon, label, value, prev, cur, invert }: { icon: any; label: string; value: string; prev?: number; cur: number; invert?: boolean }) {
  let delta: number | null = null
  if (prev !== undefined && prev > 0) delta = ((cur - prev) / prev) * 100
  const positivo = delta !== null && (invert ? delta < 0 : delta > 0)
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{label}</p>
            <p className="truncate text-xl font-bold tabular-nums md:text-2xl">{value}</p>
            {delta !== null && (
              <p className={`flex items-center gap-0.5 text-xs font-medium tabular-nums ${positivo ? "text-emerald-600" : "text-red-600"}`}>
                {delta >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                {fmt(Math.abs(delta), 1)}% vs anterior
              </p>
            )}
          </div>
          <div className="shrink-0 rounded-lg bg-muted p-2"><Icon className="size-4 text-muted-foreground" /></div>
        </div>
      </CardContent>
    </Card>
  )
}

function Aviso({ texto, acao, erro }: { texto: string; acao: string; erro?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${erro ? "border-red-300 bg-red-50 text-red-800" : "border-amber-300 bg-amber-50 text-amber-800"}`}>
      <span className="flex items-center gap-2"><TriangleAlert className="size-4 shrink-0" />{texto}</span>
      <a href="/api/meta/oauth/start" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90">
        <RefreshCw className="size-3" /> {acao}
      </a>
    </div>
  )
}

function Vazio({ texto }: { texto: string }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{texto}</p>
}

const CTA_PT: Record<string, string> = { LEARN_MORE: "Saiba mais", WHATSAPP_MESSAGE: "Enviar WhatsApp", SIGN_UP: "Cadastre-se", CONTACT_US: "Fale conosco" }

function CreativeCard({ ad, ins, adsetNome }: { ad: any; ins?: any; adsetNome: string }) {
  const { data: cr } = useSWR(ad.creative?.id ? `/api/meta?op=creative&id=${ad.creative.id}` : null, fetcher)
  const res = ins ? resultados(ins) : 0
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border">
      {cr?.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cr.image_url || "/placeholder.svg"} alt={`Criativo do anúncio ${ad.name}`} className="h-40 w-full object-cover" />
      ) : (
        <Skeleton className="h-40 w-full" />
      )}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge s={ad.effective_status} />
          {cr?.object_type && <Badge variant="gray">{cr.object_type === "VIDEO" ? "Vídeo" : cr.object_type === "CAROUSEL" ? "Carrossel" : "Imagem"}</Badge>}
        </div>
        <p className="text-sm font-semibold text-pretty">{cr?.title ?? ad.name}</p>
        {cr?.body && <p className="line-clamp-2 text-xs text-muted-foreground">{cr.body}</p>}
        <p className="text-xs text-muted-foreground">Anúncio: {ad.name} · Conjunto: {adsetNome}</p>
        {cr?.call_to_action_type && (
          <span className="w-fit rounded-md border border-border px-2 py-1 text-xs font-medium">{CTA_PT[cr.call_to_action_type] ?? cr.call_to_action_type}</span>
        )}
        <div className="mt-auto grid grid-cols-4 gap-1 border-t border-border pt-2 text-center tabular-nums">
          <MiniMetric l="Gasto" v={brl(Number(ins?.spend ?? 0))} />
          <MiniMetric l="Cliques" v={fmt(Number(ins?.clicks ?? 0))} />
          <MiniMetric l="CTR" v={`${fmt(Number(ins?.ctr ?? 0), 2)}%`} />
          <MiniMetric l="Result." v={fmt(res)} />
        </div>
      </div>
    </div>
  )
}

function MiniMetric({ l, v }: { l: string; v: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{l}</p>
      <p className="text-xs font-semibold">{v}</p>
    </div>
  )
}


