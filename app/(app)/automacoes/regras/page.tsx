"use client"

import { useState } from "react"
import Link from "next/link"
import { Plus, Zap, Play, Pause, Trash2, Copy, Settings, BarChart3, ScrollText } from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent, Badge, Dialog, Input, Label, Select } from "@/components/ui/primitives"
import { useAutomation } from "@/lib/automation-store"
import { useLeads } from "@/lib/leads-store"
import { AUTOMATION_STATUS_LABEL, AUTOMATION_STATUS_VARIANT, type Automation } from "@/lib/automation-types"
import { fmtDateTime } from "@/lib/labels"

export default function RegrasPage() {
  const { automations, toggleAutomation, deleteAutomation } = useAutomation()
  const { users } = useLeads()
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>("all")

  const filtered = automations.filter((a) => {
    if (filterStatus !== "all" && a.status !== filterStatus) return false
    return true
  })

  function userName(id: string | null) { return id ? users.find((u) => u.id === id)?.nome ?? "—" : "—" }

  async function handleDelete(id: string) {
    await deleteAutomation(id)
    setConfirmDelete(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Regras de Automação</h1>
          <p className="text-sm text-muted-foreground">Gerencie as regras de automação de leads</p>
        </div>
        <Link href="/automacoes/nova" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90">
          <Plus className="size-4" /> Nova Automação
        </Link>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="w-48">
              <Label>Status</Label>
              <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="all">Todos</option>
                <option value="active">Ativa</option>
                <option value="paused">Pausada</option>
                <option value="draft">Rascunho</option>
                <option value="inactive">Inativa</option>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Zap className="mx-auto mb-3 size-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhuma automação encontrada</p>
              <Link href="/automacoes/nova" className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
                <Plus className="size-4" /> Criar primeira automação
              </Link>
            </CardContent>
          </Card>
        ) : (
          filtered.map((auto) => (
            <Card key={auto.id}>
              <CardContent className="p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-base font-semibold">{auto.name}</h3>
                      <Badge variant={AUTOMATION_STATUS_VARIANT[auto.status]}>{AUTOMATION_STATUS_LABEL[auto.status]}</Badge>
                    </div>
                    {auto.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{auto.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Gatilho: {auto.trigger_type === "lead_inactive" ? "Lead inativo" : auto.trigger_type}</span>
                      <span>Espera: {auto.wait_config.amount} {auto.wait_config.unit}</span>
                      <span>Supervisor: {userName(auto.supervisor_user_id)}</span>
                      <span>Criado: {fmtDateTime(auto.created_at)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleAutomation(auto.id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                        auto.status === "active"
                          ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      )}
                    >
                      {auto.status === "active" ? <Pause className="size-3" /> : <Play className="size-3" />}
                      {auto.status === "active" ? "Pausar" : "Ativar"}
                    </button>
                    <Link
                      href={`/automacoes/nova?id=${auto.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-muted"
                    >
                      <Settings className="size-3" /> Editar
                    </Link>
                    <Link
                      href={`/automacoes/logs?automation_id=${auto.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-muted"
                    >
                      <ScrollText className="size-3" /> Logs
                    </Link>
                    <button
                      onClick={() => setConfirmDelete(auto.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Dialog confirmação exclusão */}
      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Excluir Automação">
        <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir esta automação? Esta ação não pode ser desfeita.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => setConfirmDelete(null)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Cancelar</button>
          <button onClick={() => confirmDelete && handleDelete(confirmDelete)} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Excluir</button>
        </div>
      </Dialog>
    </div>
  )
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ")
}
