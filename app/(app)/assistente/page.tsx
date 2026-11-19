"use client"

import { useState } from "react"
import { BarChart3, ListChecks, MessageSquareText, Settings2 } from "lucide-react"
import { RequireGestor } from "@/components/RequireGestor"
import { PageHeading } from "@/components/ui/page-heading"
import { Simulador } from "@/components/assistente/Simulador"
import { Atendimentos } from "@/components/assistente/Atendimentos"
import { Indicadores } from "@/components/assistente/Indicadores"
import { Configuracoes } from "@/components/assistente/Configuracoes"

const ABAS = [
  { id: "simulador", rotulo: "Simulador", icone: MessageSquareText },
  { id: "atendimentos", rotulo: "Atendimentos", icone: ListChecks },
  { id: "indicadores", rotulo: "Indicadores", icone: BarChart3 },
  { id: "configuracoes", rotulo: "Configurações", icone: Settings2 },
] as const

type AbaId = (typeof ABAS)[number]["id"]

export default function AssistentePage() {
  const [aba, setAba] = useState<AbaId>("simulador")
  return (
    <RequireGestor>
      <div className="flex flex-col gap-5">
        <PageHeading badge="Colucci Conecta 360°" title="Assistente Virtual" subtitle="Atendimento 24h por WhatsApp: boletos, contratos, reajustes e encaminhamento para a equipe." />

        <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border">
          {ABAS.map(({ id, rotulo, icone: Icone }) => (
            <button key={id} role="tab" aria-selected={aba === id} onClick={() => setAba(id)} className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${aba === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              <Icone className="size-4" /> {rotulo}
            </button>
          ))}
        </div>

        {aba === "simulador" && <Simulador />}
        {aba === "atendimentos" && <Atendimentos />}
        {aba === "indicadores" && <Indicadores />}
        {aba === "configuracoes" && <Configuracoes />}
      </div>
    </RequireGestor>
  )
}
