"use client"

import { useState } from "react"
import { AlertTriangle, Bot, Clock, Gauge, MessagesSquare, Smile, Timer, UserRoundCheck } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, Select } from "@/components/ui/primitives"
import { ROTULO_INTENCAO, type Indicadores as TIndicadores } from "@/lib/assistente"
import { FonteBadge } from "./FonteBadge"
import { useApi } from "./use-api"

function Kpi({ icone: Icone, rotulo, valor, detalhe }: { icone: React.ComponentType<{ className?: string }>; rotulo: string; valor: string; detalhe?: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <span className="rounded-lg bg-primary/10 p-2 text-primary"><Icone className="size-5" /></span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{rotulo}</p>
          <p className="font-display text-2xl font-bold tabular-nums">{valor}</p>
          {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

export function Indicadores() {
  const [dias, setDias] = useState(1)
  const { dados, erro } = useApi<{ fonte: string; indicadores: TIndicadores }>(`/api/assistente/indicadores?dias=${dias}`)
  const D = dados?.indicadores
  const max = Math.max(1, ...(D?.porIntencao.map((x) => x.total) ?? [1]))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <FonteBadge fonte={dados?.fonte} />
        <Select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="h-9 w-auto" aria-label="Período">
          <option value={1}>Últimas 24h</option>
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
        </Select>
      </div>
      {erro && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
      {!D ? <p className="py-10 text-center text-muted-foreground">Carregando…</p> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Kpi icone={MessagesSquare} rotulo="Atendimentos" valor={String(D.atendimentos)} />
            <Kpi icone={Gauge} rotulo="Resolvidos pela IA" valor={`${D.resolvidosIaPct}%`} detalhe={`${D.transferidos} com a equipe`} />
            <Kpi icone={Timer} rotulo="Tempo médio de resposta" valor={D.tempoMedioRespostaSeg === null ? "—" : `${D.tempoMedioRespostaSeg}s`} />
            <Kpi icone={Clock} rotulo="Tempo economizado" valor={D.minutosEconomizados >= 60 ? `${Math.floor(D.minutosEconomizados / 60)}h` : `${D.minutosEconomizados} min`} detalhe="estimativa: 4 min por atendimento resolvido" />
            <Kpi icone={Smile} rotulo="Satisfação" valor={D.satisfacao === null ? "—" : D.satisfacao.toLocaleString("pt-BR")} detalhe={D.satisfacao === null ? "pesquisa ainda não ativada" : "nota média de 1 a 5"} />
            <Kpi icone={UserRoundCheck} rotulo="Transferências" valor={String(D.transferidos)} />
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><Bot className="size-4" /> Saúde da IA (Claude)</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {D.ia.tentativas === 0
                ? <p className="text-muted-foreground">Nenhuma resposta conduzida pela IA no período.</p>
                : <p><strong>{D.ia.ok}</strong> de <strong>{D.ia.tentativas}</strong> respostas foram conduzidas pelo Claude ({Math.round((D.ia.ok / D.ia.tentativas) * 100)}%). Nas outras {D.ia.falhas}, o atendimento seguiu pelo fluxo de regras.</p>}
              {D.ia.falhas > 0 && D.ia.ultimoErro && <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> Último motivo: {D.ia.ultimoErro}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle>Assuntos mais frequentes</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {D.porIntencao.length === 0 && <p className="text-sm text-muted-foreground">Sem atendimentos no período.</p>}
              {D.porIntencao.map((x) => (
                <div key={x.intencao}>
                  <div className="mb-1 flex justify-between text-sm"><span>{ROTULO_INTENCAO[x.intencao]}</span><span className="tabular-nums text-muted-foreground">{x.total}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(x.total / max) * 100}%` }} /></div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
