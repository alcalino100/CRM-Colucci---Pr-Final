"use client"

import { Clock, Gauge, MessagesSquare, Smile, Timer, UserRoundCheck } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/primitives"
import { INDICADORES_DEMO as D } from "@/lib/assistente/demo-data"
import { ROTULO_INTENCAO } from "@/lib/assistente"

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
  const max = Math.max(...D.porIntencao.map((x) => x.total))
  const horas = Math.floor(D.minutosEconomizados / 60)
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Badge variant="gray">dados de demonstração · últimas 24h</Badge></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi icone={MessagesSquare} rotulo="Atendimentos" valor={String(D.atendimentos24h)} />
        <Kpi icone={Gauge} rotulo="Resolvidos pela IA" valor={`${D.resolvidosIaPct}%`} detalhe={`${D.transferidos} transferidos à equipe`} />
        <Kpi icone={Timer} rotulo="Tempo médio de resposta" valor={`${D.tempoMedioRespostaSeg}s`} />
        <Kpi icone={Clock} rotulo="Tempo economizado" valor={`${horas}h`} detalhe="estimativa da equipe" />
        <Kpi icone={Smile} rotulo="Satisfação" valor={D.satisfacao.toLocaleString("pt-BR")} detalhe="nota média de 1 a 5" />
        <Kpi icone={UserRoundCheck} rotulo="Transferências" valor={String(D.transferidos)} />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle>Assuntos mais frequentes</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {D.porIntencao.map((x) => (
            <div key={x.intencao}>
              <div className="mb-1 flex justify-between text-sm"><span>{ROTULO_INTENCAO[x.intencao]}</span><span className="tabular-nums text-muted-foreground">{x.total}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(x.total / max) * 100}%` }} /></div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
