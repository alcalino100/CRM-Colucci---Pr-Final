"use client"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { CampanhasTab } from "./CampanhasTab"
import { InstagramTab } from "./InstagramTab"
import { MensaisTab } from "./MensaisTab"

const ABAS = [
  { id: "instagram", rotulo: "Instagram" },
  { id: "campanhas", rotulo: "Campanhas" },
  { id: "mensais", rotulo: "Relatórios mensais" },
] as const

export function RelatoriosMetaTela() {
  const [aba, setAba] = useState<string>("instagram")
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Relatórios Meta" className="flex flex-wrap gap-1 border-b border-border print:hidden">
        {ABAS.map((a) => (
          <button key={a.id} role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)} className={cn("-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition", aba === a.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>{a.rotulo}</button>
        ))}
      </div>
      {aba === "instagram" && <InstagramTab />}
      {aba === "campanhas" && <CampanhasTab />}
      {aba === "mensais" && <MensaisTab />}
    </div>
  )
}
