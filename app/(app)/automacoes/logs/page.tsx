"use client"

import { useState, useMemo } from "react"
import {
  ScrollText,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Send,
  MessageCircle,
  Users,
  Shield,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Smartphone,
  ExternalLink,
} from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent, Badge, Table, THead, TR, TH, TD, Input, Select } from "@/components/ui/primitives"
import { useAutomation } from "@/lib/automation-store"
import { useLeads } from "@/lib/leads-store"
import { EVENT_TYPE_LABEL, EVENT_TYPE_VARIANT, type AutomationLog } from "@/lib/automation-types"
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

export default function LogsPage() {
  const { user, loading: gateLoading, bloqueado } = useAuthSafeGate()
  const { logs, automations, loadLogs } = useAutomation()
  const { leads } = useLeads()

  const [filterCategory, setFilterCategory] = useState<string>("all")
  const [filterAutomation, setFilterAutomation] = useState<string>("all")
  const [search, setSearch] = useState("")
  const [expandedLog, setExpandedLog] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  if (gateLoading) return <div className="py-16 text-center text-muted-foreground animate-pulse">Carregando logs de auditoria...</div>
  if (bloqueado || !user) return null

  function leadName(id: string | null) {
    return id ? leads.find((l) => l.id === id)?.nome ?? "Lead" : "—"
  }
  function leadPhone(id: string | null) {
    return id ? leads.find((l) => l.id === id)?.telefone ?? "" : ""
  }
  function automationName(id: string | null) {
    return id ? automations.find((a) => a.id === id)?.name ?? "Automação" : "Sistema Geral"
  }

  // Métricas agregadas dos logs
  const enviosCount = logs.filter((l) => ["message_sent", "job_executed"].includes(l.event_type as string) || (l.event_type as string).includes("envio")).length
  const respostasCount = logs.filter((l) => ["lead_responded", "lead_respondeu_atendimento_ia"].includes(l.event_type as string) || (l.event_type as string).includes("resposta")).length
  const acoesHumanasCount = logs.filter((l) => ["ia_pausada_mensagem_manual", "job_cancelled"].includes(l.event_type as string) || (l.actor_type as string) === "corretor" || (l.actor_type as string) === "gestor").length
  const iaAutoPausaCount = logs.filter((l) => (l.event_type as string) === "ia_inativa_auto_pausa" || (l.event_type as string).includes("auto_pausa")).length

  // Categorização semântica dos eventos para filtro intuitivo
  function matchCategory(log: AutomationLog, category: string): boolean {
    if (category === "all") return true
    const evType = log.event_type as string
    const actor = log.actor_type as string
    if (category === "envios") {
      return ["message_sent", "message_delivered", "message_read", "job_created"].includes(evType) || evType.includes("envio")
    }
    if (category === "respostas") {
      return ["lead_responded", "lead_respondeu_atendimento_ia"].includes(evType) || evType.includes("respondeu")
    }
    if (category === "humano") {
      return actor === "corretor" || actor === "gestor" || evType.includes("manual") || evType === "job_cancelled"
    }
    if (category === "ia_semaforo") {
      return evType.includes("ia_") || evType.includes("auto_pausa") || evType.includes("semaforo")
    }
    if (category === "falhas") {
      return ["send_failed", "supervision_failed"].includes(evType) || evType.includes("failed") || evType.includes("erro")
    }
    return true
  }

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (!matchCategory(l, filterCategory)) return false
      if (filterAutomation !== "all" && l.automation_id !== filterAutomation) return false
      if (search.trim()) {
        const s = search.trim().toLowerCase()
        const lead = leads.find((ld) => ld.id === l.lead_id)
        const matchLead = lead?.nome?.toLowerCase().includes(s)
        const matchTitle = (l.event_title ?? "").toLowerCase().includes(s)
        const matchDesc = (l.event_description ?? "").toLowerCase().includes(s)
        if (!matchLead && !matchTitle && !matchDesc) return false
      }
      return true
    })
  }, [logs, filterCategory, filterAutomation, search, leads])

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await loadLogs()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Subnavegação Unificada */}
      <AutomationSubNav />

      {/* 2. Header & Ações */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
              <ScrollText className="size-4" />
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Logs de Auditoria & Atividades
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Rastreabilidade completa de cada mensagem disparada, resposta captada, destravamento da IA e intervenção humana.
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground transition hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={cn("size-3.5", refreshing && "animate-spin text-primary")} />
          Atualizar Logs
        </button>
      </div>

      {/* 3. Indicadores Rápidos de Atividade */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Envios Registrados</span>
              <Send className="size-4 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{enviosCount}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Disparos da régua e reativação</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Respostas Captadas</span>
              <MessageCircle className="size-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{respostasCount}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Desarmes automáticos ativados</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Intervenções Humanas</span>
              <Users className="size-4 text-purple-600 dark:text-purple-400" />
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-purple-600 dark:text-purple-400">{acoesHumanasCount}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Corretores assumiram conversa</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Auto-Pausa Semáforo IA</span>
              <Shield className="size-4 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{iaAutoPausaCount}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Conversas liberadas para follow-up</p>
          </CardContent>
        </Card>
      </div>

      {/* 4. Filtros Avançados */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap gap-1.5 border-b border-border/60 pb-3">
            {[
              { id: "all", label: "Todos os Eventos" },
              { id: "envios", label: "Disparos" },
              { id: "respostas", label: "Respostas" },
              { id: "humano", label: "Ações Humanas" },
              { id: "ia_semaforo", label: "Semáforo IA" },
              { id: "falhas", label: "Falhas / Alertas" },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setFilterCategory(cat.id)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition",
                  filterCategory === cat.id
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[220px]">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por lead, mensagem ou título do evento..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 text-xs"
                />
              </div>
            </div>

            <div className="w-60">
              <Select value={filterAutomation} onChange={(e) => setFilterAutomation(e.target.value)} className="text-xs">
                <option value="all">Todas as Automações / Sistema</option>
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

      {/* 5. Tabela de Logs Formatada */}
      <Card className="overflow-hidden">
        <Table>
          <THead>
            <TR>
              <TH>Data / Hora</TH>
              <TH>Tipo de Evento</TH>
              <TH>Lead Vinculado</TH>
              <TH>Origem / Automação</TH>
              <TH>Ator</TH>
              <TH>Descrição da Ação</TH>
              <TH></TH>
            </TR>
          </THead>
          <tbody>
            {filtered.length === 0 ? (
              <TR>
                <TD colSpan={7} className="py-16 text-center text-sm text-muted-foreground">
                  <ScrollText className="size-8 mx-auto mb-2 text-muted-foreground/30" />
                  <p className="font-semibold text-foreground">Nenhum evento registrado com os filtros atuais</p>
                  <p className="text-xs mt-1">Experimente trocar a categoria ou limpar a busca.</p>
                </TD>
              </TR>
            ) : (
              filtered.slice(0, 150).map((log) => {
                const isExpanded = expandedLog === log.id
                const leadNome = leadName(log.lead_id)
                const phone = leadPhone(log.lead_id)

                return (
                  <>
                    <TR key={log.id} className="hover:bg-muted/30 transition-colors">
                      <TD className="whitespace-nowrap text-xs font-mono text-muted-foreground">
                        {fmtDateTime(log.created_at)}
                      </TD>

                      <TD>
                        <Badge variant={EVENT_TYPE_VARIANT[log.event_type] ?? "gray"}>
                          {EVENT_TYPE_LABEL[log.event_type] ?? log.event_type}
                        </Badge>
                      </TD>

                      <TD>
                        {log.lead_id ? (
                          <div>
                            <span className="font-semibold text-foreground text-xs">{leadNome}</span>
                            {phone && (
                              <p className="text-[11px] text-muted-foreground font-mono">{phone}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TD>

                      <TD className="text-xs text-muted-foreground truncate max-w-[150px]">
                        {automationName(log.automation_id)}
                      </TD>

                      <TD>
                        <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium capitalize text-foreground">
                          {log.actor_type || "sistema"}
                        </span>
                      </TD>

                      <TD className="max-w-[280px]">
                        <p className="text-xs font-medium text-foreground truncate" title={log.event_title}>
                          {log.event_title}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5" title={log.event_description ?? undefined}>
                          {log.event_description}
                        </p>
                      </TD>

                      <TD>
                        {Object.keys(log.payload ?? {}).length > 0 && (
                          <button
                            onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            title="Ver detalhes técnicos"
                          >
                            {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                          </button>
                        )}
                      </TD>
                    </TR>

                    {isExpanded && (
                      <TR key={`${log.id}-detail`}>
                        <TD colSpan={7} className="bg-muted/20 p-4 border-b border-border/80">
                          <div className="rounded-lg border border-border/70 bg-card p-3 space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-foreground">Metadados Técnicos do Evento</span>
                              <span className="text-[11px] font-mono text-muted-foreground">ID: {log.id}</span>
                            </div>
                            <pre className="max-h-48 overflow-auto rounded bg-muted/50 p-2.5 font-mono text-[11px] text-muted-foreground leading-relaxed">
                              {JSON.stringify(log.payload, null, 2)}
                            </pre>
                          </div>
                        </TD>
                      </TR>
                    )}
                  </>
                )
              })
            )}
          </tbody>
        </Table>
      </Card>
    </div>
  )
}
