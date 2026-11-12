"use client"

import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, AreaChart, Area } from "recharts"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/primitives"

const COLORS = ["#b22222", "#54595f", "#c41e24", "#a1a1aa", "#d4d4d8", "#e4a11b"]

export function LocacaoFunilCharts({
  leadsPorCorretor,
  origemData,
}: {
  leadsPorCorretor: { nome: string; total: number }[]
  origemData: { name: string; value: number }[]
}) {
  return (
    <div className="-mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
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
          {origemData.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Sem leads no período</p>
          ) : (
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
              <div className="h-[180px] w-[180px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={origemData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={false} isAnimationActive={false}>
                      {origemData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex w-full min-w-0 flex-col gap-2">
                {origemData.map((d, i) => {
                  const total = origemData.reduce((s, x) => s + x.value, 0)
                  const pct = total ? Math.round((d.value / total) * 100) : 0
                  return (
                    <div key={d.name} className="flex items-center gap-2 text-sm">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="min-w-0 flex-1 truncate text-foreground">{d.name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground"><span className="font-semibold text-foreground">{d.value}</span> · {pct}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function LocacaoTendenciaChart({
  tendencia,
  periodoLabel,
}: {
  tendencia: { label: string; total: number; dia?: string }[]
  periodoLabel: string
}) {
  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle>Tendência de cadastros</CardTitle>
        <p className="text-xs text-muted-foreground">{periodoLabel}</p>
      </CardHeader>
      <CardContent className="pt-4">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={tendencia}>
            <defs>
              <linearGradient id="gradTendenciaLocacao" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#b22222" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#b22222" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#71717a" tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#71717a" tickLine={false} axisLine={false} width={28} />
            <Tooltip />
            <Area type="monotone" dataKey="total" name="Leads" stroke="#b22222" strokeWidth={2} fill="url(#gradTendenciaLocacao)" />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
