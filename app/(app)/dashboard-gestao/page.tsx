"use client"

import { useEffect, useMemo, useState } from "react"
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"
import { Users, CalendarCheck, TrendingUp, CircleDollarSign } from "lucide-react"
import { useLeads } from "@/lib/leads-store"
import { Card, CardContent, CardHeader, CardTitle, Badge, Select, Skeleton } from "@/components/ui/primitives"
import { PageHeading } from "@/components/ui/page-heading"
import { KanbanBoard } from "@/components/kanban-board"
import { brl, fmtDate } from "@/lib/labels"
import { ORIGENS, type Origem } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

const COLORS = ["#b22222", "#54595f", "#c41e24", "#a1a1aa"]

export default function DashboardGestaoPage() {
  const { leads, visits, corretores, userName } = useLeads()
  const [loading, setLoading] = useState(true)
  const [filterCorretor, setFilterCorretor] = useState("todos")
  const [subAba, setSubAba] = useState<"andamento" | "fechadas">("andamento")

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

  const kanbanLeads = filterCorretor === "todos" ? leads : leads.filter((l) => l.corretorId === filterCorretor)

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

      {/* Kanban geral */}
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Kanban Geral</h2>
          <Select value={filterCorretor} onChange={(e) => setFilterCorretor(e.target.value)} aria-label="Filtrar por corretor" className="w-52">
            <option value="todos">Todos os corretores</option>
            {corretores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
        </div>
        <KanbanBoard leads={kanbanLeads} showCorretor currentCorretorId={corretores[0]?.id ?? ""} isGestor heightClass="h-[520px]" />
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
