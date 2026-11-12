"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { isMasterEmail } from "@/lib/master"
import { Badge } from "@/components/ui/primitives"
import { cn } from "@/lib/utils"

import { MarcaSection } from "@/components/master/MarcaSection"
import { IAsSection } from "@/components/master/IAsSection"
import { AutomacoesSection } from "@/components/master/AutomacoesSection"
import { TagsSection } from "@/components/master/TagsSection"
import { EquipeSection } from "@/components/master/EquipeSection"
import { PipelinesSection } from "@/components/master/PipelinesSection"
import { RelatoriosSection } from "@/components/master/RelatoriosSection"
import { AgenciaSection } from "@/components/master/AgenciaSection"
import { ClonarSection } from "@/components/master/ClonarSection"

export const ABAS = [
  { id: "marca", label: "Marca" },
  { id: "ias", label: "IAs & Bots" },
  { id: "automacoes", label: "Automações" },
  { id: "tags", label: "Tags" },
  { id: "equipe", label: "Equipe" },
  { id: "pipelines", label: "Pipelines" },
  { id: "relatorios", label: "Relatórios" },
  { id: "agencia", label: "Agência" },
  { id: "clonar", label: "Clonar" },
] as const

export type Aba = (typeof ABAS)[number]["id"]

export default function MasterPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [aba, setAba] = useState<Aba>("marca")

  useEffect(() => {
    if (!loading && (!user || !isMasterEmail(user.email))) router.replace("/painel-corretor")
  }, [loading, user, router])

  if (loading || !user) return <div className="py-16 text-center text-muted-foreground">Carregando...</div>
  if (!isMasterEmail(user.email)) return null

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="font-display text-xl font-bold">
          Master <Badge>proprietário</Badge>
        </h1>
        <p className="text-xs text-muted-foreground">
          Visível somente para {user.email} · mudanças aplicam na hora
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAba(a.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition",
              aba === a.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            {a.label}
          </button>
        ))}
      </div>
      {aba === "marca" && <MarcaSection />}
      {aba === "ias" && <IAsSection />}
      {aba === "automacoes" && <AutomacoesSection />}
      {aba === "tags" && <TagsSection />}
      {aba === "equipe" && <EquipeSection />}
      {aba === "pipelines" && <PipelinesSection />}
      {aba === "relatorios" && <RelatoriosSection />}
      {aba === "agencia" && <AgenciaSection />}
      {aba === "clonar" && <ClonarSection />}
    </div>
  )
}
