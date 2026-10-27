"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Plus,
  Zap,
  Play,
  Pause,
  Trash2,
  Copy,
  Settings,
  BarChart3,
  ScrollText,
  Clock,
  Shield,
  Smartphone,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  CheckCircle2,
  AlertCircle,
  Layers,
  ArrowRight,
  Filter,
} from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent, Badge, Dialog } from "@/components/ui/primitives"
import { useAutomation } from "@/lib/automation-store"
import { useLeads } from "@/lib/leads-store"
import { AUTOMATION_STATUS_LABEL, AUTOMATION_STATUS_VARIANT, type Automation } from "@/lib/automation-types"
import { fmtDateTime } from "@/lib/labels"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { isGestorNivel } from "@/lib/roles"
import { cn } from "@/lib/utils"
import { AutomationSubNav } from "@/components/automation/AutomationSubNav"
import { EmergencyPauseButton } from "@/components/automation/EmergencyPauseButton"

function useAuthSafeGate() {
  const { user, loading } = useAuth()
  const router = useRouter()
  useEffect(() => {
    if (!loading && user && !isGestorNivel(user.role)) router.replace("/painel-corretor")
  }, [loading, user, router])
  return { user, loading, bloqueado: !loading && !!user && !isGestorNivel(user.role) }
}

