"use client"

import { useEffect, useMemo, useState } from "react"
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"
import { Users, CalendarCheck, TrendingUp, CircleDollarSign, Target } from "lucide-react"
import { useLeads } from "@/lib/leads-store"
import { Card, CardContent, CardHeader, CardTitle, Badge, Skeleton } from "@/components/ui/primitives"
import { PageHeading } from "@/components/ui/page-heading"
import { KanbanBoard } from "@/components/kanban-board"
import { brl, fmtDate, STATUS_ACCENT, STATUS_LABEL, STATUS_VARIANT } from "@/lib/labels"
import { ORIGENS, type LeadStatus, type Origem } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

const COLORS = ["#b22222", "#54595f", "#c41e24", "#a1a1aa"]

// Probabilidade de fechamento por etapa (usada na previsão ponderada do pipeline)
const PIPELINE_PROB: Record<LeadStatus, number> = {
  novo: 0.1,
  "em_atendimento": 0.2,
  "escolhendo opcoes": 0.3,
  "imovel necessidade": 0.3,
  permuta: 0.4,
  "visita agendada": 0.5,
  negociando: 0.75,
  fechado: 1,
  perdido: 0,
}
const ETAPAS_PIPELINE: LeadStatus[] = ["novo", "em_atendimento", "escolhendo opcoes", "imovel necessidade", "permuta", "visita agendada", "negociando"]
const FUNIL: LeadStatus[] = ["novo", "em_atendimento", "escolhendo opcoes", "imovel necessidade", "permuta", "visita agendada", "negociando", "fechado"]

