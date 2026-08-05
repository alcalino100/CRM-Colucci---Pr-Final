"use client"

import { useEffect, useMemo, useState } from "react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts"
import { Handshake, Banknote, BadgeCheck, PieChart as PieIcon } from "lucide-react"
import { useLeads } from "@/lib/leads-store"
import { Card, CardContent, CardHeader, CardTitle, Badge, Select, Skeleton } from "@/components/ui/primitives"
import { brl, fmtDate, refsTexto } from "@/lib/labels"
import type { Lead } from "@/lib/mock-data"

type Aba = "fechamentos" | "negociacoes"

function dataEvento(l: Lead, aba: Aba): string {
  return aba === "fechamentos" ? (l.fechadoEm ?? l.atualizadoEm) : (l.negociandoEm ?? l.atualizadoEm)
}
function mesKey(iso: string): string {
  return (iso || "").slice(0, 7)
}
function fmtMes(key: string): string {
  const [y, m] = key.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
}

export default function FechamentoPage() {
  const { leads, corretores, userName } = useLeads()
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<Aba>("fechamentos")
  const [mes, setMes] = useState("todos")
  const [corretor, setCorretor] = useState("todos")
  const [buscaRef, setBuscaRef] = useState("")

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600)
    return () => clearTimeout(t)
  }, [])

  const base = useMemo(() => {
    const fechados = leads.filter((l) => l.status === "fechado")
    const negociando = leads.filter((l) => l.status === "negociando")
    return { fechados, negociando }
  }, [leads])

  const meses = useMemo(() => {
    const lista = aba === "fechamentos" ? base.fechados : base.negociando
    const set = new Set(lista.map((l) => mesKey(dataEvento(l, aba))))
    return Array.from(set).sort().reverse()
  }, [aba, base])

  const comRef = useMemo(() => {
    const lista = aba === "fechamentos" ? base.fechados : base.negociando
    const q = buscaRef.trim().toLowerCase()
    if (!q) return lista
    return lista.filter((l) => {
      const refs = [l.refFechamento, l.refProposta, l.imovelRef, refsTexto(l), l.nome]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return refs.includes(q)
    })
  }, [aba, base, buscaRef])

  const filtrados = useMemo(() => {
    return comRef
      .filter((l) => corretor === "todos" || l.corretorId === corretor)
      .filter((l) => mes === "todos" || mesKey(dataEvento(l, aba)) === mes)
      .sort((a, b) => (dataEvento(b, aba) > dataEvento(a, aba) ? 1 : -1))
  }, [comRef, corretor, mes, aba])

  const kpis = useMemo(() => {
    const qtd = filtrados.length
    const total = filtrados.reduce((s, l) => s + (l.valorNegociacao ?? 0), 0)
    const ticket = qtd ? Math.round(total / qtd) : 0
    const top = corretores
      .map((c) => ({ nome: c.nome, total: filtrados.filter((l) => l.corretorId === c.id).reduce((s, l) => s + (l.valorNegociacao ?? 0), 0) }))
      .sort((a, b) => b.total - a.total)[0]
    return { qtd, total, ticket, top: top?.nome ?? "—" }
  }, [filtrados, corretores])

  const porMes = useMemo(() => {
    const m = new Map<string, { key: string; total: number; qtd: number }>()
    for (const l of comRef) {
      if (corretor !== "todos" && l.corretorId !== corretor) continue
      const k = mesKey(dataEvento(l, aba))
      const e = m.get(k) ?? { key: k, total: 0, qtd: 0 }
      e.total += l.valorNegociacao ?? 0
      e.qtd += 1
      m.set(k, e)
    }
    return Array.from(m.values()).sort((a, b) => (a.key > b.key ? 1 : -1)).map((e) => ({ ...e, label: fmtMes(e.key) }))
  }, [comRef, corretor, aba])

  const porCorretor = useMemo(() => {
    const max = Math.max(...filtrados.map((l) => l.valorNegociacao ?? 0).concat([0]))
    return corretores
      .map((c) => {
        const lista = filtrados.filter((l) => l.corretorId === c.id)
        const total = lista.reduce((s, l) => s + (l.valorNegociacao ?? 0), 0)
        return { nome: c.nome.split(" ")[0], total, qtd: lista.length, pct: max ? Math.round((total / max) * 100) : 0 }
      })
      .filter((r) => r.qtd > 0)
      .sort((a, b) => b.total - a.total)
  }, [filtrados, corretores])

  const cor = aba === "fechamentos" ? "#16a34a" : "#b22222"
  const corLabel = aba === "fechamentos" ? "Fechado" : "Negociando"

  if (loading) {
    return (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 w-full lg:col-span-2" /><Skeleton className="h-64 w-full" />
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Fechamentos</h1>
          <p className="text-sm text-muted-foreground">Fechamentos e negociações mês a mês, por corretor e referência.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setAba("fechamentos")} className={tab(aba === "fechamentos")}>Fechamentos</button>
          <button onClick={() => setAba("negociacoes")} className={tab(aba === "negociacoes")}>Negociações</button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Filtrar por mês" className="w-44">
          <option value="todos">Todos os meses</option>
          {meses.map((m) => <option key={m} value={m}>{fmtMes(m)}</option>)}
        </Select>
        <Select value={corretor} onChange={(e) => setCorretor(e.target.value)} aria-label="Filtrar por corretor" className="w-52">
          <option value="todos">Todos os corretores</option>
          {corretores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </Select>
        <input
          value={buscaRef}
          onChange={(e) => setBuscaRef(e.target.value)}
          placeholder="Buscar por ref ou cliente..."
          className="w-60 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Handshake} label={aba === "fechamentos" ? "Fechamentos" : "Negociações"} value={String(kpis.qtd)} />
        <Kpi icon={Banknote} label="Valor total" value={brl(kpis.total)} accent />
        <Kpi icon={BadgeCheck} label="Ticket médio" value={brl(kpis.ticket)} />
        <Kpi icon={PieIcon} label="Corretor líder" value={kpis.top} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Mês a mês */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Mês a mês — total em {corLabel === "Fechado" ? "fechamentos" : "negociações"}</CardTitle></CardHeader>
          <CardContent>
            {porMes.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Nenhum registro neste período</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={porMes}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#71717a" tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 12 }} stroke="#71717a" tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v: number) => brl(v)} />
                  <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                    {porMes.map((_, i) => <Cell key={i} fill={cor} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Por corretor */}
        <Card>
          <CardHeader><CardTitle>Por corretor</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {porCorretor.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Sem dados no período</p>
            ) : porCorretor.map((r) => (
              <div key={r.nome} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{r.nome}</span>
                  <span className="text-muted-foreground">{r.qtd} · {brl(r.total)}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(r.pct, 4)}%`, background: cor }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Lista detalhada */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle>Detalhamento</CardTitle>
          <p className="text-xs text-muted-foreground">{mes === "todos" ? "Todos os meses" : fmtMes(mes)} · {filtrados.length} registro(s)</p>
        </CardHeader>
        <CardContent className="pt-4">
          {filtrados.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nenhum registro encontrado com os filtros atuais</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Data</th>
                    <th className="py-2 pr-3">Cliente</th>
                    <th className="py-2 pr-3">Referência</th>
                    <th className="py-2 pr-3">Corretor</th>
                    <th className="py-2 pr-3 text-right">Valor</th>
                    <th className="py-2 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((l) => (
                    <tr key={l.id} className="border-b border-border/60 last:border-0">
                      <td className="whitespace-nowrap py-2.5 pr-3 text-muted-foreground">{fmtDate(dataEvento(l, aba))}</td>
                      <td className="py-2.5 pr-3 font-medium">{l.nome}</td>
                      <td className="py-2.5 pr-3">{aba === "fechamentos" ? (l.refFechamento || refsTexto(l)) : (l.refProposta || refsTexto(l)) || "—"}</td>
                      <td className="py-2.5 pr-3">{userName(l.corretorId)}</td>
                      <td className="py-2.5 pr-3 text-right font-display font-bold text-primary">{brl(l.valorNegociacao)}</td>
                      <td className="py-2.5 pr-3"><Badge variant={aba === "fechamentos" ? "green" : "accent"}>{corLabel}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-5">
        <div className={`flex size-11 items-center justify-center rounded-lg ${accent ? "bg-accent/15 text-accent" : "bg-primary/10 text-primary"}`}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="truncate font-display text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function tab(active: boolean) {
  return `rounded-lg px-3 py-1.5 text-sm font-medium transition ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`
}
