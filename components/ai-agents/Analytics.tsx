"use client"
import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, Select, Skeleton, useToast } from "@/components/ui/primitives"
import { BarChart3 } from "lucide-react"
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

type Dados = {
  respostas: number
  conversas: number
  escalados: number
  taxa_resolucao: number
  tempo_medio_ms: number
  tempo_min_ms: number
  tempo_max_ms: number
  tokens: number
  tokens_mes: number
  custo_mes_usd: number
  por_motivo: { motivo: string; total: number }[]
  por_dia: { dia: string; respostas: number; escalacoes: number }[]
  amostra_metricas: number
}

const CORES = ["#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#10b981", "#ec4899"]

const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`)

export function Analytics({ id }: { id: string }) {
  const toast = useToast()
  const [dias, setDias] = useState(7)
  const [dados, setDados] = useState<Dados | null>(null)
  const [loading, setLoading] = useState(true)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/ai/${encodeURIComponent(id)}/analytics?days=${dias}`)
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || "falha ao carregar")
      setDados(j)
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Erro ao carregar analytics", "error")
    } finally {
      setLoading(false)
    }
  }, [id, dias, toast])

  useEffect(() => {
    void carregar()
  }, [carregar])

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600"><BarChart3 className="size-5" /></div>
          <div><h3 className="font-display text-base font-bold">Analytics</h3><p className="text-xs text-muted-foreground">Performance real da IA (métricas gravadas a cada resposta)</p></div>
        </div>
        <Select value={String(dias)} onChange={(e) => setDias(Number(e.target.value))} className="h-8 w-32 text-xs">
          <option value="7">7 dias</option>
          <option value="14">14 dias</option>
          <option value="30">30 dias</option>
        </Select>
      </div>

      {loading || !dados ? (
        <div className="grid grid-cols-3 gap-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{dados.taxa_resolucao}%</p><p className="text-xs text-muted-foreground">Taxa de resolução (sem escalação)</p></CardContent></Card>
            <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{fmtMs(dados.tempo_medio_ms)}</p><p className="text-xs text-muted-foreground">Tempo médio resposta (min {fmtMs(dados.tempo_min_ms)} · máx {fmtMs(dados.tempo_max_ms)})</p></CardContent></Card>
            <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">US$ {dados.custo_mes_usd.toFixed(2)}</p><p className="text-xs text-muted-foreground">Custo API estimado (30d · {dados.tokens_mes.toLocaleString("pt-BR")} tokens)</p></CardContent></Card>
            <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{dados.respostas}</p><p className="text-xs text-muted-foreground">Respostas IA ({dados.conversas} conversas)</p></CardContent></Card>
            <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-amber-600">{dados.escalados}</p><p className="text-xs text-muted-foreground">Escalados p/ humano</p></CardContent></Card>
            <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{dados.tokens.toLocaleString("pt-BR")}</p><p className="text-xs text-muted-foreground">Tokens no período</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-sm">Respostas × escalações por dia</CardTitle></CardHeader>
            <CardContent className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dados.por_dia}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="dia" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="respostas" stroke="#06b6d4" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="escalacoes" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Escalações por motivo</CardTitle></CardHeader>
            <CardContent className="h-56">
              {dados.por_motivo.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma escalação no período 🎉</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={dados.por_motivo} dataKey="total" nameKey="motivo" outerRadius={80} label={(e: { motivo?: string; percent?: number }) => `${String(e.motivo ?? "").slice(0, 24)} (${Math.round((e.percent ?? 0) * 100)}%)`}>
                      {dados.por_motivo.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {dados.amostra_metricas === 0 && (
            <p className="text-xs text-muted-foreground">Tempo/custo/tokens começam a aparecer após as próximas respostas (métricas gravadas desde este deploy).</p>
          )}
        </>
      )}
    </div>
  )
}
