"use client"

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts"
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/primitives"
import { STATUS_LABEL, STATUS_VARIANT } from "@/lib/labels"
import type { LeadStatus } from "@/lib/mock-data"

interface CadastrosChartProps {
  porDia: { key: string; label: string; total: number }[]
  porStatus: [LeadStatus, number][]
  porOrigem: { origem: string; total: number }[]
}

export function CadastrosChart({ porDia, porStatus, porOrigem }: CadastrosChartProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Cadastros por dia */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Cadastros Novos por Dia</CardTitle>
          <p className="text-xs text-muted-foreground">Distribuição diária baseada na data de entrada no CRM</p>
        </CardHeader>
        <CardContent>
          {porDia.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nenhum lead cadastrado no período</p>
          ) : (
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
          )}
        </CardContent>
      </Card>

      {/* Resumo */}
      <Card>
        <CardHeader>
          <CardTitle>Resumo do Período</CardTitle>
          <p className="text-xs text-muted-foreground">Status e canais de aquisição</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Por status
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {porStatus.length === 0 && <p className="text-sm text-muted-foreground">Sem dados</p>}
              {porStatus.map(([s, n]) => (
                <Badge key={s} variant={STATUS_VARIANT[s]}>
                  {STATUS_LABEL[s]} · {n}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Por origem
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {porOrigem.length === 0 && <p className="text-sm text-muted-foreground">Sem dados</p>}
              {porOrigem.map((r) => (
                <Badge key={r.origem} variant="gray">
                  {r.origem} · {r.total}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
