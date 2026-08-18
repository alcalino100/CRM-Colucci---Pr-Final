"use client"

import { useState } from "react"
import { ScrollText, Search, Filter, ChevronDown, ChevronUp } from "lucide-react"
import { Card, CardContent, Badge, Table, THead, TR, TH, TD, Input, Select, Label } from "@/components/ui/primitives"
import { useAutomation } from "@/lib/automation-store"
import { useLeads } from "@/lib/leads-store"
import { EVENT_TYPE_LABEL, EVENT_TYPE_VARIANT, type AutomationLog } from "@/lib/automation-types"
import { fmtDateTime } from "@/lib/labels"

export default function LogsPage() {
  const { logs, automations } = useAutomation()
  const { leads } = useLeads()
  const [filterEvent, setFilterEvent] = useState<string>("all")
  const [filterAutomation, setFilterAutomation] = useState<string>("all")
  const [search, setSearch] = useState("")
  const [expandedLog, setExpandedLog] = useState<string | null>(null)

  const filtered = logs.filter((l) => {
    if (filterEvent !== "all" && l.event_type !== filterEvent) return false
    if (filterAutomation !== "all" && l.automation_id !== filterAutomation) return false
    if (search) {
      const lead = leads.find((ld) => ld.id === l.lead_id)
      if (!lead?.nome?.toLowerCase().includes(search.toLowerCase())) return false
    }
    return true
  })

  function leadName(id: string | null) { return id ? leads.find((l) => l.id === id)?.nome ?? "—" : "—" }
  function automationName(id: string | null) { return id ? automations.find((a) => a.id === id)?.name ?? "—" : "—" }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Logs de Automação</h1>
        <p className="text-sm text-muted-foreground">{logs.length} eventos registrados · {filtered.length} exibidos</p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
              <Label>Buscar lead</Label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input placeholder="Nome do lead..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
            </div>
            <div className="w-48">
              <Label>Tipo de Evento</Label>
              <Select value={filterEvent} onChange={(e) => setFilterEvent(e.target.value)}>
                <option value="all">Todos</option>
                {Object.entries(EVENT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
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

      {/* Tabela de logs */}
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Data/Hora</TH>
              <TH>Evento</TH>
              <TH>Lead</TH>
              <TH>Automação</TH>
              <TH>Ator</TH>
              <TH>Descrição</TH>
              <TH></TH>
            </TR>
          </THead>
          <tbody>
            {filtered.length === 0 ? (
              <TR>
                <TD colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                  <ScrollText className="mx-auto mb-2 size-8 text-muted-foreground/40" />
                  Nenhum log encontrado
                </TD>
              </TR>
            ) : (
              filtered.slice(0, 200).map((log) => (
                <>
                  <TR key={log.id}>
                    <TD className="whitespace-nowrap text-xs">{fmtDateTime(log.created_at)}</TD>
                    <TD>
                      <Badge variant={EVENT_TYPE_VARIANT[log.event_type] ?? "gray"}>
                        {EVENT_TYPE_LABEL[log.event_type] ?? log.event_type}
                      </Badge>
                    </TD>
                    <TD className="text-xs">{leadName(log.lead_id)}</TD>
                    <TD className="text-xs">{automationName(log.automation_id)}</TD>
                    <TD className="text-xs capitalize">{log.actor_type}</TD>
                    <TD className="max-w-[200px] truncate text-xs text-muted-foreground">{log.event_description ?? "—"}</TD>
                    <TD>
                      {Object.keys(log.payload ?? {}).length > 0 && (
                        <button
                          onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                          className="rounded p-1 text-muted-foreground hover:bg-muted"
                        >
                          {expandedLog === log.id ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                        </button>
                      )}
                    </TD>
                  </TR>
                  {expandedLog === log.id && (
                    <TR key={`${log.id}-detail`}>
                      <TD colSpan={7} className="bg-muted/30">
                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
                          {JSON.stringify(log.payload, null, 2)}
                        </pre>
                      </TD>
                    </TR>
                  )}
                </>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </div>
  )
}
