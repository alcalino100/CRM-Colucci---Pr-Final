"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import {
  Clock,
  Search,
  Filter,
  ExternalLink,
  XCircle,
  RotateCcw,
  MessageCircle,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Send,
  Smartphone,
  Eye,
  Calendar,
  Layers,
  ArrowRight,
} from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent, Badge, Table, THead, TR, TH, TD, Input, Select, Dialog } from "@/components/ui/primitives"
import { useAutomation } from "@/lib/automation-store"
import { useLeads } from "@/lib/leads-store"
import { AUTOMATION_JOB_STATUS_LABEL, AUTOMATION_JOB_STATUS_VARIANT, type AutomationJob } from "@/lib/automation-types"
import { fmtDateTime } from "@/lib/labels"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { isGestorNivel } from "@/lib/roles"
import { cn } from "@/lib/utils"
import { AutomationSubNav } from "@/components/automation/AutomationSubNav"

function useAuthSafeGate() {
  const { user, loading } = useAuth()
  const router = useRouter()
  useEffect(() => {
    if (!loading && user && !isGestorNivel(user.role)) router.replace("/painel-corretor")
  }, [loading, user, router])
  return { user, loading, bloqueado: !loading && !!user && !isGestorNivel(user.role) }
}

export default function FilaPage() {
  const { user, loading: gateLoading, bloqueado } = useAuthSafeGate()
  const { jobs, automations, cancelJob, clearQueue, rerunJob } = useAutomation()
  const { users, leads } = useLeads()

  const [filterStatus, setFilterStatus] = useState<string>("active_queue")
  const [filterAutomation, setFilterAutomation] = useState<string>("all")
  const [filterStep, setFilterStep] = useState<string>("all")
  const [search, setSearch] = useState("")
  const [viewingMessageJob, setViewingMessageJob] = useState<AutomationJob | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearReason, setClearReason] = useState("Fila limpa manualmente pelo gestor")

  if (gateLoading) return <div className="py-16 text-center text-muted-foreground animate-pulse">Carregando fila de envios...</div>
  if (bloqueado || !user) return null

  // Métricas da fila
  const activeJobs = jobs.filter((j) => ["scheduled", "pending_validation", "retrying"].includes(j.status))
  const sentJobs = jobs.filter((j) => ["sent", "delivered", "read", "responded"].includes(j.status))
  const cancelledHumano = jobs.filter((j) => (j.status as string) === "cancelled_human").length
  const cancelledReply = jobs.filter((j) => (j.status as string) === "cancelled_lead_replied").length

  function formatPhone(phone: string | null | undefined): string {
    if (!phone) return "—"
    const digits = phone.replace(/\D/g, "")
    const num = digits.startsWith("55") ? digits.slice(2) : digits
    if (num.length === 11) return `(${num.slice(0, 2)}) ${num.slice(2, 7)}-${num.slice(7)}`
    if (num.length === 10) return `(${num.slice(0, 2)}) ${num.slice(2, 6)}-${num.slice(6)}`
    return phone
  }

  function getJobStep(job: AutomationJob): string {
    const meta = (job.metadata ?? {}) as Record<string, unknown>
    if (meta.step) return String(meta.step)
    const tid = String(meta.template_id ?? "")
    if (tid === "a0000000-0000-0000-0000-000000000003") return "D+2"
    if (tid === "a0000000-0000-0000-0000-000000000004") return "D+3"
    if (tid === "a0000000-0000-0000-0000-000000000002") return "D+1"
    if (job.automation_id === "b0000000-0000-0000-0000-000000000002") return "D+1"
    return "Reativação"
  }

  function getJobConnectionName(job: AutomationJob): string {
    const meta = (job.metadata ?? {}) as Record<string, unknown>
    const cId = String(meta.connection_id ?? "")
    if (cId === "cf0b4d97-b783-4c1e-9507-a18214071cd5") return "Patrícia 1"
    if (cId === "c21e7e83-b378-4055-8f21-e2a6363a712d") return "Patrícia 2"
    return "Patrícia (Auto)"
  }

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      // Filtro de status
      if (filterStatus === "active_queue") {
        if (!["scheduled", "pending_validation", "retrying"].includes(j.status)) return false
      } else if (filterStatus !== "all" && j.status !== filterStatus) {
        return false
      }

      // Filtro de automação
      if (filterAutomation !== "all" && j.automation_id !== filterAutomation) return false

      // Filtro de etapa (D+1, D+2, D+3)
      if (filterStep !== "all" && getJobStep(j) !== filterStep) return false

      // Busca por nome ou telefone do lead
      if (search.trim()) {
        const s = search.trim().toLowerCase()
        const lead = leads.find((l) => l.id === j.lead_id)
        const matchNome = lead?.nome?.toLowerCase().includes(s)
        const matchTel = lead?.telefone?.replace(/\D/g, "").includes(s.replace(/\D/g, ""))
        if (!matchNome && !matchTel) return false
      }

      return true
    })
  }, [jobs, filterStatus, filterAutomation, filterStep, search, leads])

  function userName(id: string | null) {
    return id ? users.find((u) => u.id === id)?.nome ?? "—" : "—"
  }
  function leadName(id: string) {
    return leads.find((l) => l.id === id)?.nome ?? "Lead"
  }
  function leadPhone(id: string) {
    return leads.find((l) => l.id === id)?.telefone ?? ""
  }
  function automationName(id: string) {
    return automations.find((a) => a.id === id)?.name ?? "Automação"
  }

  async function handleCancel(jobId: string) {
    if (!confirm("Tem certeza que deseja cancelar este envio na fila?")) return
    await cancelJob(jobId, "Cancelado manualmente pelo gestor no painel de fila")
  }

  async function handleRerun(jobId: string) {
    await rerunJob(jobId)
  }

  async function executeClearQueue() {
    setConfirmClear(false)
    const result = await clearQueue(clearReason)
    if (result.ok) alert(`${result.cancelled ?? 0} job(s) cancelados com sucesso.`)
    else alert(`Erro: ${result.error}`)
  }

  return (
    <div className="space-y-6">
      {/* 1. Subnavegação Unificada */}
      <AutomationSubNav pendingJobsCount={activeJobs.length} />

      {/* 2. Header & Limpar Fila */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
              <Layers className="size-4" />
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Fila de Envios & Agendamentos
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe em tempo real os disparos programados, etapas da régua (D+1, D+2, D+3) e distribuição por linha.
          </p>
        </div>

        {activeJobs.length > 0 && (
          <button
            onClick={() => setConfirmClear(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300"
          >
            <Trash2 className="size-3.5" /> Limpar Fila Ativa ({activeJobs.length})
          </button>
        )}
      </div>

      {/* 3. Resumo Operacional da Fila */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Na Fila Agora</span>
              <Clock className="size-4 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{activeJobs.length}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Aguardando janela de envio</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Processados no Histórico</span>
              <Send className="size-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{sentJobs.length}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Disparos concluídos</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Cancelados por Reply</span>
              <CheckCircle2 className="size-4 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">{cancelledReply}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Cliente respondeu antes</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Ação do Corretor</span>
              <XCircle className="size-4 text-purple-600 dark:text-purple-400" />
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-purple-600 dark:text-purple-400">{cancelledHumano}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Cancelados por intervenção manual</p>
          </CardContent>
        </Card>
      </div>

      {/* 4. Barra de Filtros Refinada */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[220px]">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar lead por nome ou WhatsApp..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 text-xs"
                />
              </div>
            </div>

            <div className="w-48">
              <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="text-xs">
                <option value="active_queue">Fila Ativa (Pendentes)</option>
                <option value="all">Todo o Histórico</option>
                <option value="scheduled">Agendados</option>
                <option value="sent">Enviados</option>
                <option value="responded">Responderam</option>
                <option value="cancelled_lead_replied">Cancelados (Lead Respondeu)</option>
                <option value="cancelled_human">Cancelados (Corretor)</option>
                <option value="failed">Falhas</option>
              </Select>
            </div>

            <div className="w-44">
              <Select value={filterStep} onChange={(e) => setFilterStep(e.target.value)} className="text-xs">
                <option value="all">Todas as Etapas</option>
                <option value="D+1">D+1 (24 Horas)</option>
                <option value="D+2">D+2 (48 Horas)</option>
                <option value="D+3">D+3 (72 Horas)</option>
                <option value="Reativação">Reativação Fria</option>
              </Select>
            </div>

            <div className="w-52">
              <Select value={filterAutomation} onChange={(e) => setFilterAutomation(e.target.value)} className="text-xs">
                <option value="all">Todas as Automações</option>
                {automations.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5. Tabela de Envios Enriquecida */}
      <Card className="overflow-hidden">
        <Table>
          <THead>
            <TR>
              <TH>Lead / Contato</TH>
              <TH>Etapa / Régua</TH>
              <TH>Linha WhatsApp</TH>
              <TH>Corretor Resp.</TH>
              <TH>Agendado para</TH>
              <TH>Status</TH>
              <TH className="text-center">Ações</TH>
            </TR>
          </THead>
          <tbody>
            {filtered.length === 0 ? (
              <TR>
                <TD colSpan={7} className="py-16 text-center text-sm text-muted-foreground">
                  <Clock className="size-8 mx-auto mb-2 text-muted-foreground/30" />
                  <p className="font-semibold text-foreground">Nenhum envio encontrado</p>
                  <p className="text-xs mt-1">Ajuste os filtros de status ou etapa para visualizar outros registros.</p>
                </TD>
              </TR>
            ) : (
              filtered.slice(0, 150).map((job) => {
                const step = getJobStep(job)
                const phone = leadPhone(job.lead_id)
                const dataScheduled = new Date(job.scheduled_at)
                const hoje = new Date()
                const ehHoje = dataScheduled.toLocaleDateString() === hoje.toLocaleDateString()

                return (
                  <TR key={job.id} className="hover:bg-muted/30 transition-colors">
                    <TD>
                      <div>
                        <p className="font-semibold text-foreground">{leadName(job.lead_id)}</p>
                        {phone && (
                          <a
                            href={`https://wa.me/55${phone.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary mt-0.5"
                          >
                            <span>{formatPhone(phone)}</span>
                            <ExternalLink className="size-3 opacity-60" />
                          </a>
                        )}
                      </div>
                    </TD>

                    <TD>
                      <div className="flex flex-col gap-1 items-start">
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums",
                            step === "D+1"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                              : step === "D+2"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                              : step === "D+3"
                              ? "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {step}
                        </span>
                        <span className="text-[11px] text-muted-foreground truncate max-w-[140px]">
                          {automationName(job.automation_id)}
                        </span>
                      </div>
                    </TD>

                    <TD>
                      <div className="flex items-center gap-1.5 text-xs">
                        <Smartphone className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span className="font-medium text-foreground">{getJobConnectionName(job)}</span>
                      </div>
                    </TD>

                    <TD className="text-xs text-muted-foreground">
                      {userName(job.assigned_agent_id)}
                    </TD>

                    <TD>
                      <div className="flex flex-col text-xs">
                        <span className="font-medium text-foreground">
                          {ehHoje ? "Hoje" : dataScheduled.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                        </span>
                        <span className="text-muted-foreground text-[11px]">
                          {dataScheduled.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </TD>

                    <TD>
                      <Badge variant={AUTOMATION_JOB_STATUS_VARIANT[job.status]}>
                        {AUTOMATION_JOB_STATUS_LABEL[job.status]}
                      </Badge>
                    </TD>

                    <TD>
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setViewingMessageJob(job)}
                          title="Prévia da Mensagem"
                          className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/50 transition-colors"
                        >
                          <Eye className="size-4" />
                        </button>

                        {["scheduled", "pending_validation", "retrying"].includes(job.status) && (
                          <button
                            onClick={() => handleCancel(job.id)}
                            title="Cancelar Envio"
                            className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50 transition-colors"
                          >
                            <XCircle className="size-4" />
                          </button>
                        )}

                        {["failed", "cancelled_manual"].includes(job.status) && (
                          <button
                            onClick={() => handleRerun(job.id)}
                            title="Reagendar Envio"
                            className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/50 transition-colors"
                          >
                            <RotateCcw className="size-4" />
                          </button>
                        )}
                      </div>
                    </TD>
                  </TR>
                )
              })
            )}
          </tbody>
        </Table>
      </Card>

      {/* Modal Prévia da Mensagem */}
      <Dialog
        open={!!viewingMessageJob}
        onClose={() => setViewingMessageJob(null)}
        title="Prévia da Mensagem de Automação"
      >
        {viewingMessageJob && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Destinatário:</span>
                <strong className="text-foreground">{leadName(viewingMessageJob.lead_id)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Etapa:</span>
                <strong>{getJobStep(viewingMessageJob)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Linha Prevista:</span>
                <span>{getJobConnectionName(viewingMessageJob)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Horário Agendado:</span>
                <span>{fmtDateTime(viewingMessageJob.scheduled_at)}</span>
              </div>
            </div>

            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 dark:border-emerald-800/60 dark:bg-emerald-950/20 p-4 text-xs text-foreground leading-relaxed whitespace-pre-wrap font-sans">
              {viewingMessageJob.message_content_rendered || (
                <span className="italic text-muted-foreground">
                  (O texto dinâmico será montado com as variáveis do lead no exato momento do envio pelo worker, respeitando a cadência {getJobStep(viewingMessageJob)}).
                </span>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setViewingMessageJob(null)}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Modal Confirmação Limpar Fila */}
      <Dialog open={confirmClear} onClose={() => setConfirmClear(false)} title="Limpar Fila Ativa">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Tem certeza que deseja cancelar todos os <strong>{activeJobs.length} envios pendentes</strong> da fila ativa? Isso liberará os leads para novas rotinas operacionais.
          </p>
          <div>
            <label className="text-xs font-medium text-foreground">Motivo do cancelamento:</label>
            <Input
              value={clearReason}
              onChange={(e) => setClearReason(e.target.value)}
              className="mt-1 text-xs"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setConfirmClear(false)}
              className="rounded-lg border border-border px-3.5 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Voltar
            </button>
            <button
              onClick={executeClearQueue}
              className="rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
            >
              Confirmar Cancelamento em Massa
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
