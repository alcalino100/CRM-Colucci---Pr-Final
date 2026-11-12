"use client"

import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/primitives"

export function DashboardTendenciaChart({
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
  )
}