function ymdLocal(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const dia = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${m}-${dia}`
}
function inicioSemana(d: Date) {
  const x = new Date(d)
  const dia = x.getDay()
  const delta = dia === 0 ? -6 : 1 - dia
  x.setDate(x.getDate() + delta)
  return x
}

export default function DashboardGestaoPage() {
  const { leads, visits, corretores, userName } = useLeads()
  const [loading, setLoading] = useState(true)
  const [subAba, setSubAba] = useState<"andamento" | "fechadas">("andamento")
  const [tendenciaAba, setTendenciaAba] = useState<"14d" | "12s">("14d")

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600)
    return () => clearTimeout(t)
  }, [])

  const kpis = useMemo(() => {
    const naoArquivados = leads.filter((l) => !l.arquivadoEm)
    const ativos = naoArquivados.filter((l) => !["fechado", "perdido"].includes(l.status)).length
    const weekStart = new Date(); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7)
    const visitasSemana = visits.filter((v) => {
      const d = new Date(v.data + "T00:00:00")
      return d >= weekStart && d < weekEnd
    }).length
    const emProposta = naoArquivados.filter((l) => l.status === "negociando")
    const valorPropostas = emProposta.reduce((s, l) => s + (l.valorNegociacao ?? 0), 0)
    const valorFechado = naoArquivados.filter((l) => l.status === "fechado").reduce((s, l) => s + (l.valorNegociacao ?? 0), 0)
    return { ativos, visitasSemana, valorPropostas, valorFechado }
  }, [leads, visits])

  const leadsPorCorretor = useMemo(
    () => corretores.map((c) => ({ nome: c.nome.split(" ")[0], total: leads.filter((l) => !l.arquivadoEm && l.corretorId === c.id).length })),
    [leads, corretores],
  )
  const origemData = useMemo(
    () => ORIGENS.map((o) => ({ name: o, value: leads.filter((l) => !l.arquivadoEm && l.origem === (o as Origem)).length })).filter((d) => d.value > 0),
    [leads],
  )

  // Item 2 — Tendência de cadastros (diária ou semanal)
  const tendencia = useMemo(() => {
    const arr: { label: string; total: number }[] = []
    if (tendenciaAba === "14d") {
      const hoje = new Date()
      for (let i = 13; i >= 0; i--) {
        const d = new Date(hoje)
        d.setDate(d.getDate() - i)
        const key = ymdLocal(d)
        arr.push({
          label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
          total: leads.filter((l) => (l.criadoEm ?? "").slice(0, 10) === key).length,
        })
      }
    } else {
      for (let i = 11; i >= 0; i--) {
        const ini = inicioSemana(new Date())
        ini.setDate(ini.getDate() - i * 7)
        const fim = new Date(ini)
        fim.setDate(fim.getDate() + 6)
        const iniKey = ymdLocal(ini)
        const fimKey = ymdLocal(fim)
        arr.push({
          label: ini.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
          total: leads.filter((l) => {
            const k = (l.criadoEm ?? "").slice(0, 10)
            return k >= iniKey && k <= fimKey
          }).length,
        })
      }
    }
    return arr
  }, [leads, tendenciaAba])

  // Item 3 — Previsão ponderada do pipeline por etapa
  const pipeline = useMemo(() => {
    const ativos = leads.filter((l) => !l.arquivadoEm && l.status !== "fechado" && l.status !== "perdido")
    const totalValor = ativos.reduce((s, l) => s + (l.valorNegociacao ?? 0), 0)
    const previsao = ativos.reduce((s, l) => s + (l.valorNegociacao ?? 0) * PIPELINE_PROB[l.status], 0)
    const porEtapa = ETAPAS_PIPELINE.map((status) => {
      const lista = ativos.filter((l) => l.status === status)
      const valor = lista.reduce((s, l) => s + (l.valorNegociacao ?? 0), 0)
      return { status, count: lista.length, valor, ponderado: valor * PIPELINE_PROB[status], prob: Math.round(PIPELINE_PROB[status] * 100) }
    }).filter((r) => r.count > 0 || r.valor > 0)
    return { totalValor, previsao, porEtapa }
  }, [leads])

  // Item 5 — Funil de conversão (leads ativos por etapa + % sobre o total)
  const funil = useMemo(() => {
    const ativos = leads.filter((l) => !l.arquivadoEm && l.status !== "perdido")
    const base = Math.max(1, ativos.length)
    return FUNIL.map((status) => {
      const count = ativos.filter((l) => l.status === status).length
      return { status, count, pct: Math.round((count / base) * 100) }
    })
  }, [leads])

  // Item 5 — Performance por corretor (leads, fechados, conversão, valor)
  const performance = useMemo(
    () =>
      corretores
        .map((c) => {
          const lista = leads.filter((l) => !l.arquivadoEm && l.corretorId === c.id)
          const fechados = lista.filter((l) => l.status === "fechado")
          return {
            nome: c.nome.split(" ")[0],
            total: lista.length,
            fechados: fechados.length,
            conversao: lista.length ? Math.round((fechados.length / lista.length) * 100) : 0,
            valor: fechados.reduce((s, l) => s + (l.valorNegociacao ?? 0), 0),
          }
        })
        .filter((r) => r.total > 0),
    [leads, corretores],
  )

  const propostasAndamento = leads.filter((l) => !l.arquivadoEm && l.status === "negociando")
  const propostasFechadas = leads.filter((l) => !l.arquivadoEm && l.status === "fechado")
  const listaProp = subAba === "andamento" ? propostasAndamento : propostasFechadas
  const totalAba = listaProp.reduce((s, l) => s + (l.valorNegociacao ?? 0), 0)

  if (loading) {
    return (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 w-full" /><Skeleton className="h-72 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeading title="Dashboard de Gestão" subtitle="Visão geral da equipe, funil e propostas." badge="Visão gerencial" />

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Users} label="Leads ativos" value={String(kpis.ativos)} />
        <Kpi icon={CalendarCheck} label="Visitas esta semana" value={String(kpis.visitasSemana)} />
        <Kpi icon={TrendingUp} label="Valor em propostas" value={brl(kpis.valorPropostas)} />
        <Kpi icon={CircleDollarSign} label="Valor total fechado" value={brl(kpis.valorFechado)} accent />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Leads por corretor</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={leadsPorCorretor}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                <XAxis dataKey="nome" tick={{ fontSize: 12 }} stroke="#71717a" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#71717a" tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="total" fill="#b22222" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Origem dos leads</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={origemData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e: any) => `${e.name} (${e.value})`}>
                  {origemData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Item 3 — Pipeline + Item 5 — Funil */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2"><Target className="size-4 text-primary" /> Previsão de vendas</CardTitle>
            <p className="text-xs text-muted-foreground">Valor ponderado pela probabilidade de cada etapa</p>
          </CardHeader>
          <CardContent className="pt-3">
            <div className="mb-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-muted/60 p-3">
                <p className="text-xs text-muted-foreground">Previsão (ponderada)</p>
                <p className="font-display text-xl font-bold text-primary tabular-nums">{brl(pipeline.previsao)}</p>
              </div>
              <div className="rounded-xl bg-muted/60 p-3">
                <p className="text-xs text-muted-foreground">Total no pipeline</p>
                <p className="font-display text-xl font-bold tabular-nums">{brl(pipeline.totalValor)}</p>
              </div>
            </div>
            {pipeline.porEtapa.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Sem propostas em andamento</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {pipeline.porEtapa.map((r) => (
                  <div key={r.status} className="flex items-center gap-3">
                    <Badge variant={STATUS_VARIANT[r.status]} className="w-36 shrink-0 justify-start">{STATUS_LABEL[r.status]}</Badge>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${r.prob}%` }} />
                    </div>
                    <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      <span className="font-semibold text-foreground">{brl(r.ponderado)}</span> <span className="text-[10px]">({r.prob}%)</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle>Funil de conversão</CardTitle></CardHeader>
          <CardContent className="pt-3">
            {funil.every((f) => f.count === 0) ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Sem leads ativos</p>
            ) : (
              <div className="flex flex-col gap-2">
                {funil.filter((f) => f.count > 0).map((f) => (
                  <div key={f.status} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 truncate text-sm font-medium text-foreground">{STATUS_LABEL[f.status]}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.max(3, f.pct)}%`, backgroundColor: STATUS_ACCENT[f.status] }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      <span className="font-semibold text-foreground">{f.count}</span> · {f.pct}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Item 2 — Tendência + Item 5 — Performance */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Tendência de cadastros</CardTitle>
              <div className="flex gap-1">
                <button onClick={() => setTendenciaAba("14d")} className={tab(tendenciaAba === "14d")}>Últimos 14 dias</button>
                <button onClick={() => setTendenciaAba("12s")} className={tab(tendenciaAba === "12s")}>12 semanas</button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={tendencia}>
                <defs>
                  <linearGradient id="gradTendencia" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#b22222" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#b22222" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#71717a" tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#71717a" tickLine={false} axisLine={false} width={28} />
                <Tooltip />
                <Area type="monotone" dataKey="total" name="Leads" stroke="#b22222" strokeWidth={2} fill="url(#gradTendencia)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle>Performance por corretor</CardTitle></CardHeader>
          <CardContent className="pt-3">
            {performance.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Sem dados de corretores</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 font-medium">Corretor</th>
                      <th className="px-2 py-2 text-right font-medium">Leads</th>
                      <th className="px-2 py-2 text-right font-medium">Fechados</th>
                      <th className="px-2 py-2 text-right font-medium">Conv.</th>
                      <th className="px-2 py-2 text-right font-medium">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {performance.map((p) => (
                      <tr key={p.nome} className="border-b border-border/60 last:border-0">
                        <td className="px-2 py-2.5 font-medium">{p.nome}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{p.total}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-emerald-600">{p.fechados}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{p.conversao}%</td>
                        <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-primary">{brl(p.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Kanban geral */}
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Kanban Geral</h2>
        </div>
        <KanbanBoard leads={leads} showCorretor currentCorretorId={corretores[0]?.id ?? ""} isGestor heightClass="h-[520px]" />
      </div>

      {/* Propostas */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle>Propostas</CardTitle>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setSubAba("andamento")} className={tab(subAba === "andamento")}>Em andamento</button>
            <button onClick={() => setSubAba("fechadas")} className={tab(subAba === "fechadas")}>Aprovadas / Fechadas</button>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="mb-3 rounded-lg bg-muted px-4 py-2 text-sm">
            {subAba === "andamento" ? "Total em andamento: " : "Total fechado: "}
            <span className="font-display font-bold text-primary">{brl(totalAba)}</span>
          </div>
          {listaProp.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma proposta registrada</p>
          ) : (
            <div className="flex flex-col gap-2">
              {listaProp.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                  <div>
                    <p className="font-medium">{l.nome}</p>
                    <p className="text-xs text-muted-foreground">{l.imovelRef || "Sem imóvel"} · {userName(l.corretorId)} · {fmtDate(l.atualizadoEm)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={l.status === "fechado" ? "green" : "accent"}>{l.status === "fechado" ? "Fechado" : "Negociando"}</Badge>
                    <span className="font-display font-bold text-primary">{brl(l.valorNegociacao)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn(
      "group rounded-xl bg-gradient-to-b from-primary/20 via-primary/5 to-transparent p-px transition-all duration-300 hover:-translate-y-1 hover:from-primary/40",
      accent && "from-accent/25 via-accent/5",
    )}>
      <Card className="h-full rounded-[calc(var(--radius-xl)-1px)]">
        <CardContent className="flex h-full items-center gap-4 p-4 pt-5">
          <div className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 transition-all duration-300 group-hover:scale-110 group-hover:-rotate-3",
            accent
              ? "bg-accent/10 text-accent ring-accent/25 shadow-[0_0_18px_rgb(196_30_36/0.45)]"
              : "bg-primary/10 text-primary ring-primary/25 shadow-[0_0_16px_rgb(178_34_34/0.35)]",
          )}>
            <Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{label}</p>
            <p className="truncate font-display text-xl font-bold tabular-nums">{value}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function tab(active: boolean) {
  return `rounded-lg px-3 py-1.5 text-sm font-medium transition ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`
}
