"use client"

import React from "react"
import { Shield, RefreshCw, ArrowRight, AlertCircle, Clock } from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent, Badge } from "@/components/ui/primitives"
import { cn } from "@/lib/utils"
import { formatarTelefone } from "@/lib/automation-dashboard-utils"

export type AbaContencao = "elegiveis" | "aguardando"

export interface LeadContencao {
  id: string
  nome: string
  telefone?: string | null
  dias_silencio: number
  horas_silencio: number
  ultima_mensagem?: string | null
  job_status?: string | null
}

export interface ResgateData {
  metricas?: {
    total_atendimento_ia?: number
    parados_24h?: number
    elegiveis_contencao?: number
    aguardando_resposta?: number
  }
  elegiveis?: LeadContencao[]
  aguardando_resposta_leads?: LeadContencao[]
}

interface ContencaoIaSectionProps {
  visitante: boolean
  resgateData: ResgateData | null
  resgateLoading: boolean
  resgateTriggering: boolean
  onExecutarResgate: () => void
  abaContencao: AbaContencao
  onChangeAbaContencao: (aba: AbaContencao) => void
}

export function ContencaoIaSection({
  visitante,
  resgateData,
  resgateLoading,
  resgateTriggering,
  onExecutarResgate,
  abaContencao,
  onChangeAbaContencao,
}: ContencaoIaSectionProps) {
  return (
    <Card className="border-border/80 shadow-xs border-l-4 border-l-amber-500">
      <CardHeader className="pb-3 border-b border-border/60 bg-amber-500/5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Shield className="size-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-bold text-foreground">
                  Plano de Contenção & Resgate de Atendimento IA
                </CardTitle>
                <Badge variant="amber">Resgate Ativo</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Analisa caso a caso leads que pararam de responder à IA, envia mensagem acolhedora de continuidade e transfere para Follow-up.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="blue">Instâncias da Patrícia</Badge>
            <Badge variant="green">Anti-Ban 30 msgs/linha</Badge>
            {!visitante && (
              <button
                onClick={onExecutarResgate}
                disabled={resgateTriggering || resgateLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-100/80 px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-200 disabled:opacity-50 dark:border-amber-700/60 dark:bg-amber-950/60 dark:text-amber-200"
              >
                <RefreshCw className={cn("size-3.5", resgateTriggering && "animate-spin")} />
                {resgateTriggering ? "Disparando Resgate..." : "Executar Resgate IA"}
              </button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-5">
        {/* 4 Cards de Métricas da Contenção */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border/70 bg-card p-3.5">
            <p className="text-xs font-medium text-muted-foreground">Total em Atendimento IA</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-foreground">
              {resgateData?.metricas?.total_atendimento_ia ?? 149}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">Leads atualmente nessa etapa</p>
          </div>

          <div className="rounded-xl border border-border/70 bg-card p-3.5">
            <p className="text-xs font-medium text-muted-foreground">Silenciosos há +24h</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-amber-600 dark:text-amber-400">
              {resgateData?.metricas?.parados_24h ?? 137}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">Sem interação recente</p>
          </div>

          <div className="rounded-xl border border-emerald-300/60 bg-emerald-50/30 p-3.5 dark:border-emerald-800/40 dark:bg-emerald-950/10">
            <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
              Elegíveis para Contenção
            </p>
            <p className="mt-1 text-2xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">
              {resgateData?.metricas?.elegiveis_contencao ?? 110}
            </p>
            <p className="mt-1 text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
              IA falou por último (lead silenciou)
            </p>
          </div>

          <div className="rounded-xl border border-blue-300/60 bg-blue-50/30 p-3.5 dark:border-blue-800/40 dark:bg-blue-950/10">
            <p className="text-xs font-medium text-blue-800 dark:text-blue-300">
              Aguardando Resposta Nossa
            </p>
            <p className="mt-1 text-2xl font-black tabular-nums text-blue-600 dark:text-blue-400">
              {resgateData?.metricas?.aguardando_resposta ?? 27}
            </p>
            <p className="mt-1 text-[11px] text-blue-700/80 dark:text-blue-400/80">
              Lead falou por último (triagem)
            </p>
          </div>
        </div>

        {/* Template e Fluxo de Transição */}
        <div className="rounded-xl border border-amber-200/70 bg-amber-50/40 p-4 dark:border-amber-800/40 dark:bg-amber-950/20">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-amber-200/80 px-2 py-0.5 text-[11px] font-bold text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
                  MENSAGEM DE RESGATE HUMANIZADA
                </span>
                <span className="text-xs text-muted-foreground">Disparo via WhatsApp Patrícia</span>
              </div>
              <div className="rounded-lg border border-amber-200/80 bg-background/80 p-3 text-xs italic text-foreground shadow-xs">
                &ldquo;Oi [Nome], tudo bem? 😊 Notei que você não respondeu mais por aqui... Ainda tem interesse nas opções de imóveis ou surgiu alguma dúvida? Se precisar de algo ou quiser retomar depois, é só me avisar aqui!&rdquo;
              </div>
            </div>

            <div className="md:w-80 space-y-2 rounded-lg border border-border/60 bg-background/60 p-3 text-xs">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <ArrowRight className="size-3.5 text-amber-500" />
                Plano de Ação do Fluxo:
              </p>
              <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                <li>Disparo em conta-gotas (25s a 45s de respiro anti-ban).</li>
                <li>Move status imediatamente de <strong className="text-foreground">Atendimento IA</strong> para <strong className="text-foreground">Follow-up</strong>.</li>
                <li>Libera semáforo da IA (<code className="text-[10px] bg-muted px-1 py-0.2 rounded">ai_responding = false</code>).</li>
                <li>Insere na régua de nutrição (D+1, D+2, D+3) para não perder o cliente.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Listagem Interativa de Leads Diagnosticados */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => onChangeAbaContencao("elegiveis")}
                className={cn(
                  "rounded-lg px-3 py-1 text-xs font-semibold transition",
                  abaContencao === "elegiveis"
                    ? "bg-amber-500 text-white shadow-xs"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                Elegíveis para Resgate ({resgateData?.metricas?.elegiveis_contencao ?? 110})
              </button>

              <button
                onClick={() => onChangeAbaContencao("aguardando")}
                className={cn(
                  "rounded-lg px-3 py-1 text-xs font-semibold transition",
                  abaContencao === "aguardando"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                Aguardando Resposta Humana ({resgateData?.metricas?.aguardando_resposta ?? 27})
              </button>
            </div>

            <span className="text-[11px] text-muted-foreground hidden sm:inline">
              {abaContencao === "elegiveis"
                ? "Amostra dos leads elegíveis para o envio imediato"
                : "Leads que falaram por último e precisam de resposta manual/IA"}
            </span>
          </div>

          {abaContencao === "aguardando" && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-300">
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="size-4 text-blue-600 dark:text-blue-400" />
                Proteção Anti-Desconexão:
              </div>
              <p className="mt-1 text-[11px] leading-relaxed">
                Estes {resgateData?.metricas?.aguardando_resposta ?? 27} leads enviaram uma pergunta ou mensagem recente para a imobiliária. Por isso, o sistema <strong>bloqueia preventivamente</strong> o envio da mensagem &ldquo;Notei que você não respondeu&rdquo;, evitando ruído de comunicação. Eles devem ser respondidos pela equipe ou atendente da IA no chat.
              </p>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-border/70">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border/60 bg-muted/40 text-muted-foreground font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Lead</th>
                  <th className="py-2.5 px-3">Telefone</th>
                  <th className="py-2.5 px-3">Tempo Parado</th>
                  <th className="py-2.5 px-3">Última Mensagem</th>
                  <th className="py-2.5 px-3 text-right">Ação / Fila</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {abaContencao === "elegiveis" ? (
                  (resgateData?.elegiveis ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-muted-foreground">
                        {resgateLoading ? "Carregando diagnóstico..." : "Nenhum lead pendente de resgate no momento."}
                      </td>
                    </tr>
                  ) : (
                    (resgateData?.elegiveis ?? []).map((lead) => (
                      <tr key={lead.id} className="hover:bg-muted/30 transition">
                        <td className="py-2.5 px-3 font-semibold text-foreground">{lead.nome}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{formatarTelefone(lead.telefone)}</td>
                        <td className="py-2.5 px-3">
                          <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
                            <Clock className="size-3" />
                            {lead.dias_silencio >= 1 ? `há ${lead.dias_silencio} dias` : `há ${lead.horas_silencio}h`}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 max-w-xs truncate text-muted-foreground" title={lead.ultima_mensagem ?? undefined}>
                          {lead.ultima_mensagem || "—"}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {lead.job_status ? (
                            <Badge variant="blue">{lead.job_status}</Badge>
                          ) : (
                            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              Pronto p/ Resgate
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )
                ) : (
                  (resgateData?.aguardando_resposta_leads ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-muted-foreground">
                        {resgateLoading ? "Carregando diagnóstico..." : "Nenhum lead aguardando resposta humana."}
                      </td>
                    </tr>
                  ) : (
                    (resgateData?.aguardando_resposta_leads ?? []).map((lead) => (
                      <tr key={lead.id} className="hover:bg-muted/30 transition">
                        <td className="py-2.5 px-3 font-semibold text-foreground">{lead.nome}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{formatarTelefone(lead.telefone)}</td>
                        <td className="py-2.5 px-3">
                          <span className="inline-flex items-center gap-1 font-medium text-blue-600 dark:text-blue-400">
                            <Clock className="size-3" />
                            {lead.dias_silencio >= 1 ? `há ${lead.dias_silencio} dias` : `há ${lead.horas_silencio}h`}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 max-w-xs truncate text-foreground font-medium" title={lead.ultima_mensagem ?? undefined}>
                          💬 {lead.ultima_mensagem || "—"}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                            Triagem Humana
                          </span>
                        </td>
                      </tr>
                    ))
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
