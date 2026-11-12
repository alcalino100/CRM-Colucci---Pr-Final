"use client"

import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Cell } from "recharts"
import { brl } from "@/lib/labels"

export function FechamentoMesChart({
  porMes,
  cor,
}: {
  porMes: { label: string; total: number; key?: string; mes?: string; qtd?: number }[]
  cor: string
}) {
  if (porMes.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Nenhum registro neste período</p>
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={porMes}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#71717a" tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 12 }} stroke="#71717a" tickLine={false} axisLine={false} />
        <Tooltip formatter={(v: any) => brl(Number(v) || 0)} />
        <Bar dataKey="total" radius={[4, 4, 0, 0]}>
          {porMes.map((_, i) => (
            <Cell key={i} fill={cor} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
