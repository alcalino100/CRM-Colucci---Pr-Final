"use client"

import { useState } from "react"
import { Card, Badge } from "@/components/ui/primitives"
import { Button } from "@/components/ui/button"
import { RotateCw } from "lucide-react"
import { ROTULO_DEPARTAMENTO, ROTULO_INTENCAO, type AtendimentoResumo, type StatusConversa } from "@/lib/assistente"
import { FonteBadge } from "./FonteBadge"
import { quandoRelativo, useApi } from "./use-api"

const STATUS: Record<StatusConversa, { rotulo: string; variante: string }> = {
  resolvida_ia: { rotulo: "Resolvido pela IA", variante: "green" },
  transferida: { rotulo: "Transferido", variante: "amber" },
  humano: { rotulo: "Com a equipe", variante: "violet" },
  ativa: { rotulo: "Em andamento", variante: "blue" },
  encerrada: { rotulo: "Encerrado", variante: "gray" },
}

export function Atendimentos() {
  const [filtro, setFiltro] = useState<"todos" | StatusConversa>("todos")
  const { dados, erro, carregando, recarregar } = useApi<{ fonte: string; atendimentos: AtendimentoResumo[] }>("/api/assistente/atendimentos?limite=100")
  const lista = (dados?.atendimentos ?? []).filter((a) => filtro === "todos" || a.status === filtro)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["todos", "resolvida_ia", "transferida", "humano", "ativa"] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFiltro(f)} className={`rounded-full border px-3 py-1 text-xs transition ${filtro === f ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
            {f === "todos" ? "Todos" : STATUS[f].rotulo}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-2">
          <FonteBadge fonte={dados?.fonte} />
          <Button size="sm" variant="outline" onClick={recarregar} disabled={carregando}><RotateCw className="size-3.5" /> Atualizar</Button>
        </span>
      </div>

      {erro && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</p>}

      {!erro && <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
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
                <tr key={a.id} className="border-t border-border">
                  <td className="px-4 py-3 font-mono text-xs">{a.protocolo ?? "—"}</td>
                  <td className="px-4 py-3"><p className="font-medium">{a.cliente}</p><p className="text-xs text-muted-foreground">{a.telefoneMascarado} · {quandoRelativo(a.quando)}</p></td>
                  <td className="px-4 py-3">{a.intencao ? ROTULO_INTENCAO[a.intencao] : "—"}</td>
                  <td className="px-4 py-3">{a.departamento ? ROTULO_DEPARTAMENTO[a.departamento] : "—"}</td>
                  <td className="px-4 py-3"><Badge variant={STATUS[a.status].variante}>{STATUS[a.status].rotulo}</Badge></td>
                  <td className="px-4 py-3 text-right tabular-nums">{a.duracaoSeg}s</td>
                </tr>
              ))}
              {!carregando && lista.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Nenhum atendimento neste filtro.</td></tr>}
              {carregando && !dados && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Carregando…</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>}
    </div>
  )
}
