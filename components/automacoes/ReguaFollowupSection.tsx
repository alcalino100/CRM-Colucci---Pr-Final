"use client"

import React from "react"
import { Clock, CheckCircle2 } from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent, Badge } from "@/components/ui/primitives"

export interface EtapaFollowupStats {
  enviados: number
  respondidos: number
  taxa: number
}

export interface CadenciaStatsData {
  d1: EtapaFollowupStats
  d2: EtapaFollowupStats
  d3: EtapaFollowupStats
}

interface ReguaFollowupSectionProps {
  cadenciaStats: CadenciaStatsData | null
}

export function ReguaFollowupSection({ cadenciaStats }: ReguaFollowupSectionProps) {
  return (
    <Card className="border-border/80 shadow-xs">
      <CardHeader className="pb-3 border-b border-border/60">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Clock className="size-4" />
            </div>
            <div>
              <CardTitle className="text-base font-bold">
                Régua Sequencial de Follow-up (D+1, D+2, D+3)
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Sequência progressiva de 3 toques humanizados para leads sem resposta, com cancelamento imediato ao interagir.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="blue">Intervalo de 24h entre etapas</Badge>
            <Badge variant="green">Anti-Ban Ativo</Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Etapa D+1 */}
          <div className="relative flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 transition-all hover:border-primary/40 hover:shadow-xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                  ETAPA 1 · D+1 (24h)
                </span>
                <span className="text-[11px] text-muted-foreground">24h de silêncio</span>
              </div>

              <h4 className="mt-3 font-semibold text-sm text-foreground">
                Continuidade Suave & Acolhimento
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Pergunta leve sobre as opções enviadas pelo corretor e se restou alguma dúvida de valores ou localização.
              </p>

              <div className="mt-3 rounded-lg bg-muted/60 p-2.5 text-xs italic text-muted-foreground border border-border/40">
                &ldquo;Oi [Nome], tudo bem? 😊 Passando rapidinho para saber se conseguiu dar uma olhada nas opções de imóveis...&rdquo;
              </div>
            </div>

            <div className="mt-4 border-t border-border/60 pt-3">
              <div className="grid grid-cols-3 gap-1 text-center">
                <div>
                  <p className="text-base font-bold tabular-nums text-foreground">
                    {cadenciaStats?.d1.enviados ?? 0}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Enviados</p>
                </div>
                <div>
                  <p className="text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {cadenciaStats?.d1.respondidos ?? 0}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Responderam</p>
                </div>
                <div>
                  <p className="text-base font-bold tabular-nums text-blue-600 dark:text-blue-400">
                    {cadenciaStats?.d1.taxa ?? 0}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">Conversão</p>
                </div>
              </div>
            </div>
          </div>

          {/* Etapa D+2 */}
          <div className="relative flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 transition-all hover:border-primary/40 hover:shadow-xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  ETAPA 2 · D+2 (48h)
                </span>
                <span className="text-[11px] text-muted-foreground">48h de silêncio</span>
              </div>

              <h4 className="mt-3 font-semibold text-sm text-foreground">
                Novas Opções & Geração de Valor
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Apresenta novidades no portfólio Colucci que se encaixam no perfil, convidando a ver fotos sem compromisso.
              </p>

              <div className="mt-3 rounded-lg bg-muted/60 p-2.5 text-xs italic text-muted-foreground border border-border/40">
                &ldquo;Olá [Nome]! Surgiram 2 novas opções aqui na Colucci que se encaixam bastante no perfil que você buscava...&rdquo;
              </div>
            </div>

            <div className="mt-4 border-t border-border/60 pt-3">
              <div className="grid grid-cols-3 gap-1 text-center">
                <div>
                  <p className="text-base font-bold tabular-nums text-foreground">
                    {cadenciaStats?.d2.enviados ?? 0}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Enviados</p>
                </div>
                <div>
                  <p className="text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {cadenciaStats?.d2.respondidos ?? 0}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Responderam</p>
                </div>
                <div>
                  <p className="text-base font-bold tabular-nums text-amber-600 dark:text-amber-400">
                    {cadenciaStats?.d2.taxa ?? 0}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">Conversão</p>
                </div>
              </div>
            </div>
          </div>

          {/* Etapa D+3 */}
          <div className="relative flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 transition-all hover:border-primary/40 hover:shadow-xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                  ETAPA 3 · D+3 (72h)
                </span>
                <span className="text-[11px] text-muted-foreground">72h de silêncio</span>
              </div>

              <h4 className="mt-3 font-semibold text-sm text-foreground">
                Fechamento Educado (Breakup)
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Encerramento amigável para não ser invasivo, deixando as portas abertas para o cliente retomar no momento dele.
              </p>

              <div className="mt-3 rounded-lg bg-muted/60 p-2.5 text-xs italic text-muted-foreground border border-border/40">
                &ldquo;Olá [Nome]! Como não tive mais seu retorno, estou encerrando as notificações para não incomodar... Tenha uma excelente semana! ✨&rdquo;
              </div>
            </div>

            <div className="mt-4 border-t border-border/60 pt-3">
              <div className="grid grid-cols-3 gap-1 text-center">
                <div>
                  <p className="text-base font-bold tabular-nums text-foreground">
                    {cadenciaStats?.d3.enviados ?? 0}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Enviados</p>
                </div>
                <div>
                  <p className="text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {cadenciaStats?.d3.respondidos ?? 0}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Responderam</p>
                </div>
                <div>
                  <p className="text-base font-bold tabular-nums text-purple-600 dark:text-purple-400">
                    {cadenciaStats?.d3.taxa ?? 0}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">Conversão</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Alerta de inteligência de desarmamento */}
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-emerald-200/80 bg-emerald-50/50 p-3 text-xs text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/20 dark:text-emerald-200">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>
            <strong>Desarme Imediato de Etapas:</strong> No momento em que o lead responde qualquer mensagem ou um corretor envia uma mensagem manual, todos os passos seguintes de follow-up são automaticamente cancelados no banco (<code className="bg-emerald-100/80 dark:bg-emerald-900/60 px-1 py-0.5 rounded text-[11px]">cancelled_lead_replied</code> / <code className="bg-emerald-100/80 dark:bg-emerald-900/60 px-1 py-0.5 rounded text-[11px]">cancelled_human</code>), garantindo zero mensagens duplicadas.
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
