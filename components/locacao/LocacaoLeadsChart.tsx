"use client"

import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Cell } from "recharts"

export function LocacaoLeadsChart({
  porDia,
}: {
  porDia: { label: string; total: number; key?: string; dia?: string }[]
}) {
  if (porDia.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Nenhum lead cadastrado no período</p>
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={porDia}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#71717a" tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#71717a" tickLine={false} axisLine={false} />
        <Tooltip />
        <Bar dataKey="total" radius={[4, 4, 0, 0]}>
          {porDia.map((_, i) => (
            <Cell key={i} fill="#b22222" />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
