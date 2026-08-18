"use client"

import { useEffect, useState } from "react"
import { Zap, Clock, Pause, Play, XCircle, Shield, MessageCircle } from "lucide-react"
import { Badge, Card, CardHeader, CardTitle, CardContent, Dialog, Textarea, Label } from "@/components/ui/primitives"
import { supabase } from "@/lib/supabase/client"
import { useLeads } from "@/lib/leads-store"
import { useAutomation } from "@/lib/automation-store"
import {
  AUTOMATION_JOB_STATUS_LABEL,
  AUTOMATION_JOB_STATUS_VARIANT,
  type AutomationJob,
  type LeadAutomationSettings,
} from "@/lib/automation-types"
import { fmtDateTime } from "@/lib/labels"
import { cn } from "@/lib/utils"

interface LeadAutomacoesTabProps {
  leadId: string
}

export function LeadAutomacoesTab({ leadId }: LeadAutomacoesTabProps) {
  const { users } = useLeads()
  const { leadSettings, loadLeadSettings, pauseLead, resumeLead, blockLead, cancelJob: cancelJobStore } = useAutomation()
  const [jobs, setJobs] = useState<AutomationJob[]>([])
  const [loading, setLoading] = useState(true)
  const [showBlockDialog, setShowBlockDialog] = useState(false)
  const [blockReason, setBlockReason] = useState("")

  const settings = leadSettings[leadId]

  useEffect(() => {
    loadLeadSettings(leadId)
    loadJobs()
  }, [leadId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadJobs() {
    setLoading(true)
    const { data } = await supabase
      .from("automation_jobs")
      .select("*, automations(name)")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(20)
    if (data) setJobs(data.map((r: any) => ({ ...r, _name: r.automations?.name } as AutomationJob & { _name?: string })))
    setLoading(false)
  }

  async function handlePause() {
    await pauseLead(leadId, "Pausado manualmente pelo gestor")
  }

  async function handleResume() {
    await resumeLead(leadId)
  }

  async function handleBlock() {
    if (!blockReason.trim()) return
    await blockLead(leadId, blockReason)
    setShowBlockDialog(false)
    setBlockReason("")
  }

  async function handleCancelJob(jobId: string) {
    if (!confirm("Cancelar este envio?")) return
    await cancelJobStore(jobId, "Cancelado manualmente pelo gestor")
    await loadJobs()
  }

  function userName(id: string | null) { return id ? users.find((u) => u.id === id)?.nome ?? "—" : "—" }

  return (
    <div className="space-y-4">
      {/* Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="size-4" /> Status de Automações
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Automações pausadas:</span>
              <Badge variant={settings?.automation_paused ? "amber" : "green"}>
                {settings?.automation_paused ? "Sim" : "Não"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Não contactar:</span>
              <Badge variant={settings?.do_not_contact ? "red" : "green"}>
                {settings?.do_not_contact ? "Sim" : "Não"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total de mensagens automáticas:</span>
              <span className="text-sm font-medium">{settings?.total_automation_messages_sent ?? 0}</span>
            </div>
            {settings?.last_automation_sent_at && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Último envio:</span>
                <span className="text-sm">{fmtDateTime(settings.last_automation_sent_at)}</span>
              </div>
            )}
            {settings?.automation_paused && settings?.automation_paused_reason && (
              <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
                Motivo da pausa: {settings.automation_paused_reason}
              </div>
            )}
            {settings?.do_not_contact && settings?.do_not_contact_reason && (
              <div className="rounded-lg bg-red-50 p-2 text-xs text-red-700">
                Motivo do bloqueio: {settings.do_not_contact_reason}
              </div>
            )}
          </div>

          {/* Ações */}
          <div className="mt-4 flex flex-wrap gap-2">
            {!settings?.automation_paused ? (
              <button onClick={handlePause}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100">
                <Pause className="size-3" /> Pausar Automações
              </button>
            ) : (
              <button onClick={handleResume}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100">
                <Play className="size-3" /> Retomar Automações
              </button>
            )}
            {!settings?.do_not_contact && (
              <button onClick={() => setShowBlockDialog(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
                <XCircle className="size-3" /> Não Automatizar
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Histórico de jobs */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Automações</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Carregando...</p>
          ) : jobs.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma automação registrada para este lead</p>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => (
                <div key={job.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={AUTOMATION_JOB_STATUS_VARIANT[job.status]}>
                        {AUTOMATION_JOB_STATUS_LABEL[job.status]}
                      </Badge>
                      {job.sent_at && (
                        <span className="text-xs text-muted-foreground">Enviado: {fmtDateTime(job.sent_at)}</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {(job as any)._name ?? job.automation_id} · Tentativas: {job.attempts}/{job.max_attempts}
                    </p>
                    {job.cancellation_reason && (
                      <p className="mt-0.5 text-xs text-red-500">Motivo: {job.cancellation_reason}</p>
                    )}
                    {job.supervision_status && (
                      <div className="mt-1 flex items-center gap-1">
                        <Shield className="size-3 text-purple-600" />
                        <span className="text-xs text-purple-600">
                          Supervisão: {job.supervision_status === "applied" ? "Aplicada" : job.supervision_status === "failed" ? "Falhou" : "Pendente"}
                        </span>
                      </div>
                    )}
                  </div>
                  {!["sent", "delivered", "read", "responded", "cancelled_human", "cancelled_condition", "cancelled_manual"].includes(job.status) && (
                    <button onClick={() => handleCancelJob(job.id)}
                      className="rounded p-1 text-red-500 hover:bg-red-50">
                      <XCircle className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog bloqueio */}
      <Dialog open={showBlockDialog} onClose={() => setShowBlockDialog(false)} title="Não Automatizar Este Lead">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Este lead será bloqueado para todas as automações. Nenhuma mensagem automática será enviada.
          </p>
          <div>
            <Label>Motivo</Label>
            <Textarea value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="Informe o motivo do bloqueio..." rows={3} />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowBlockDialog(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
              Cancelar
            </button>
            <button onClick={handleBlock} disabled={!blockReason.trim()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40">
              Bloquear
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
