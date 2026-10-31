"use client"

// components/meta-ads/executive-report.tsx
// Relatório Executivo de Tráfego Pago & Retorno Real sobre Investimento
// Formatação para apresentação para diretoria, exportação PDF e cópia instantânea para WhatsApp.

import { useState } from "react"
import { Printer, Share2, Copy, Check, TrendingUp, CircleDollarSign, Target, Award, Sparkles } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/primitives"
import { brl } from "@/lib/labels"
import type { CampaignReconciliation, CorretorPerformanceTráfego, TotaisReconciliacao } from "@/lib/meta/reconciliation"

interface Props {
  reconciliacoes: CampaignReconciliation[]
  corretores: CorretorPerformanceTráfego[]
  totais: TotaisReconciliacao
  periodoStr: string
}

const fmt = (n: number, d = 0) => n.toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: d })
const brl2 = (v?: number) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }))

export default function ExecutiveReport({ reconciliacoes, corretores, totais, periodoStr }: Props) {
  const [copiado, setCopiado] = useState(false)

  // Top campanha por ROAS
  const topCampanha = [...reconciliacoes].sort((a, b) => b.roasComissao - a.roasComissao)[0]
  // Pior campanha com gasto sem visitas
  const piorCampanha = [...reconciliacoes]
    .filter((r) => r.spend > 400 && r.crmVisitasAgendadas + r.crmVisitasRealizadas === 0)
    .sort((a, b) => b.spend - a.spend)[0]

  function gerarTextoWhatsApp() {
    const texto = `📊 *RELATÓRIO EXECUTIVO META ADS & CRM*
🏢 *Imobiliária Colucci* · Período: ${periodoStr}

💰 *FINANCEIRO REAL*
• Investimento Meta Ads: *${brl2(totais.gastoTotalMeta)}*
• VGV Fechado (Vendas/Locação): *${brl2(totais.vgvTotalFechado)}*
• Comissão Real Gerada: *${brl2(totais.comissaoTotalFechada)}*
• ROAS Real (Comissão/Gasto): *${totais.roasComissaoGeral.toFixed(2)}x* (${(totais.roasComissaoGeral * 100).toFixed(0)}%)

🎯 *FUNIL DE CONVERSÃO*
• Cliques nos Anúncios: ${fmt(totais.cliquesTotal)}
• Leads reportados pelo Meta: ${fmt(totais.resultadosTotalMeta)}
• Leads efetivos no CRM: ${fmt(totais.leadsTotalCrm)}
• Visitas Agendadas/Feitas: ${fmt(totais.visitasTotal)}
• Negócios Concluídos: ${fmt(totais.fechamentosTotal)}
• CPL Real: ${brl2(totais.cplRealMedio)}
• CPV Real (Custo por Visita): ${brl2(totais.cpvRealMedio)}
• CAC Real (Custo por Venda): ${totais.cacRealMedio > 0 ? brl2(totais.cacRealMedio) : "—"}

🏆 *DESTAQUE POSITIVO*
${
  topCampanha && topCampanha.comissaoFechada > 0
    ? `• "${topCampanha.campaignName}" gerou ${brl2(topCampanha.comissaoFechada)} em comissão (ROAS ${topCampanha.roasComissao.toFixed(1)}x)`
    : `• "${topCampanha?.campaignName || "Geral"}" teve o melhor custo por lead.`
}

${
  piorCampanha
    ? `⚠️ *PONTO DE ATENÇÃO (GARGALO)*
• "${piorCampanha.campaignName}" consumiu ${brl2(piorCampanha.spend)} sem nenhuma visita agendada. Recomendada revisão de criativo ou público.`
    : `✅ Todas as campanhas ativas converteram em visitas ou negócios.`
}

Gerado automaticamente via Colucci CRM Analytics.`

    navigator.clipboard.writeText(texto)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 3000)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Barra de Ações Rápidas */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm print:hidden">
        <div>
          <h3 className="text-sm font-bold text-foreground">Relatório para Sócios e Diretoria</h3>
          <p className="text-xs text-muted-foreground">Período de referência: {periodoStr}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={gerarTextoWhatsApp}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-3.5 py-2 text-xs font-semibold text-foreground transition hover:bg-muted"
          >
            {copiado ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
            {copiado ? "Copiado para o WhatsApp!" : "Copiar Resumo p/ WhatsApp"}
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:brightness-110"
          >
            <Printer className="size-3.5" />
            Imprimir / Salvar PDF
          </button>
        </div>
      </div>

      {/* ÁREA DO RELATÓRIO EXECUTIVO (FORMATADO PARA VISUALIZAÇÃO E PRINT) */}
      <div className="flex flex-col gap-6 rounded-3xl border border-border bg-card p-6 shadow-md print:border-none print:shadow-none print:p-0">
        {/* Cabeçalho do Relatório */}
        <div className="flex items-start justify-between border-b border-border/80 pb-5">
          <div>
            <div className="inline-flex items-center gap-2 text-primary font-bold text-lg tracking-tight">
              <span>Colucci Imobiliária</span>
              <span className="text-xs font-medium text-muted-foreground">· CRM & Tráfego Pago</span>
            </div>
            <h1 className="mt-1 text-2xl font-black text-foreground">Prestação de Contas & Auditoria Meta Ads</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Reconciliação oficial de investimentos publicitários e receita gerada · {periodoStr}
            </p>
          </div>
          <Badge variant="green" className="text-xs px-3 py-1 font-semibold">
            ROAS {totais.roasComissaoGeral.toFixed(2)}x
          </Badge>
        </div>

        {/* Destaques Estratégicos com IA */}
        <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wide">
            <Sparkles className="size-4" />
            Diagnóstico Executivo de Tráfego
          </div>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed text-foreground">
            <div>
              <p>
                <strong>Retorno Financeiro:</strong> A cada R$ 1,00 investido em anúncios no Meta, a imobiliária
                faturou <strong>R$ {totais.roasComissaoGeral.toFixed(2)} em comissão líquida</strong>, totalizando{" "}
                <strong>{brl2(totais.comissaoTotalFechada)}</strong> de comissões e{" "}
                <strong>{brl2(totais.vgvTotalFechado)}</strong> em volume geral de vendas (VGV).
              </p>
            </div>
            <div>
              <p>
                <strong>Eficiência de Atendimento:</strong> Foram gerados{" "}
                <strong>{totais.leadsTotalCrm} leads reais</strong> no CRM, convertendo em{" "}
                <strong>{totais.visitasTotal} visitas presenciais</strong> e{" "}
                <strong>{totais.fechamentosTotal} contratos fechados</strong>. O custo real de aquisição por cliente (CAC)
                ficou em <strong>{totais.cacRealMedio > 0 ? brl2(totais.cacRealMedio) : "—"}</strong>.
              </p>
            </div>
          </div>
        </div>

        {/* Quadro Consolidado de Métricas */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Total Investido</span>
            <p className="mt-1 font-display text-xl font-bold text-foreground">{brl2(totais.gastoTotalMeta)}</p>
            <span className="text-[11px] text-muted-foreground">{fmt(totais.cliquesTotal)} cliques gerados</span>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Leads & CPL Real</span>
            <p className="mt-1 font-display text-xl font-bold text-primary">{fmt(totais.leadsTotalCrm)} leads</p>
            <span className="text-[11px] text-muted-foreground">CPL Real: {brl2(totais.cplRealMedio)}</span>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Visitas & CPV</span>
            <p className="mt-1 font-display text-xl font-bold text-amber-600">{fmt(totais.visitasTotal)} visitas</p>
            <span className="text-[11px] text-muted-foreground">CPV Real: {brl2(totais.cpvRealMedio)}</span>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Vendas & Comissão</span>
            <p className="mt-1 font-display text-xl font-bold text-emerald-600">{fmt(totais.fechamentosTotal)} vendas</p>
            <span className="text-[11px] font-bold text-emerald-700">{brl2(totais.comissaoTotalFechada)}</span>
          </div>
        </div>

        {/* Tabela Resumo das Principais Campanhas */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
            Detalhamento por Campanha (Top Desempenho)
          </h4>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-[11px] font-semibold text-muted-foreground border-b border-border">
                <tr>
                  <th className="py-2.5 pl-3 pr-2">Campanha</th>
                  <th className="py-2.5 pr-2 text-right">Gasto</th>
                  <th className="py-2.5 pr-2 text-right">Leads CRM</th>
                  <th className="py-2.5 pr-2 text-right">Visitas</th>
                  <th className="py-2.5 pr-2 text-right">Fechamentos</th>
                  <th className="py-2.5 pr-2 text-right">VGV</th>
                  <th className="py-2.5 pr-2 text-right">Comissão</th>
                  <th className="py-2.5 pr-3 text-right">ROAS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 tabular-nums">
                {reconciliacoes.slice(0, 8).map((r) => (
                  <tr key={r.campaignId}>
                    <td className="py-2 pl-3 pr-2 font-semibold text-foreground truncate max-w-52">
                      {r.campaignName}
                    </td>
                    <td className="py-2 pr-2 text-right">{brl(r.spend)}</td>
                    <td className="py-2 pr-2 text-right font-medium text-primary">{r.crmLeads}</td>
                    <td className="py-2 pr-2 text-right text-amber-600">{r.crmVisitasAgendadas + r.crmVisitasRealizadas}</td>
                    <td className="py-2 pr-2 text-right font-bold text-emerald-600">{r.crmFechados}</td>
                    <td className="py-2 pr-2 text-right">{r.vgvFechado > 0 ? brl(r.vgvFechado) : "—"}</td>
                    <td className="py-2 pr-2 text-right font-semibold text-foreground">
                      {r.comissaoFechada > 0 ? brl(r.comissaoFechada) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right font-bold text-emerald-600">
                      {r.spend > 0 ? `${r.roasComissao.toFixed(1)}x` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Rodapé de Assinatura / Validação */}
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between border-t border-border pt-4 text-[11px] text-muted-foreground">
          <span>Relatório gerado em {new Date().toLocaleDateString("pt-BR")} às {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
          <span>Colucci CRM · Imobiliária & Inteligência de Tráfego</span>
        </div>
      </div>
    </div>
  )
}
