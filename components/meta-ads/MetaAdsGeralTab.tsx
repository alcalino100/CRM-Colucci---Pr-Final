"use client"

import React, { useState } from "react"
import {
  CircleDollarSign,
  Eye,
  MousePointerClick,
  Percent,
  Coins,
  BarChart3,
  Users,
  Target,
  ChevronRight,
} from "lucide-react"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from "@/components/ui/primitives"
import { cn } from "@/lib/utils"
import { brl } from "@/lib/labels"
import { fmt, type Nivel, NIVEL_LABEL } from "@/lib/meta-ads-utils"
import { extrairResultadosMeta } from "@/lib/meta/reconciliation"
import { StatusBadge, Kpi, ChartTip, Vazio, CreativeCard } from "./MetaAdsUiAtoms"

interface TrilhaItem {
  nivel: Nivel
  id: string
  nome: string
  creativeId?: string
  status?: string
}

interface MetaAdsGeralTabProps {
  conta: any
  trilha: TrilhaItem[]
  onSetTrilha: React.Dispatch<React.SetStateAction<TrilhaItem[]>>
  selecionado: { nivel: Nivel; id: string; nome: string; creativeId?: string; status?: string } | null
  nivelFilho: Nivel | null
  kpi: any
  kpiPrev: any
  comparar: boolean
  loadIns: boolean
  insAtual: any
  insDiario: any
  insFilhos: any
  filhos: any
  loadFilhos: boolean
  serie: Array<{ dia: string; gasto: number; resultados: number }>
  barras: Array<{ nome: string; gasto: number; resultados: number }>
  insPorFilho: Map<string, any>
  leadsPorCampanha: Map<string, number>
}