export default function RegrasPage() {
  const { user, loading: gateLoading, bloqueado } = useAuthSafeGate()
  const { automations, jobs, templates, toggleAutomation, deleteAutomation } = useAutomation()
  const { users } = useLeads()

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [expandedTemplates, setExpandedTemplates] = useState<Record<string, boolean>>({})

  if (gateLoading) return <div className="py-16 text-center text-muted-foreground animate-pulse">Carregando regras...</div>
  if (bloqueado || !user) return null

  const scheduledCount = jobs.filter((j) => ["scheduled", "pending_validation"].includes(j.status)).length

  const filtered = automations.filter((a) => {
    if (filterStatus !== "all" && a.status !== filterStatus) return false
    return true
  })

  function userName(id: string | null) {
    return id ? users.find((u) => u.id === id)?.nome ?? "—" : "—"
  }

  function toggleExpandTemplates(automationId: string) {
    setExpandedTemplates((prev) => ({ ...prev, [automationId]: !prev[automationId] }))
  }

  async function handleDelete(id: string) {
    await deleteAutomation(id)
    setConfirmDelete(null)
  }

  // Identifica templates relevantes da automação
  function getTemplatesForAutomation(auto: Automation) {
    if (auto.id === "b0000000-0000-0000-0000-000000000002") {
      // Régua D+1, D+2, D+3
      return templates.filter((t) =>
        [
          "a0000000-0000-0000-0000-000000000002",
          "a0000000-0000-0000-0000-000000000003",
          "a0000000-0000-0000-0000-000000000004",
        ].includes(t.id)
      )
    }
    // Automação 1 ou geral
    return templates.filter((t) => t.id === "a0000000-0000-0000-0000-000000000001")
  }

  // Estatísticas calculadas por automação
  function getStatsForAutomation(autoId: string) {
    const autoJobs = jobs.filter((j) => j.automation_id === autoId)
    const enviados = autoJobs.filter((j) => ["sent", "delivered", "read", "responded"].includes(j.status)).length
    const respondidos = autoJobs.filter((j) => j.status === "responded" || j.responded_at).length
    const pendentes = autoJobs.filter((j) => ["scheduled", "pending_validation", "retrying"].includes(j.status)).length
    const taxa = enviados ? Math.round((respondidos / enviados) * 1000) / 10 : 0
    return { total: autoJobs.length, enviados, respondidos, pendentes, taxa }
  }

  return (
    <div className="space-y-6">
      {/* 1. Subnavegação Unificada */}
      <AutomationSubNav pendingJobsCount={scheduledCount} />

      {/* 2. Header & Ações */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Zap className="size-4" />
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Regras de Automação & Cadência
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure gatilhos, réguas de toques progressivos (D+1, D+2, D+3), tetos anti-banimento e modelos de mensagem.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <EmergencyPauseButton />
          <Link
            href="/automacoes/nova"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-xs transition hover:bg-primary/90"
          >
            <Plus className="size-3.5" /> Nova Automação
          </Link>
        </div>
      </div>

      {/* 3. Filtros Rápidos */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/60 p-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold text-muted-foreground flex items-center gap-1">
            <Filter className="size-3.5" /> Filtrar Status:
          </span>
          {(["all", "active", "paused", "draft"] as const).map((s) => {
            const rotulos = {
              all: "Todas",
              active: "Ativas",
              paused: "Pausadas",
              draft: "Rascunhos",
            }
            return (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition",
                  filterStatus === s
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "bg-background text-muted-foreground border border-border/60 hover:text-foreground hover:bg-muted"
                )}
              >
                {rotulos[s]}
              </button>
            )
          })}
        </div>

        <span className="text-xs text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "regra encontrada" : "regras encontradas"}
        </span>
      </div>

      {/* 4. Lista de Regras com Detalhes Aprofundados */}
      <div className="space-y-4">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Zap className="mx-auto mb-3 size-10 text-muted-foreground/30" />
              <p className="text-sm font-medium text-foreground">Nenhuma regra encontrada com este filtro</p>
              <p className="text-xs text-muted-foreground mt-1">Crie uma nova automação ou ajuste o filtro acima.</p>
              <Link
                href="/automacoes/nova"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs"
              >
                <Plus className="size-3.5" /> Criar Automação
              </Link>
            </CardContent>
          </Card>
        ) : (
          filtered.map((auto) => {
            const ehFollowup = auto.id === "b0000000-0000-0000-0000-000000000002"
            const ativa = auto.status === "active"
            const templatesAuto = getTemplatesForAutomation(auto)
            const stats = getStatsForAutomation(auto.id)
            const isExpanded = !!expandedTemplates[auto.id]

            return (
              <Card key={auto.id} className="transition-all hover:border-border overflow-hidden">
                <CardContent className="p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    {/* Bloco de Informações Principais */}
                    <div className="min-w-0 flex-1 space-y-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "size-2.5 rounded-full shrink-0",
                              ativa ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40"
                            )}
                          />
                          <h3 className="font-display text-base font-bold text-foreground">{auto.name}</h3>
                          <Badge variant={AUTOMATION_STATUS_VARIANT[auto.status]}>
                            {AUTOMATION_STATUS_LABEL[auto.status]}
                          </Badge>
                          {ehFollowup && (
                            <Badge variant="blue">Régua D+1, D+2, D+3</Badge>
                          )}
                        </div>

                        {auto.description && (
                          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                            {auto.description}
                          </p>
                        )}
                      </div>

                      {/* Metadados Técnicos em Badges Semânticos */}
                      <div className="flex flex-wrap gap-2 text-xs">
                        <div className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-muted/30 px-2 py-1 text-muted-foreground">
                          <Smartphone className="size-3 text-emerald-600 dark:text-emerald-400" />
                          <span>Linhas: <strong>Patrícia 1 & 2</strong></span>
                        </div>

                        <div className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-muted/30 px-2 py-1 text-muted-foreground">
                          <Shield className="size-3 text-amber-600 dark:text-amber-400" />
                          <span>Teto Seguro: <strong>{ehFollowup ? "30 msgs/linha/dia" : `${auto.limits_config.max_daily_sends ?? 25}/dia`}</strong></span>
                        </div>

                        <div className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-muted/30 px-2 py-1 text-muted-foreground">
                          <Clock className="size-3 text-blue-600 dark:text-blue-400" />
                          <span>Cadência: <strong>{ehFollowup ? "24h entre etapas" : `Espera ${auto.wait_config.amount} ${auto.wait_config.unit}`}</strong></span>
                        </div>

                        <div className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-muted/30 px-2 py-1 text-muted-foreground">
                          <CheckCircle2 className="size-3 text-purple-600 dark:text-purple-400" />
                          <span>Interrupção: <strong>Desarma ao responder</strong></span>
                        </div>
                      </div>

                      {/* Métricas Rápidas de Performance da Regra */}
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 rounded-xl border border-border/60 bg-card/40 p-3 text-center">
                        <div>
                          <p className="text-sm font-bold tabular-nums text-foreground">{stats.enviados}</p>
                          <p className="text-[10px] text-muted-foreground">Enviados</p>
                        </div>
                        <div>
                          <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{stats.respondidos}</p>
                          <p className="text-[10px] text-muted-foreground">Responderam</p>
                        </div>
                        <div>
                          <p className="text-sm font-bold tabular-nums text-primary">{stats.taxa}%</p>
                          <p className="text-[10px] text-muted-foreground">Taxa de Resposta</p>
                        </div>
                        <div>
                          <p className="text-sm font-bold tabular-nums text-amber-600 dark:text-amber-400">{stats.pendentes}</p>
                          <p className="text-[10px] text-muted-foreground">Na Fila</p>
                        </div>
                      </div>
                    </div>

                    {/* Ações da Automação */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0 border-t border-border/60 pt-3 lg:border-t-0 lg:pt-0">
                      <button
                        onClick={() => toggleAutomation(auto.id)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                          ativa
                            ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            : "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        )}
                      >
                        {ativa ? <><Pause className="size-3.5" /> Pausar</> : <><Play className="size-3.5" /> Ativar</>}
                      </button>

                      <Link
                        href={`/automacoes/fila?automation_id=${auto.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
                      >
                        <Layers className="size-3.5 text-muted-foreground" /> Ver Fila
                      </Link>

                      <Link
                        href={`/automacoes/logs?automation_id=${auto.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
                      >
                        <ScrollText className="size-3.5 text-muted-foreground" /> Logs
                      </Link>

                      <Link
                        href={`/automacoes/nova?id=${auto.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
                      >
                        <Settings className="size-3.5 text-muted-foreground" /> Configurar
                      </Link>

                      <button
                        onClick={() => setConfirmDelete(auto.id)}
                        className="rounded-lg border border-red-200 p-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                        title="Excluir automação"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Accordion para Ver Mensagens e Textos Enviados aos Clientes */}
                  {templatesAuto.length > 0 && (
                    <div className="mt-4 border-t border-border/60 pt-3">
                      <button
                        onClick={() => toggleExpandTemplates(auto.id)}
                        className="flex w-full items-center justify-between text-xs font-semibold text-primary hover:underline"
                      >
                        <span className="flex items-center gap-1.5">
                          <MessageCircle className="size-3.5" />
                          {isExpanded ? "Ocultar modelos de mensagem vinculados" : `Ver ${templatesAuto.length} mensagem(ns) vinculada(s)`}
                        </span>
                        {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                      </button>

                      {isExpanded && (
                        <div className="mt-3 space-y-3">
                          {templatesAuto.map((tpl, i) => (
                            <div
                              key={tpl.id}
                              className="rounded-lg border border-border/80 bg-muted/20 p-3 text-xs space-y-1.5"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-foreground">
                                  {tpl.name || `Template ${i + 1}`}
                                </span>
                                <Badge variant="gray">WhatsApp</Badge>
                              </div>
                              <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground font-sans">
                                {tpl.content}
                              </p>
                              {tpl.variables?.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-1">
                                  <span className="text-[10px] text-muted-foreground mr-1">Variáveis:</span>
                                  {tpl.variables.map((v) => (
                                    <span
                                      key={v}
                                      className="rounded bg-primary/10 px-1 py-0.2 text-[10px] font-mono text-primary"
                                    >
                                      {`{{${v}}}`}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Dialog Confirmação de Exclusão */}
      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Excluir Automação">
        <p className="text-sm text-muted-foreground">
          Tem certeza que deseja excluir esta automação permanentemente? Todos os agendamentos pendentes associados serão cancelados.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => setConfirmDelete(null)}
            className="rounded-lg border border-border px-3.5 py-2 text-xs font-medium hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            onClick={() => confirmDelete && handleDelete(confirmDelete)}
            className="rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-700"
          >
            Excluir Automação
          </button>
        </div>
      </Dialog>
    </div>
  )
}
