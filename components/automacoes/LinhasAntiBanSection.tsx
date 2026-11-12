"use client"

import React from "react"
import { Smartphone } from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent, Badge } from "@/components/ui/primitives"
import { cn } from "@/lib/utils"

export const MAX_ENVIOS_LINHA_DIA = 30

export interface LinhaStat {
  connId: string
  nome: string
  numero: string
  status: string
  enviadasHoje: number
  respondidasHoje: number
  taxaHoje: number
  fila: number
}

interface LinhasAntiBanSectionProps {
  linhasStats: LinhaStat[] | null
}

export function LinhasAntiBanSection({ linhasStats }: LinhasAntiBanSectionProps) {
  const capacidadeTotal = ((linhasStats?.length ?? 2) * MAX_ENVIOS_LINHA_DIA)

  return (
    <Card className="border-border/80 shadow-xs">
      <CardHeader className="pb-3 border-b border-border/60">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <Smartphone className="size-4" />
            </div>
            <div>
              <CardTitle className="text-base font-bold">
                Linhas WhatsApp & Cota de Segurança Anti-Ban
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Controle de tráfego por chip WhatsApp com teto estrito de <strong>{MAX_ENVIOS_LINHA_DIA} mensagens/dia por linha</strong> e rotação automática.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Capacidade Total Hoje: <strong>{capacidadeTotal} msgs</strong>
            </span>
            <Badge variant="amber">Teto: 30 msgs/linha/dia</Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5">
        {linhasStats && linhasStats.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {linhasStats.map((l) => {
              const percentual = Math.min(100, Math.round((l.enviadasHoje / MAX_ENVIOS_LINHA_DIA) * 100))
              const atingiuTeto = l.enviadasHoje >= MAX_ENVIOS_LINHA_DIA
              const restantes = Math.max(0, MAX_ENVIOS_LINHA_DIA - l.enviadasHoje)
              const conectado = l.status === "conectado"

              return (
                <div
                  key={l.connId}
                  className={cn(
                    "rounded-xl border p-4 transition-all",
                    atingiuTeto
                      ? "border-amber-300 bg-amber-50/20 dark:border-amber-800 dark:bg-amber-950/10"
                      : "border-border/80 bg-card hover:border-primary/40"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "size-2.5 rounded-full shrink-0",
                            conectado ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                          )}
                        />
                        <h4 className="font-bold text-sm text-foreground">{l.nome}</h4>
                        <Badge variant={conectado ? "green" : "red"}>
                          {conectado ? "Conectado" : "Desconectado"}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground font-mono">
                        {l.numero}
                      </p>
                    </div>

                    <div className="text-right">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums",
                          l.enviadasHoje >= 28
                            ? "bg-red-100 text-red-700"
                            : l.enviadasHoje >= 20
                            ? "bg-amber-100 text-amber-700"
                            : "bg-emerald-100 text-emerald-700"
                        )}
                      >
                        {l.enviadasHoje} / {MAX_ENVIOS_LINHA_DIA}
                      </span>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {restantes > 0 ? `${restantes} restantes hoje` : "Cota atingida"}
                      </p>
                    </div>
                  </div>

                  {/* Barra de Progresso do Teto Anti-Ban */}
                  <div className="mt-4">
                    <div className="flex justify-between text-[11px] font-medium text-muted-foreground mb-1">
                      <span>Consumo da Cota Diária</span>
                      <span>{percentual}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          l.enviadasHoje >= 28
                            ? "bg-red-500"
                            : l.enviadasHoje >= 20
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        )}
                        style={{ width: `${percentual}%` }}
                      />
                    </div>
                  </div>

                  {/* Métricas secundárias da linha */}
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-center">
                    <div>
                      <p className="text-sm font-bold tabular-nums text-foreground">{l.respondidasHoje}</p>
                      <p className="text-[10px] text-muted-foreground">Respostas</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{l.taxaHoje}%</p>
                      <p className="text-[10px] text-muted-foreground">Taxa</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold tabular-nums text-amber-600 dark:text-amber-400">{l.fila}</p>
                      <p className="text-[10px] text-muted-foreground">Fila Prevista</p>
                    </div>
                  </div>

                  {atingiuTeto && (
                    <div className="mt-3 rounded-md bg-amber-100/70 p-2 text-[11px] text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                      ⚠️ <strong>Teto de segurança atingido:</strong> Novos envios serão redirecionados para a linha secundária ou agendados com segurança para amanhã a partir das 08:00.
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma linha configurada nas automações no momento.
          </p>
        )}

        <div className="mt-4 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground border border-border/60">
          🛡️ <strong>Regra de Rodízio Seguro:</strong> O sistema prioriza a mesma linha em que o lead já conversou anteriormente para manter coerência. Se a linha primária atingir 30 mensagens no dia, a esteira transfere os próximos leads automaticamente para a linha secundária com cota disponível, garantindo estabilidade operacional contínua sem risco de bloqueio pelo WhatsApp.
        </div>
      </CardContent>
    </Card>
  )
}
