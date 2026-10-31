"use client"

// components/meta-ads/audit-reconciliation.tsx
// Painel de Auditoria & Reconciliação: Meta Ads × Dados Reais do CRM
// Compara o que o Meta reporta com os fechamentos, visitas e receita do mundo real.

import { useState, useMemo } from "react"
import {
  TrendingUp, Users, Target, CircleDollarSign, ArrowUpRight, ArrowDownRight,
  ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Search, HelpCircle,
  Award, Eye, Calendar, UserCheck
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, Badge, Input } from "@/components/ui/primitives"
import { brl } from "@/lib/labels"
import { cn } from "@/lib/utils"
import type { CampaignReconciliation, CorretorPerformanceTráfego, TotaisReconciliacao } from "@/lib/meta/reconciliation"

interface Props {
  reconciliacoes: CampaignReconciliation[]
  corretores: CorretorPerformanceTráfego[]
  totais: TotaisReconciliacao
  loading?: boolean
}

const fmt = (n: number, d = 0) => n.toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: d })
const brl2 = (v?: number) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }))

export default function AuditReconciliation({ reconciliacoes, corretores, totais, loading }: Props) {
  const [busca, setBusca] = useState("")
  const [filtroSaude, setFiltroSaude] = useState<string>("todos")

  const filtradas = useMemo(() => {
    return reconciliacoes.filter((r) => {
      const bateNome = r.campaignName.toLowerCase().includes(busca.toLowerCase()) || r.campaignId.includes(busca)
      const bateSaude = filtroSaude === "todos" || r.statusSaude === filtroSaude
      return bateNome && bateSaude
    })
  }, [reconciliacoes, busca, filtroSaude])

  return (
    <div className="flex flex-col gap-6">
      {/* 1. HERO CARDS - UNIT ECONOMICS & BOTTOM-LINE REAL */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* ROAS Real em Comissão */}
        <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-card to-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">ROAS Real (Comissão)</span>
            <span className="flex size-8 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600">
              <TrendingUp className="size-4.5" />
            </span>
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-emerald-600 sm:text-3xl">
            {totais.roasComissaoGeral.toFixed(2)}x
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Comissão gerada: <strong className="text-foreground">{brl2(totais.comissaoTotalFechada)}</strong>
          </p>
          <div className="mt-2 text-[11px] text-emerald-700">
            Retorno direto sobre R$ {totais.gastoTotalMeta.toFixed(0)} investidos
          </div>
        </div>

        {/* Faturamento Total em VGV Fechado */}
        <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">VGV Fechado</span>
            <span className="flex size-8 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <CircleDollarSign className="size-4.5" />
            </span>
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-foreground sm:text-3xl">
            {brl2(totais.vgvTotalFechado)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Contratos: <strong className="text-foreground">{totais.fechamentosTotal} fechados</strong>
          </p>
          <div className="mt-2 text-[11px] text-primary">
            ROAS VGV: <strong>{totais.roasVgvGeral.toFixed(1)}x</strong> do valor investido
          </div>
        </div>

        {/* Custo por Fechamento (CAC Real) */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">CAC Real (Aquisição)</span>
            <span className="flex size-8 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Target className="size-4.5" />
            </span>
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-foreground sm:text-3xl">
            {totais.cacRealMedio > 0 ? brl2(totais.cacRealMedio) : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Custo real por venda ou locação concluída
          </p>
          <div className="mt-2 text-[11px] text-muted-foreground">
            CPV (Custo por Visita): <strong className="text-foreground">{totais.cpvRealMedio > 0 ? brl2(totais.cpvRealMedio) : "—"}</strong>
          </div>
        </div>

        {/* Discrepância Meta vs CRM */}
        <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-card to-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Discrepância de Leads</span>
            <span className="flex size-8 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600">
              <AlertTriangle className="size-4.5" />
            </span>
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-amber-600 sm:text-3xl">
            {totais.taxaDiscrepanciaGeral.toFixed(1)}%
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Meta: {totais.resultadosTotalMeta} leads · CRM: <strong className="text-foreground">{totais.leadsTotalCrm} no banco</strong>
          </p>
          <div className="mt-2 text-[11px] text-amber-700">
            CPL Meta: {brl2(totais.cplMetaMedio)} · CPL Real: <strong className="text-foreground">{brl2(totais.cplRealMedio)}</strong>
          </div>
        </div>
      </div>

      {/* 2. FUNIL DE CONVERSÃO REAL DO TRÁFEGO PAGO */}
      <Card className="rounded-2xl overflow-hidden border border-border shadow-sm">
        <CardHeader className="border-b border-border/50 bg-muted/20 px-5 py-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <ShieldCheck className="size-5 text-primary" />
                Funil Real de Tráfego Pago (Auditoria Meta × CRM)
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Do primeiro clique no anúncio até o contrato assinado e comissão faturada
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-block size-2 rounded-full bg-emerald-500" />
              <span>Base consolidada do período selecionado</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {/* Etapa 1: Cliques no Anúncio */}
            <div className="flex flex-col rounded-xl border border-border bg-muted/15 p-3 text-center">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">1. Cliques</span>
              <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{fmt(totais.cliquesTotal)}</p>
              <span className="mt-1 text-[11px] text-muted-foreground">{totais.impressoesTotal > 0 ? `${((totais.cliquesTotal / totais.impressoesTotal) * 100).toFixed(2)}% CTR` : "—"}</span>
            </div>

            {/* Etapa 2: Leads Reportados Meta */}
            <div className="flex flex-col rounded-xl border border-border bg-muted/15 p-3 text-center">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">2. Meta Results</span>
              <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{fmt(totais.resultadosTotalMeta)}</p>
              <span className="mt-1 text-[11px] text-muted-foreground">{totais.cliquesTotal > 0 ? `${((totais.resultadosTotalMeta / totais.cliquesTotal) * 100).toFixed(1)}% dos cliques` : "—"}</span>
            </div>

            {/* Etapa 3: Leads no CRM */}
            <div className="flex flex-col rounded-xl border border-primary/20 bg-primary/5 p-3 text-center">
              <span className="text-[11px] uppercase tracking-wide text-primary font-semibold">3. Leads CRM</span>
              <p className="mt-1 text-xl font-bold tabular-nums text-primary">{fmt(totais.leadsTotalCrm)}</p>
              <span className="mt-1 text-[11px] text-muted-foreground">
                {totais.resultadosTotalMeta > 0 ? `${((totais.leadsTotalCrm / totais.resultadosTotalMeta) * 100).toFixed(0)}% retidos` : "—"}
              </span>
            </div>

            {/* Etapa 4: Visitas Agendadas/Feitas */}
            <div className="flex flex-col rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-center">
              <span className="text-[11px] uppercase tracking-wide text-amber-600 font-semibold">4. Visitas</span>
              <p className="mt-1 text-xl font-bold tabular-nums text-amber-600">{fmt(totais.visitasTotal)}</p>
              <span className="mt-1 text-[11px] text-muted-foreground">
                {totais.leadsTotalCrm > 0 ? `${((totais.visitasTotal / totais.leadsTotalMédia(totais.leadsTotalCrm)) * 100).toFixed(1)}% dos leads` : "—"}
              </span>
            </div>

            {/* Etapa 5: Fechamentos */}
            <div className="flex flex-col rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
              <span className="text-[11px] uppercase tracking-wide text-emerald-600 font-semibold">5. Fechamentos</span>
              <p className="mt-1 text-xl font-bold tabular-nums text-emerald-600">{fmt(totais.fechamentosTotal)}</p>
              <span className="mt-1 text-[11px] text-muted-foreground">
                {totais.visitasTotal > 0 ? `${((totais.fechamentosTotal / totais.visitasTotal) * 100).toFixed(0)}% das visitas` : "—"}
              </span>
            </div>

            {/* Etapa 6: Comissão Gerada */}
            <div className="flex flex-col rounded-xl border border-emerald-600/30 bg-emerald-600/10 p-3 text-center">
              <span className="text-[11px] uppercase tracking-wide text-emerald-700 font-semibold">6. Comissão</span>
              <p className="mt-1 text-lg font-bold tabular-nums text-emerald-700">{brl(totais.comissaoTotalFechada)}</p>
              <span className="mt-1 text-[11px] font-semibold text-emerald-700">{totais.roasComissaoGeral.toFixed(1)}x de retorno</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. TABELA DE AUDITORIA DE CAMPANHAS COM FUNIL DETALHADO */}
      <Card className="rounded-2xl overflow-hidden border border-border shadow-sm">
        <CardHeader className="border-b border-border/50 bg-muted/15 px-5 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Target className="size-5 text-primary" />
                Auditoria de Campanhas — Meta vs. CRM
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Cruzamento de gastos do Meta com conversões reais no funil da imobiliária
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Filtro de Saúde */}
              <div className="flex items-center rounded-lg border border-border bg-card p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setFiltroSaude("todos")}
                  className={cn("px-2.5 py-1 rounded-md transition", filtroSaude === "todos" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground")}
                >
                  Todas ({reconciliacoes.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroSaude("excelente")}
                  className={cn("px-2 py-1 rounded-md transition", filtroSaude === "excelente" ? "bg-emerald-600 text-white font-semibold" : "text-muted-foreground hover:text-foreground")}
                >
                  Lucrativas
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroSaude("critico")}
                  className={cn("px-2 py-1 rounded-md transition", filtroSaude === "critico" ? "bg-red-600 text-white font-semibold" : "text-muted-foreground hover:text-foreground")}
                >
                  Gargalos
                </button>
              </div>

              {/* Busca */}
              <div className="relative w-48">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar campanha..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 text-[11px] font-semibold text-muted-foreground border-b border-border">
                <tr>
                  <th className="py-3 pl-4 pr-3 min-w-48">Campanha</th>
                  <th className="py-3 pr-3 text-right">Gasto Meta</th>
                  <th className="py-3 pr-3 text-right">Leads Meta</th>
                  <th className="py-3 pr-3 text-right">Leads CRM</th>
                  <th className="py-3 pr-3 text-right">CPL Real</th>
                  <th className="py-3 pr-3 text-right">Visitas</th>
                  <th className="py-3 pr-3 text-right">Fechamentos</th>
                  <th className="py-3 pr-3 text-right">Comissão Real</th>
                  <th className="py-3 pr-3 text-right">ROAS Real</th>
                  <th className="py-3 pr-4 text-center">Diagnóstico</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 tabular-nums">
                {filtradas.map((r) => {
                  const ehLucrativo = r.roasComissao >= 1
                  const ehCritico = r.statusSaude === "critico"

                  return (
                    <tr key={r.campaignId} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 pl-4 pr-3 font-medium text-foreground">
                        <div className="flex flex-col">
                          <span className="truncate max-w-56 font-semibold" title={r.campaignName}>
                            {r.campaignName}
                          </span>
                          <span className="text-[10px] text-muted-foreground">ID: {r.campaignId}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-right font-semibold text-foreground">{brl(r.spend)}</td>
                      <td className="py-3 pr-3 text-right text-muted-foreground">{fmt(r.metaResults)}</td>
                      <td className="py-3 pr-3 text-right font-semibold text-primary">{fmt(r.crmLeads)}</td>
                      <td className="py-3 pr-3 text-right text-foreground">{r.crmLeads > 0 ? brl(r.cplReal) : "—"}</td>
                      <td className="py-3 pr-3 text-right font-medium text-amber-600">
                        {fmt(r.crmVisitasAgendadas + r.crmVisitasRealizadas)}
                      </td>
                      <td className="py-3 pr-3 text-right font-bold text-emerald-600">{fmt(r.crmFechados)}</td>
                      <td className="py-3 pr-3 text-right font-semibold text-foreground">
                        {r.comissaoFechada > 0 ? brl(r.comissaoFechada) : "—"}
                      </td>
                      <td className="py-3 pr-3 text-right">
                        {r.spend > 0 ? (
                          <span className={cn("inline-flex items-center font-bold px-1.5 py-0.5 rounded text-[11px]", ehLucrativo ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground")}>
                            {r.roasComissao.toFixed(1)}x
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3 pr-4 text-center">
                        <Badge
                          variant={
                            r.statusSaude === "excelente" || r.statusSaude === "lucrativo"
                              ? "green"
                              : r.statusSaude === "critico"
                              ? "red"
                              : "amber"
                          }
                          className="text-[10px]"
                        >
                          {r.statusSaude === "excelente"
                            ? "Excelente"
                            : r.statusSaude === "lucrativo"
                            ? "Lucrativo"
                            : r.statusSaude === "critico"
                            ? "Gargalo"
                            : "Monitorar"}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
                {filtradas.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-muted-foreground">
                      Nenhuma campanha encontrada com os filtros selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 4. PERFORMANCE POR CORRETOR - LEADS DE TRÁFEGO PAGO */}
      <Card className="rounded-2xl overflow-hidden border border-border shadow-sm">
        <CardHeader className="border-b border-border/50 bg-muted/15 px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <UserCheck className="size-5 text-primary" />
                Performance de Conversão por Corretor (Tráfego Pago)
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Quais corretores convertem melhor os leads vindos dos anúncios do Meta
              </p>
            </div>
            <Award className="size-5 text-muted-foreground/60" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 text-[11px] font-semibold text-muted-foreground border-b border-border">
                <tr>
                  <th className="py-3 pl-4 pr-3">Corretor</th>
                  <th className="py-3 pr-3 text-right">Leads Recebidos</th>
                  <th className="py-3 pr-3 text-right">Visitas Realizadas</th>
                  <th className="py-3 pr-3 text-right">Taxa Visita/Lead</th>
                  <th className="py-3 pr-3 text-right">Fechamentos</th>
                  <th className="py-3 pr-3 text-right">Taxa Fechamento</th>
                  <th className="py-3 pr-3 text-right">VGV Fechado</th>
                  <th className="py-3 pr-4 text-right">Comissão Gerada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 tabular-nums">
                {corretores.map((c, idx) => (
                  <tr key={c.corretorId} className="hover:bg-muted/20 transition-colors">
                    <td className="py-3 pl-4 pr-3 font-semibold text-foreground flex items-center gap-2">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                        {idx + 1}
                      </span>
                      {c.corretorNome}
                    </td>
                    <td className="py-3 pr-3 text-right font-medium text-foreground">{fmt(c.leadsRecebidos)}</td>
                    <td className="py-3 pr-3 text-right font-medium text-amber-600">{fmt(c.visitasRealizadas)}</td>
                    <td className="py-3 pr-3 text-right text-muted-foreground">{c.taxaConversaoVisita.toFixed(1)}%</td>
                    <td className="py-3 pr-3 text-right font-bold text-emerald-600">{fmt(c.fechamentos)}</td>
                    <td className="py-3 pr-3 text-right font-semibold text-emerald-600">
                      {c.taxaConversaoFechamento.toFixed(1)}%
                    </td>
                    <td className="py-3 pr-3 text-right font-medium text-foreground">{c.vgvFechado > 0 ? brl(c.vgvFechado) : "—"}</td>
                    <td className="py-3 pr-4 text-right font-bold text-emerald-700">
                      {c.comissaoFechada > 0 ? brl(c.comissaoFechada) : "—"}
                    </td>
                  </tr>
                ))}
                {corretores.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-muted-foreground">
                      Nenhum corretor com leads de tráfego pago no período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function totaisLeadsMédia(n: number): number {
  return n > 0 ? n : 1
}
