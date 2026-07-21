"use client"

import { useEffect, useState } from "react"
import { Plus } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLeads } from "@/lib/leads-store"
import { Button } from "@/components/ui/button"
import { Dialog, Skeleton, useToast } from "@/components/ui/primitives"
import { KanbanBoard } from "@/components/kanban-board"
import { LeadForm, type LeadFormValues } from "@/components/lead-form"

export default function PainelCorretorPage() {
  const { user } = useAuth()
  const { leads, addLead } = useLeads()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [novo, setNovo] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 500)
    return () => clearTimeout(t)
  }, [])

  if (!user) return null
  const isGestor = user.role === "gestor"
  const myLeads = isGestor ? leads : leads.filter((l) => l.corretorId === user.id)

  function onCreate(v: LeadFormValues) {
    addLead(v)
    setNovo(false)
    toast("Lead criado com sucesso.")
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Painel do Corretor</h1>
          <p className="text-sm text-muted-foreground">Arraste os cards entre as etapas para atualizar o status do lead.</p>
        </div>
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
        <KanbanBoard leads={myLeads} showCorretor={isGestor} currentCorretorId={user.id} isGestor={isGestor} />
      )}

      <Dialog open={novo} onClose={() => setNovo(false)} title="Novo Lead">
        <LeadForm
          defaultCorretorId={user.id}
          showCorretor={isGestor}
          showStatus={false}
          onSubmit={onCreate}
          onCancel={() => setNovo(false)}
        />
      </Dialog>
    </div>
  )
}
