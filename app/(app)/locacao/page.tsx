"use client"

import { useEffect, useState } from "react"
import { Plus } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLocacao } from "@/lib/locacao-store"
import { Button } from "@/components/ui/button"
import { Dialog, Skeleton, useToast } from "@/components/ui/primitives"
import { PageHeading } from "@/components/ui/page-heading"
import { KanbanBoardLocacao } from "@/components/kanban-board-locacao"
import { LocacaoLeadForm, type LocacaoLeadFormValues } from "@/components/locacao-lead-form"

export default function LocacaoKanbanPage() {
  const { user } = useAuth()
  const { leads, addLead } = useLocacao()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [novo, setNovo] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 500)
    return () => clearTimeout(t)
  }, [])

  if (!user) return null
  const isGestor = user.role === "gestor"
  const myLeads = isGestor ? leads : leads.filter((l) => l.corretorId === user.id)

  async function onCreate(v: LocacaoLeadFormValues) {
    setCreating(true)
    const result = await addLead(v)
    setCreating(false)
    if (!result.ok) return toast(result.error ?? "Não foi possível criar o lead.", "error")
    setNovo(false)
    toast("Lead de locação criado com sucesso.")
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeading
          title="Kanban de Locação"
          subtitle="Arraste os cards entre as etapas para atualizar o status do lead."
          badge={isGestor ? "Visão gerencial" : "Meus leads de locação"}
        />
        <Button onClick={() => setNovo(true)}><Plus className="size-4" /> Novo Lead</Button>
      </div>

      {loading ? (
        <div className="flex w-full gap-4 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex w-72 flex-shrink-0 flex-col gap-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <KanbanBoardLocacao leads={myLeads} showCorretor={isGestor} currentCorretorId={user.id} isGestor={isGestor} />
      )}

      <Dialog open={novo} onClose={() => setNovo(false)} title="Novo Lead de Locação">
        <LocacaoLeadForm
          defaultCorretorId={user.id}
          showCorretor={isGestor}
          showStatus={false}
          submitting={creating}
          onSubmit={onCreate}
          onCancel={() => setNovo(false)}
        />
      </Dialog>
    </div>
  )
}