export function MetaAdsGeralTab({
  conta,
  trilha,
  onSetTrilha,
  selecionado,
  nivelFilho,
  kpi,
  kpiPrev,
  comparar,
  loadIns,
  insAtual,
  insDiario,
  insFilhos,
  filhos,
  loadFilhos,
  serie,
  barras,
  insPorFilho,
  leadsPorCampanha,
}: MetaAdsGeralTabProps) {
  const [compacto, setCompacto] = useState(false)

  function drill(
    nivel: Nivel,
    id: string,
    nome: string,
    extra?: { creativeId?: string; status?: string }
  ) {
    onSetTrilha((t) => [...t, { nivel, id, nome, ...extra }])
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Breadcrumb do drill-down */}
      <nav aria-label="Navegação da hierarquia" className="flex flex-wrap items-center gap-1.5 text-sm">
        <button
          type="button"
          className="rounded-lg px-2 py-1 font-medium text-primary transition hover:bg-primary/10"
          onClick={() => onSetTrilha([])}
        >
          {conta?.name ?? "Conta"}
        </button>
        {trilha.map((t, i) => (
          <span key={t.id} className="flex items-center gap-1.5">
            <ChevronRight className="size-4 text-muted-foreground/50" />
            <button
              type="button"
              className={cn(
                "rounded-lg px-2 py-1 font-medium transition",
                i === trilha.length - 1
                  ? "bg-card text-foreground ring-1 ring-border shadow-sm"
                  : "text-primary hover:bg-primary/10"
              )}
              onClick={() => onSetTrilha((arr) => arr.slice(0, i + 1))}
            >
              <span className="mr-1 text-xs font-normal text-muted-foreground">
                {NIVEL_LABEL[t.nivel]}:
              </span>
              {t.nome}
            </button>
          </span>
        ))}
      </nav>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {loadIns ? (
          Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
        ) : (
          <>
            <Kpi
              icon={CircleDollarSign}
              label="Gasto total"
              value={brl(kpi.spend)}
              prev={comparar ? kpiPrev.spend : undefined}
              cur={kpi.spend}
              invert
            />
            <Kpi
              icon={Eye}
              label="Impressões"
              value={fmt(kpi.impressions)}
              prev={comparar ? kpiPrev.impressions : undefined}
              cur={kpi.impressions}
            />
            <Kpi
              icon={MousePointerClick}
              label="Cliques"
              value={fmt(kpi.clicks)}
              prev={comparar ? kpiPrev.clicks : undefined}
              cur={kpi.clicks}
            />
            <Kpi
              icon={Percent}
              label="CTR"
              value={`${fmt(kpi.ctr, 2)}%`}
              prev={comparar ? kpiPrev.ctr : undefined}
              cur={kpi.ctr}
            />
            <Kpi
              icon={Coins}
              label="CPC"
              value={brl(kpi.cpc)}
              prev={comparar ? kpiPrev.cpc : undefined}
              cur={kpi.cpc}
              invert
            />
            <Kpi
              icon={BarChart3}
              label="CPM"
              value={brl(kpi.cpm)}
              prev={comparar ? kpiPrev.cpm : undefined}
              cur={kpi.cpm}
              invert
            />
            <Kpi
              icon={Users}
              label="Resultados (leads)"
              value={fmt(kpi.results)}
              prev={comparar ? kpiPrev.results : undefined}
              cur={kpi.results}
              accent
            />
            <Kpi
              icon={Target}
              label="Custo por resultado"
              value={kpi.results ? brl(kpi.cpr) : "—"}
              prev={comparar ? kpiPrev.cpr : undefined}
              cur={kpi.cpr}
              invert
            />
          </>
        )}
      </div>

      {/* Gráficos */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Evolução diária — gasto × resultados</CardTitle>
          </CardHeader>
          <CardContent>
            {!insDiario ? (
              <Skeleton className="h-64 rounded-xl" />
            ) : serie.length === 0 ? (
              <Vazio texto="Sem dados no período selecionado." />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradGasto" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#b22222" stopOpacity={0.32} />
                        <stop offset="100%" stopColor="#b22222" stopOpacity={0} />
                      </linearGradient>
                      <filter id="glowGastoL" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="3.5" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                      <filter id="glowResultL" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis
                      dataKey="dia"
                      tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      yAxisId="g"
                      tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                      width={54}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      yAxisId="r"
                      orientation="right"
                      tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                      width={34}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<ChartTip />} cursor={{ stroke: "var(--color-border)" }} />
                    <Legend
                      formatter={(v) => (
                        <span className="text-xs font-medium text-muted-foreground">{v}</span>
                      )}
                    />
                    <Area
                      yAxisId="g"
                      type="monotone"
                      dataKey="gasto"
                      name="Gasto (R$)"
                      stroke="#b22222"
                      strokeWidth={2.5}
                      fill="url(#gradGasto)"
                      dot={false}
                      activeDot={{ r: 5, fill: "#b22222", strokeWidth: 2, stroke: "#fff" }}
                    />
                    <Line
                      yAxisId="g"
                      type="monotone"
                      dataKey="gasto"
                      name="GastoGlow"
                      stroke="#b22222"
                      strokeWidth={7}
                      strokeOpacity={0.22}
                      dot={false}
                      filter="url(#glowGastoL)"
                      legendType="none"
                      tooltipType="none"
                    />
                    <Line
                      yAxisId="r"
                      type="monotone"
                      dataKey="resultados"
                      name="Resultados"
                      stroke="#64748b"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 5, fill: "#64748b", strokeWidth: 2, stroke: "#fff" }}
                    />
                    <Line
                      yAxisId="r"
                      type="monotone"
                      dataKey="resultados"
                      name="ResultadosGlow"
                      stroke="#64748b"
                      strokeWidth={7}
                      strokeOpacity={0.18}
                      dot={false}
                      filter="url(#glowResultL)"
                      legendType="none"
                      tooltipType="none"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>
              Comparação entre {nivelFilho ? NIVEL_LABEL[nivelFilho].toLowerCase() + "s" : "itens"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!insFilhos && nivelFilho ? (
              <Skeleton className="h-64 rounded-xl" />
            ) : barras.length === 0 ? (
              <Vazio
                texto={
                  nivelFilho
                    ? "Nenhum item com dados no período."
                    : "Nível de anúncio não possui subitens."
                }
              />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={barras}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    barCategoryGap="28%"
                  >
                    <defs>
                      <linearGradient id="gradBar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#c41e24" />
                        <stop offset="100%" stopColor="#b22222" />
                      </linearGradient>
                      <filter id="glowBar" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="2.5" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                      <filter id="glowResultB" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="2" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis
                      dataKey="nome"
                      tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                      interval={0}
                      angle={-12}
                      height={48}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                      width={54}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<ChartTip />} cursor={{ fill: "var(--color-muted)", opacity: 0.4 }} />
                    <Legend
                      formatter={(v) => (
                        <span className="text-xs font-medium text-muted-foreground">{v}</span>
                      )}
                    />
                    <Bar
                      dataKey="gasto"
                      name="Gasto (R$)"
                      fill="url(#gradBar)"
                      radius={[6, 6, 0, 0]}
                      filter="url(#glowBar)"
                    />
                    <Bar
                      dataKey="resultados"
                      name="Resultados"
                      fill="#64748b"
                      radius={[6, 6, 0, 0]}
                      filter="url(#glowResultB)"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabela detalhada / drill-down */}
      {nivelFilho ? (
        <Card className="rounded-2xl">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>
              {NIVEL_LABEL[nivelFilho]}s{" "}
              {selecionado && selecionado.nivel !== "account" ? `de "${selecionado.nome}"` : ""}
            </CardTitle>
            <button
              type="button"
              onClick={() => setCompacto((v) => !v)}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground"
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
              <div className="relative">
                <div
                  className="pointer-events-none absolute inset-y-0 right-0 z-20 w-8 bg-gradient-to-l from-card to-transparent"
                  aria-hidden="true"
                />
                <div className="max-h-[32rem] overflow-auto overscroll-x-contain rounded-xl border border-border">
                  <table className="w-full text-xs sm:text-sm">
                    <thead className="sticky top-0 z-10 bg-card">
                      <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="sticky left-0 z-20 min-w-52 max-w-64 bg-card py-2.5 pl-4 pr-3 font-semibold">
                          Nome
                        </th>
                        <th className="min-w-24 py-2.5 pr-3 font-semibold">Status</th>
                        {!compacto && nivelFilho === "campaign" && (
                          <th className="min-w-28 py-2.5 pr-3 font-semibold">Objetivo</th>
                        )}
                        {!compacto && (
                          <th className="min-w-[110px] border-l border-border/60 py-2.5 pl-3 pr-3 text-right font-semibold">
                            Orçamento/dia
                          </th>
                        )}
                        <th
                          className={cn(
                            "min-w-[100px] py-2.5 pr-3 text-right font-semibold",
                            compacto && "border-l border-border/60 pl-3"
                          )}
                        >
                          Gasto
                        </th>
                        {!compacto && (
                          <th className="min-w-[90px] border-l border-border/60 py-2.5 pl-3 pr-3 text-right font-semibold">
                            Impr.
                          </th>
                        )}
                        <th
                          className={cn(
                            "min-w-[90px] py-2.5 pr-3 text-right font-semibold",
                            compacto && "border-l border-border/60 pl-3"
                          )}
                        >
                          Cliques
                        </th>
                        <th className="min-w-[80px] py-2.5 pr-3 text-right font-semibold">CTR</th>
                        {!compacto && (
                          <th className="min-w-[90px] py-2.5 pr-3 text-right font-semibold">CPC</th>
                        )}
                        {!compacto && (
                          <th className="min-w-[90px] py-2.5 pr-3 text-right font-semibold">CPM</th>
                        )}
                        {!compacto && (
                          <th className="min-w-[95px] border-l border-border/60 py-2.5 pl-3 pr-3 text-right font-semibold">
                            Alcance
                          </th>
                        )}
                        {!compacto && (
                          <th className="min-w-[80px] py-2.5 pr-3 text-right font-semibold">Freq.</th>
                        )}
                        <th className="min-w-[90px] border-l border-border/60 py-2.5 pl-3 pr-3 text-right font-semibold">
                          Result.
                        </th>
                        <th className="min-w-[110px] py-2.5 pr-3 text-right font-semibold">
                          Custo/Result.
                        </th>
                        {nivelFilho === "campaign" && (
                          <th className="min-w-[95px] border-l border-border/60 py-2.5 pl-3 pr-3 text-right font-semibold">
                            Leads CRM
                          </th>
                        )}
                        {nivelFilho === "campaign" && (
                          <th className="min-w-[95px] py-2.5 pr-4 text-right font-semibold">CPL real</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {(filhos?.data ?? []).map((f: any) => {
                        const i = insPorFilho.get(f.id)
                        const res = i ? extrairResultadosMeta(i) : 0
                        const spend = Number(i?.spend ?? 0)
                        const crmLeads =
                          nivelFilho === "campaign" ? leadsPorCampanha.get(f.id) ?? 0 : 0

                        return (
                          <tr
                            key={f.id}
                            className="group border-b border-border/60 transition-colors hover:bg-primary/[0.03]"
                          >
                            <td className="sticky left-0 z-10 min-w-52 max-w-64 bg-card py-2.5 pl-4 pr-3 group-hover:bg-primary/[0.03]">
                              <button
                                type="button"
                                title={f.name}
                                className="block w-full truncate text-left font-medium text-primary transition hover:text-primary/80 hover:underline"
                                onClick={() =>
                                  drill(nivelFilho, f.id, f.name, {
                                    creativeId: f.creative?.id,
                                    status: f.effective_status,
                                  })
                                }
                              >
                                {f.name}
                              </button>
                              {nivelFilho === "campaign" && f.start_time && (
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {f.start_time.slice(0, 10).split("-").reverse().join("/")}
                                  {f.stop_time
                                    ? ` – ${f.stop_time.slice(0, 10).split("-").reverse().join("/")}`
                                    : ""}
                                </p>
                              )}
                            </td>
                            <td className="py-2.5 pr-3">
                              <StatusBadge s={f.effective_status} />
                            </td>
                            {!compacto && nivelFilho === "campaign" && (
                              <td className="py-2.5 pr-3 text-xs">
                                {(f.objective || "—").replace("OUTCOME_", "")}
                              </td>
                            )}
                            {!compacto && (
                              <td className="border-l border-border/60 py-2.5 pl-3 pr-3 text-right">
                                {f.daily_budget ? brl(Number(f.daily_budget) / 100) : "—"}
                              </td>
                            )}
                            <td
                              className={cn(
                                "py-2.5 pr-3 text-right font-semibold text-foreground",
                                compacto && "border-l border-border/60 pl-3"
                              )}
                            >
                              {brl(spend)}
                            </td>
                            {!compacto && (
                              <td className="border-l border-border/60 py-2.5 pl-3 pr-3 text-right">
                                {fmt(Number(i?.impressions ?? 0))}
                              </td>
                            )}
                            <td
                              className={cn(
                                "py-2.5 pr-3 text-right",
                                compacto && "border-l border-border/60 pl-3"
                              )}
                            >
                              {fmt(Number(i?.clicks ?? 0))}
                            </td>
                            <td className="py-2.5 pr-3 text-right">{fmt(Number(i?.ctr ?? 0), 2)}%</td>
                            {!compacto && (
                              <td className="py-2.5 pr-3 text-right">{brl(Number(i?.cpc ?? 0))}</td>
                            )}
                            {!compacto && (
                              <td className="py-2.5 pr-3 text-right">{brl(Number(i?.cpm ?? 0))}</td>
                            )}
                            {!compacto && (
                              <td className="border-l border-border/60 py-2.5 pl-3 pr-3 text-right">
                                {fmt(Number(i?.reach ?? 0))}
                              </td>
                            )}
                            {!compacto && (
                              <td className="py-2.5 pr-3 text-right">
                                {fmt(Number(i?.frequency ?? 0), 2)}
                              </td>
                            )}
                            <td className="border-l border-border/60 py-2.5 pl-3 pr-3 text-right font-semibold text-primary">
                              {fmt(res)}
                            </td>
                            <td className="py-2.5 pr-3 text-right">{res ? brl(spend / res) : "—"}</td>
                            {nivelFilho === "campaign" && (
                              <td className="border-l border-border/60 py-2.5 pl-3 pr-3 text-right font-semibold">
                                {crmLeads}
                              </td>
                            )}
                            {nivelFilho === "campaign" && (
                              <td className="py-2.5 pr-4 text-right">
                                {crmLeads ? brl(spend / crmLeads) : "—"}
                              </td>
                            )}
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
        selecionado && (
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Criativo do anúncio</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <CreativeCard
                ad={{
                  id: selecionado.id,
                  name: selecionado.nome,
                  effective_status: (selecionado as any).status ?? "ACTIVE",
                  creative: { id: (selecionado as any).creativeId ?? `cr_${selecionado.id}` },
                }}
                ins={insAtual?.data?.[0]}
                adsetNome={trilha.length >= 2 ? trilha[trilha.length - 2].nome : "—"}
              />
            </CardContent>
          </Card>
        )
      )}

      {/* Grid de criativos ao navegar em um conjunto */}
      {selecionado?.nivel === "adset" && (filhos?.data ?? []).length > 0 && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Criativos do conjunto</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(filhos?.data ?? []).map((ad: any) => (
              <CreativeCard
                key={ad.id}
                ad={ad}
                ins={insPorFilho.get(ad.id)}
                adsetNome={selecionado.nome}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
