"use client"

import { useMemo, useState } from "react"
import { Card, Badge } from "@/components/ui/primitives"
import { ATENDIMENTOS_DEMO, type StatusAtendimento } from "@/lib/assistente/demo-data"
import { ROTULO_DEPARTAMENTO, ROTULO_INTENCAO } from "@/lib/assistente"

const STATUS: Record<StatusAtendimento, { rotulo: string; variante: string }> = {
  resolvido_ia: { rotulo: "Resolvido pela IA", variante: "green" },
  transferido: { rotulo: "Transferido", variante: "amber" },
  aguardando_cliente: { rotulo: "Aguardando cliente", variante: "blue" },
}

export function Atendimentos() {
  const [filtro, setFiltro] = useState<"todos" | StatusAtendimento>("todos")
  const lista = useMemo(() => ATENDIMENTOS_DEMO.filter((a) => filtro === "todos" || a.status === filtro), [filtro])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["todos", "resolvido_ia", "transferido", "aguardando_cliente"] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFiltro(f)} className={`rounded-full border px-3 py-1 text-xs transition ${filtro === f ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
            {f === "todos" ? "Todos" : STATUS[f].rotulo}
          </button>
        ))}
        <Badge variant="gray" className="ml-auto">dados de demonstração</Badge>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Protocolo</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Assunto</th>
                <th className="px-4 py-3">Encaminhado a</th>
                <th className="px-4 py-3">Situação</th>
                <th className="px-4 py-3 text-right">Duração</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((a) => (
                <tr key={a.protocolo} className="border-t border-border">
                  <td className="px-4 py-3 font-mono text-xs">{a.protocolo}</td>
                  <td className="px-4 py-3"><p className="font-medium">{a.cliente}</p><p className="text-xs text-muted-foreground">{a.perfil} · {a.quando}</p></td>
                  <td className="px-4 py-3">{ROTULO_INTENCAO[a.intencao]}</td>
                  <td className="px-4 py-3">{a.departamento ? ROTULO_DEPARTAMENTO[a.departamento] : "—"}</td>
                  <td className="px-4 py-3"><Badge variant={STATUS[a.status].variante}>{STATUS[a.status].rotulo}</Badge></td>
                  <td className="px-4 py-3 text-right tabular-nums">{a.duracaoSeg}s</td>
                </tr>
              ))}
              {lista.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Nenhum atendimento neste filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
