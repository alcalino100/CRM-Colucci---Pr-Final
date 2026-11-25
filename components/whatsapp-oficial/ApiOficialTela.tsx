"use client"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { WhatsappOficialTestes } from "@/components/whatsapp-oficial-testes"
import { Eventos } from "./Eventos"
import { Modelos } from "./Modelos"
import { Numeros } from "./Numeros"
import { useOficial } from "./use-oficial"
import { VisaoGeral } from "./VisaoGeral"

const ABAS = [
  { id: "visao", rotulo: "Visão geral" },
  { id: "numeros", rotulo: "Números" },
  { id: "modelos", rotulo: "Modelos" },
  { id: "testes", rotulo: "Testes" },
  { id: "eventos", rotulo: "Eventos" },
] as const

/** Central da API oficial do WhatsApp (Meta): tudo para configurar, testar e acompanhar num só lugar. */
export function ApiOficialTela() {
  const { dados, carregando, recarregar } = useOficial()
  const [aba, setAba] = useState<string>("visao")

  if (carregando || !dados) return <p className="py-10 text-center text-muted-foreground">Carregando…</p>

  return (
    <div className="flex flex-col gap-4">
      {dados.aviso && <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">{dados.aviso}</p>}
      <div role="tablist" aria-label="API Oficial" className="flex flex-wrap gap-1 border-b border-border">
        {ABAS.map((a) => (
          <button key={a.id} role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)} className={cn("-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition", aba === a.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {a.rotulo}
          </button>
        ))}
      </div>
      {aba === "visao" && <VisaoGeral dados={dados} irPara={setAba} />}
      {aba === "numeros" && <Numeros dados={dados} recarregar={recarregar} />}
      {aba === "modelos" && <Modelos dados={dados} />}
      {aba === "testes" && <WhatsappOficialTestes canais={dados.canais} />}
      {aba === "eventos" && <Eventos />}
    </div>
  )
}
