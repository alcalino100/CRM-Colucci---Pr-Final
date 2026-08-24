"use client"

import { useState } from "react"
import { Clock, Search, Filter, ExternalLink, XCircle, RotateCcw, MessageCircle, Eye, Trash2 } from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent, Badge, Table, THead, TR, TH, TD, Input, Select, Label } from "@/components/ui/primitives"
import { useAutomation } from "@/lib/automation-store"
import { useLeads } from "@/lib/leads-store"
import { AUTOMATION_JOB_STATUS_LABEL, AUTOMATION_JOB_STATUS_VARIANT, type AutomationJob } from "@/lib/automation-types"
import { fmtDateTime } from "@/lib/labels"

export default function FilaPage() {
  const { jobs, automations, cancelJob, clearQueue, rerunJob } = useAutomation()
  const { users, leads } = useLeads()
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterAutomation, setFilterAutomation] = useState<string>("all")
  const [search, setSearch] = useState("")

  const filtered = jobs.filter((j) => {
    if (filterStatus !== "all" && j.status !== filterStatus) return false
    if (filterAutomation !== "all" && j.automation_id !== filterAutomation) return false
    if (search) {
      const lead = leads.find((l) => l.id === j.lead_id)
      if (!lead?.nome.toLowerCase().includes(search.toLowerCase()) && !lead?.telefone?.includes(search)) return false
    }
    return true
  })

  function userName(id: string | null) { return id ? users.find((u) => u.id === id)?.nome ?? "—" : "—" }
  function leadName(id: string) { return leads.find((l) => l.id === id)?.nome ?? "—" }
  function leadPhone(id: string) { return leads.find((l) => l.id === id)?.telefone ?? "—" }
  function automationName(id: string) { return automations.find((a) => a.id === id)?.name ?? "—" }

  async function handleCancel(jobId: string) {
    if (!confirm("Tem certeza que deseja cancelar este envio?")) return
    await cancelJob(jobId, "Cancelado manualmente pelo gestor")
  }

  async function handleRerun(jobId: string) {
    if (!confirm("Reagendar este envio? Ele será processado novamente pelo worker.")) return
    await rerunJob(jobId)
  }

  async function handleClearQueue() {
    const activeJobs = jobs.filter((j) => !["sent", "delivered", "read", "responded", "cancelled_human", "cancelled_condition", "cancelled_manual"].includes(j.status))
    if (activeJobs.length === 0) return alert("Não há jobs ativos na fila.")
    if (!confirm(`Tem certeza que deseja cancelar ${activeJobs.length} job(s) da fila? Isso desbloqueará os leads para novas automações.`)) return
    const result = await clearQueue()
    if (result.ok) alert(`${result.cancelled ?? 0} job(s) cancelados com sucesso.`)
    else alert(`Erro: ${result.error}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Fila de Envios</h1>
          <p className="text-sm text-muted-foreground">{jobs.length} jobs no histórico · {filtered.length} exibidos</p>
        </div>
        <button onClick={handleClearQueue}
          className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-100">
          <Trash2 className="size-4" /> Limpar Fila
        </button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
              <Label>Buscar lead</Label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input placeholder="Nome ou telefone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
            </div>
            <div className="w-48">
              <Label>Status</Label>
              <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="all">Todos</option>
                {Object.entries(AUTOMATION_JOB_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div className="w-48">
              <Label>Automação</Label>
              <Select value={filterAutomation} onChange={(e) => setFilterAutomation(e.target.value)}>
                <option value="all">Todas</option>
                {automations.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Lead</TH>
              <TH>Automação</TH>
              <TH>Corretor</TH>
              <TH>Supervisor</TH>
              <TH>Agendado</TH>
              <TH>Status</TH>
              <TH>Tentativas</TH>
              <TH>Ações</TH>
            </TR>
          </THead>
          <tbody>
            {filtered.length === 0 ? (
              <TR>
                <TD colSpan={8} className="py-12 text-center text-sm text-muted-foreground">Nenhum job encontrado</TD>
              </TR>
            ) : (
              filtered.map((job) => (
                <TR key={job.id}>
                  <TD>
                    <div>
                      <p className="font-medium">{leadName(job.lead_id)}</p>
                      <p className="text-xs text-muted-foreground">{leadPhone(job.lead_id)}</p>
                    </div>
                  </TD>
                  <TD className="text-xs">{automationName(job.automation_id)}</TD>
                  <TD className="text-xs">{userName(job.assigned_agent_id)}</TD>
                  <TD className="text-xs">{userName(job.supervisor_user_id)}</TD>
                  <TD className="text-xs">{fmtDateTime(job.scheduled_at)}</TD>
                  <TD>
                    <Badge variant={AUTOMATION_JOB_STATUS_VARIANT[job.status]}>
                      {AUTOMATION_JOB_STATUS_LABEL[job.status]}
                    </Badge>
                  </TD>
                  <TD className="text-xs text-center">{job.attempts}/{job.max_attempts}</TD>
                  <TD>
                    <div className="flex items-center gap-1">
                      {!["sent", "delivered", "read", "responded", "cancelled_human", "cancelled_condition", "cancelled_manual"].includes(job.status) && (
                        <>
                          <button onClick={() => handleCancel(job.id)} title="Cancelar" className="rounded p-1 text-red-500 hover:bg-red-50">
                            <XCircle className="size-4" />
                          </button>
                          <button onClick={() => handleRerun(job.id)} title="Reagendar" className="rounded p-1 text-amber-600 hover:bg-amber-50">
                            <RotateCcw className="size-4" />
                          </button>
                        </>
                      )}
                      {job.message_content_rendered && (
                        <button title="Ver mensagem" onClick={() => alert(job.message_content_rendered)} className="rounded p-1 text-blue-600 hover:bg-blue-50">
                          <MessageCircle className="size-4" />
                        </button>
                      )}
                    </div>
                  </TD>
                </TR>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </div>
  )
}
