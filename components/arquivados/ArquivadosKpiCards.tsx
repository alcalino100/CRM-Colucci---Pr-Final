"use client"

import { Archive, CalendarDays, Clock, Sparkles } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives"
import { MOTIVO_ARQUIVAMENTO_LABEL, type MotivoArquivamento } from "@/lib/mock-data"
import type { KpisArquivados } from "@/lib/arquivados-utils"

export function ArquivadosKpiCards({ kpis }: { kpis: KpisArquivados }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Arquivados
          </CardTitle>
          <Archive className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{kpis.total}</div>
          <p className="text-xs text-muted-foreground mt-1">Leads em hibernação na equipe</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Reaparecem em 30d
          </CardTitle>
          <Clock className="size-4 text-amber-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-amber-600">{kpis.reaparece30d}</div>
          <p className="text-xs text-muted-foreground mt-1">
            {kpis.vencidos > 0 ? (
              <span className="text-red-600 font-medium">{kpis.vencidos} já com prazo vencido</span>
            ) : (
              "Prontos para reativação diária"
            )}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Taxa de Vendas Reativadas
          </CardTitle>
          <Sparkles className="size-4 text-emerald-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-emerald-600">{kpis.taxaConversao}%</div>
          <p className="text-xs text-muted-foreground mt-1">
            {kpis.reativadosVenda} de {kpis.totalReativados} reativados viraram fechamento
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Motivo Principal
          </CardTitle>
          <CalendarDays className="size-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-base font-bold truncate">
            {kpis.motivosOrdenados[0]
              ? MOTIVO_ARQUIVAMENTO_LABEL[kpis.motivosOrdenados[0][0] as MotivoArquivamento] ||
                kpis.motivosOrdenados[0][0]
              : "Nenhum"}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {kpis.motivosOrdenados[0]
              ? `${kpis.motivosOrdenados[0][1]} lead(s) com este motivo`
              : "Sem dados"}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
