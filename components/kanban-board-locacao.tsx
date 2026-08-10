"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search, SearchX, X } from "lucide-react"
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd"
import { Button } from "@/components/ui/button"
import { Dialog, Input, Label, Select, Textarea, useToast } from "@/components/ui/primitives"
import { LeadCard } from "@/components/lead-card-locacao"
import { LocacaoLeadForm, type LocacaoLeadFormValues } from "@/components/locacao-lead-form"
import { useSaleCelebration, SESSION_ID } from "@/components/sale-celebration"
import { supabase } from "@/lib/supabase/client"
import { useLocacao } from "@/lib/locacao-store"
import { useAuth } from "@/lib/auth-context"
import { LOCACAO_STATUSES, MOTIVOS_EXCLUSAO, LOCACAO_STATUS_ACCENT, LOCACAO_STATUS_LABEL, TEMPERATURAS, TEMP_LABEL, brl, normalizePhone, refsTexto } from "@/lib/locacao-labels"
import { ORIGENS, type Origem, type Temperatura } from "@/lib/mock-data"
import type { LocacaoLead, LocacaoStatus } from "@/lib/locacao-labels"
import { cn } from "@/lib/utils"

export function KanbanBoardLocacao({
  leads,
  showCorretor = false,
  currentCorretorId,
  isGestor = false,
  heightClass = "h-[calc(100vh-13rem)]",
}: {
  leads: LocacaoLead[]
  showCorretor?: boolean
  currentCorretorId: string
  isGestor?: boolean
  heightClass?: string
}) {
  const { updateLead, deleteLead, addVisit, addInteraction, notify, logChange, logAudit, assumirLead, visits, corretores, userName } = useLocacao()
  const { user } = useAuth()
  const router = useRouter()
  const toast = useToast()
  const celebrate = useSaleCelebration()
  const [visitLead, setVisitLead] = useState<LocacaoLead | null>(null)
  const [propLead, setPropLead] = useState<LocacaoLead | null>(null)
  const [closeLead, setCloseLead] = useState<LocacaoLead | null>(null)
  const [editLead, setEditLead] = useState<LocacaoLead | null>(null)
  const [assumirDialog, setAssumirDialog] = useState<LocacaoLead | null>(null)
  const [archiveLead, setArchiveLead] = useState<LocacaoLead | null>(null)
  const [desarquivarLead, setDesarquivarLead] = useState<LocacaoLead | null>(null)
  const [delLead, setDelLead] = useState<LocacaoLead | null>(null)
  const [delMotivo, setDelMotivo] = useState("")
  const [delDetalhe, setDelDetalhe] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [tempFilter, setTempFilter] = useState<Temperatura | "todas">("todas")
  const [origemFilter, setOrigemFilter] = useState<Origem | "todas">("todas")
  const [statusFilter, setStatusFilter] = useState<LocacaoStatus | "todos">("todos")
  const [corretorFilter, setCorretorFilter] = useState<string>("todos")
  const [query, setQuery] = useState("")
  const [showArchived, setShowArchived] = useState(false)

  const usuarioNome = user ? userName(user.id) : "Sistema"
  const canManage = (lead: LocacaoLead) => isGestor || lead.corretorId === currentCorretorId
  function handleEditSubmit(v: LocacaoLeadFormValues) {
    if (!editLead) return
    if (v.status === "locado" && editLead.status !== "locado") {
      // Fechamento só é gravado pelo fluxo obrigatório (REF + valor do aluguel)
      setFRefs(refsTexto(editLead))
      setFValor(editLead.valorAluguel ? String(editLead.valorAluguel) : "")
      setCloseLead(editLead)
      setEditLead(null)
      return
    }
    setSubmitting(true)
    const fields: (keyof LocacaoLeadFormValues)[] = ["nome", "telefone", "email", "imovelRef", "origem", "observacoes", "status", "valorAluguel", "corretorId", "temperatura"]
    for (const f of fields) {
      const before = (editLead as any)[f]
      const after = (v as any)[f]
      if (String(before ?? "") !== String(after ?? "")) {
        logChange({ usuario: usuarioNome, acao: "edicao", entidade: "lead", campo: f, valorAnterior: String(before ?? "-"), valorNovo: String(after ?? "-") })
        if (f === "temperatura") {
          logAudit({ leadId: editLead.id, leadNome: editLead.nome, usuarioNome, tipo: "temperatura", descricao: `Temperatura alterada: ${String(before)} → ${String(after)}` })
        }
        if (f === "corretorId") {
          logAudit({ leadId: editLead.id, leadNome: editLead.nome, usuarioNome, tipo: "responsavel", descricao: `Responsável alterado: ${userName(String(before))} → ${userName(String(after))}` })
          notify(`Responsável do lead ${editLead.nome} alterado para ${userName(String(after))}`, { tipo: "responsavel", paraRole: "gestor", leadId: editLead.id })
          notify(`Você agora é responsável pelo lead ${editLead.nome}`, { tipo: "responsavel", paraUsuarioId: String(after), leadId: editLead.id })
        }
      }
    }
    void (async () => {
      const result = await updateLead(editLead.id, v)
      setSubmitting(false)
      if (!result.ok) return toast(result.error ?? "Não foi possível atualizar o lead.", "error")
      setEditLead(null)
      toast("Lead atualizado com sucesso")
    })()
  }

  function closeDelete() {
    setDelLead(null)
    setDelMotivo("")
    setDelDetalhe("")
  }

  async function handleDeleteConfirm() {
    if (!delLead || submitting) return
    if (!delMotivo) return toast("Selecione o motivo da exclusão.", "error")
    if (!delDetalhe.trim()) return toast("Descreva o motivo da exclusão.", "error")
    setSubmitting(true)
    const alvo = delLead
    const res = await deleteLead(alvo.id, delMotivo, delDetalhe.trim())
    setSubmitting(false)
    if (!res.ok) {
      toast(res.error ?? "Não foi possível excluir o lead.", "error")
      return
    }
    logChange({ usuario: usuarioNome, acao: "exclusao", entidade: "lead", campo: "lead", valorAnterior: `${alvo.nome} — ${alvo.imovelRef || "sem imóvel"} (motivo: ${delMotivo})`, valorNovo: "-" })
    closeDelete()
    toast("Lead excluído com sucesso")
  }

  // visit form
  const [vData, setVData] = useState("")
  const [vHora, setVHora] = useState("10:00")
  const [vCorretor, setVCorretor] = useState("")
  const [vRefs, setVRefs] = useState("")
  const [vObs, setVObs] = useState("")
  // proposal form
  const [pValor, setPValor] = useState("")
  const [pRefs, setPRefs] = useState("")
  const [pObs, setPObs] = useState("")
  // fechamento form
  const [fRefs, setFRefs] = useState("")
  const [fValor, setFValor] = useState("")

  function onDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result
    if (!destination || destination.droppableId === source.droppableId) return
    const newStatus = destination.droppableId as LocacaoStatus
    const lead = leads.find((l) => l.id === draggableId)
    if (!lead || !canManage(lead)) return
    moveLead(lead, newStatus)
  }

  function moveLead(lead: LocacaoLead, newStatus: LocacaoStatus) {
    if (newStatus === "locado") {
      // status só é gravado após confirmar a referência e o valor do aluguel
      setFRefs(refsTexto(lead))
      setFValor(lead.valorAluguel ? String(lead.valorAluguel) : "")
      setCloseLead(lead)
      return
    }

    updateLead(lead.id, { status: newStatus })
    logAudit({ leadId: lead.id, leadNome: lead.nome, usuarioNome, tipo: "etapa", descricao: `Etapa alterada: ${LOCACAO_STATUS_LABEL[lead.status]} → ${LOCACAO_STATUS_LABEL[newStatus]}` })
    notify(`${lead.nome} movido para "${LOCACAO_STATUS_LABEL[newStatus]}" por ${usuarioNome}`, { tipo: "pipeline", paraRole: "gestor", leadId: lead.id })
    if (lead.corretorId && lead.corretorId !== user?.id) {
      notify(`Seu lead ${lead.nome} foi movido para "${LOCACAO_STATUS_LABEL[newStatus]}"`, { tipo: "pipeline", paraUsuarioId: lead.corretorId, leadId: lead.id })
    }

    if (newStatus === "visita agendada") {
      setVData(new Date().toISOString().slice(0, 10))
      setVHora("10:00")
      setVCorretor(lead.corretorId || currentCorretorId)
      setVRefs(refsTexto(lead))
      setVObs("")
      setVisitLead(lead)
    } else if (newStatus === "negociando") {
      setPValor(lead.valorAluguel ? String(lead.valorAluguel) : "")
      setPRefs(refsTexto(lead))
      setPObs("")
      setPropLead(lead)
    } else {
      toast(`${lead.nome} movido para "${LOCACAO_STATUS_LABEL[newStatus]}"`)
    }
  }

  function confirmVisit(e: React.FormEvent) {
    e.preventDefault()
    if (!visitLead || !vData) return
    if (!vRefs.trim()) {
      toast("Informe a(s) referência(s) do imóvel da visita.", "error")
      return
    }
    addVisit({ leadId: visitLead.id, data: vData, hora: vHora, corretorId: vCorretor, imovelRef: vRefs.trim(), referencias: vRefs.trim(), observacoes: vObs })
    addInteraction(visitLead.id, { corretor: userName(vCorretor), texto: `Visita agendada para ${vData.split("-").reverse().join("/")} às ${vHora} — Ref: ${vRefs.trim()}.` })
    toast("Visita agendada e enviada para a agenda.")
    setVisitLead(null)
  }

  function confirmProposal(e: React.FormEvent) {
    e.preventDefault()
    if (!propLead) return
    const valor = Number(pValor)
    if (!valor || valor <= 0) {
      toast("Informe um valor válido.", "error")
      return
    }
    if (!pRefs.trim()) {
      toast("Informe a(s) referência(s) da proposta.", "error")
      return
    }
    updateLead(propLead.id, { valorAluguel: valor })
    if (pObs) addInteraction(propLead.id, { corretor: userName(propLead.corretorId), texto: pObs })
    logAudit({ leadId: propLead.id, leadNome: propLead.nome, usuarioNome, tipo: "proposta", descricao: `Proposta registrada: ${brl(valor)} por ${userName(propLead.corretorId)}`, referencias: pRefs.trim() })
    notify(`Nova proposta: ${propLead.nome} — Ref: ${pRefs.trim()} — ${brl(valor)} por ${userName(propLead.corretorId)}`, { tipo: "proposta", paraRole: "gestor", leadId: propLead.id })
    if (propLead.corretorId) {
      notify(`Proposta registrada no seu lead ${propLead.nome}: ${brl(valor)}`, { tipo: "proposta", paraUsuarioId: propLead.corretorId, leadId: propLead.id })
    }
    toast("Proposta registrada. Gestores notificados.")
    fetch("/api/whatsapp/notify-proposta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        nome: propLead.nome,
        valor,
        corretorNome: userName(propLead.corretorId),
        refProposta: pRefs.trim(),
      }),
    }).catch(() => {})
    setPropLead(null)
  }

  function confirmClose(e: React.FormEvent) {
    e.preventDefault()
    if (!closeLead) return
    if (!fRefs.trim()) {
      toast("Informe a(s) referência(s) do imóvel locado.", "error")
      return
    }
    const valor = Number(fValor)
    if (!valor || valor <= 0) {
      toast("Informe o valor do aluguel.", "error")
      return
    }
    updateLead(closeLead.id, { status: "locado", valorAluguel: valor, locadoEm: new Date().toISOString() })
    logAudit({ leadId: closeLead.id, leadNome: closeLead.nome, usuarioNome, tipo: "fechamento", descricao: `Locação fechada por ${userName(closeLead.corretorId)} — ${brl(valor)}`, referencias: fRefs.trim() })
    celebrate({
      nome: closeLead.nome,
      valor,
      ref: fRefs.trim(),
      tipo: "Locação",
      corretor: userName(closeLead.corretorId),
    })
    // Transmite em tempo real para o corretor do lead e para os gestores
    supabase
      .channel("crm-celebracoes")
      .send({
        type: "broadcast",
        event: "sale",
        payload: {
          nome: closeLead.nome,
          valor,
          ref: fRefs.trim(),
          tipo: "Locação",
          corretor: userName(closeLead.corretorId),
          session: SESSION_ID,
        },
      })
      .then(() => {})
    setCloseLead(null)
  }

  async function handleAssumir() {
    if (!assumirDialog || !user) return
    const novoGestor = assumirDialog.gestorResponsavel ? null : user.id
    const res = await updateLead(assumirDialog.id, { gestorResponsavel: novoGestor })
    if (!res.ok) return toast(res.error ?? "Erro ao assumir lead.", "error")
    const msg = novoGestor
      ? `Gestor ${userName(user.id)} assumiu a supervisão do lead ${assumirDialog.nome}`
      : `Gestor ${userName(user.id)} removeu a supervisão do lead ${assumirDialog.nome}`
    logAudit({ leadId: assumirDialog.id, leadNome: assumirDialog.nome, usuarioNome: userName(user.id), tipo: "responsavel", descricao: msg })
    notify(msg, { tipo: "responsavel", paraRole: "gestor", leadId: assumirDialog.id })
    if (assumirDialog.corretorId) {
      notify(novoGestor ? `Seu lead ${assumirDialog.nome} foi assumido pela gestão` : `A supervisão do lead ${assumirDialog.nome} foi removida pela gestão`, { tipo: "responsavel", paraUsuarioId: assumirDialog.corretorId, leadId: assumirDialog.id })
    }
    setAssumirDialog(null)
    toast(novoGestor ? "Lead assumido com sucesso!" : "Supervisão removida.")
  }

  async function handleArquivar() {
    if (!archiveLead || !user || submitting) return
    if (user.role !== "gestor") {
      setArchiveLead(null)
      return
    }
    setSubmitting(true)
    const alvo = archiveLead
    await updateLead(alvo.id, { arquivadoEm: new Date().toISOString() })
    logAudit({
      leadId: alvo.id,
      leadNome: alvo.nome,
      usuarioNome: userName(user.id),
      tipo: "edicao",
      descricao: `Arquivado por ${userName(user.id)}${refsTexto(alvo) ? ` — Ref: ${refsTexto(alvo)}` : ""}`,
    })
    if (alvo.corretorId) {
      notify(`Seu lead ${alvo.nome} foi arquivado pela gestão`, { tipo: "fechamento", paraUsuarioId: alvo.corretorId, leadId: alvo.id })
    }
    setArchiveLead(null)
    setSubmitting(false)
    toast("Lead arquivado.")
  }

  async function handleDesarquivar() {
    if (!desarquivarLead || !user || submitting) return
    if (user.role !== "gestor") {
      setDesarquivarLead(null)
      return
    }
    setSubmitting(true)
    const alvo = desarquivarLead
    await updateLead(alvo.id, { arquivadoEm: null })
    logAudit({
      leadId: alvo.id,
      leadNome: alvo.nome,
      usuarioNome: userName(user.id),
      tipo: "edicao",
      descricao: `Desarquivado por ${userName(user.id)}${refsTexto(alvo) ? ` — Ref: ${refsTexto(alvo)}` : ""}`,
    })
    setDesarquivarLead(null)
    setSubmitting(false)
    toast("Lead desarquivado.")
  }

  const q = query.trim().toLowerCase()
  const qDigits = normalizePhone(query)
  const matchesQuery = (l: LocacaoLead) => {
    if (!q) return true
    const refs = (l.referencias?.map((r) => r.ref).join(" ") ?? "") + " " + (l.imovelRef ?? "")
    if (qDigits && normalizePhone(l.telefone).includes(qDigits)) return true
    return (
      l.nome.toLowerCase().includes(q) ||
      refs.toLowerCase().includes(q) ||
      (l.observacoes ?? "").toLowerCase().includes(q)
    )
  }
  const filtered = leads.filter(
    (l) =>
      (showArchived || !l.arquivadoEm) &&
      (tempFilter === "todas" || l.temperatura === tempFilter) &&
      (origemFilter === "todas" || l.origem === origemFilter) &&
      (statusFilter === "todos" || l.status === statusFilter) &&
      (corretorFilter === "todos" || l.corretorId === corretorFilter) &&
      matchesQuery(l),
  )
  const byStatus = (s: LocacaoStatus) => filtered.filter((l) => l.status === s)
  const temFiltros = tempFilter !== "todas" || origemFilter !== "todas" || statusFilter !== "todos" || corretorFilter !== "todos" || !!q
  const noResults = temFiltros && filtered.length === 0

  const limparFiltros = () => {
    setQuery(""); setTempFilter("todas"); setOrigemFilter("todas"); setStatusFilter("todos"); setCorretorFilter("todos")
  }

  const chip = (active: boolean, color?: string) =>
    cn(
      "rounded-full border px-3 py-1 text-xs font-medium transition",
      active ? (color ?? "border-primary bg-primary text-primary-foreground") : "border-border bg-card text-muted-foreground hover:text-foreground",
    )

  return (
    <>
      <div className="relative mb-3 flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary/0 via-primary/70 to-primary/0" />
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar por nome, telefone ou ref"
            aria-label="Pesquisar leads"
            className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-9 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpar pesquisa"
              className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Temperatura:</span>
          <button type="button" onClick={() => setTempFilter("todas")} className={chip(tempFilter === "todas")}>Todas</button>
          {TEMPERATURAS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTempFilter(t)}
              className={chip(
                tempFilter === t,
                t === "quente" ? "border-red-600 bg-red-600 text-white" : t === "morno" ? "border-amber-500 bg-amber-500 text-white" : "border-slate-500 bg-slate-500 text-white",
              )}
            >
              {TEMP_LABEL[t]}
            </button>
          ))}
          <span className="ml-2 h-5 w-px bg-border" aria-hidden />
          <Select value={origemFilter} onChange={(e) => setOrigemFilter(e.target.value as Origem | "todas")} aria-label="Filtrar por origem" className="w-36 text-xs">
            <option value="todas">Origem: todas</option>
            {ORIGENS.map((o) => <option key={o} value={o}>{o}</option>)}
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as LocacaoStatus | "todos")} aria-label="Filtrar por status" className="w-44 text-xs">
            <option value="todos">Status: todos</option>
            {LOCACAO_STATUSES.map((s) => <option key={s} value={s}>{LOCACAO_STATUS_LABEL[s]}</option>)}
          </Select>
          {isGestor && (
            <Select value={corretorFilter} onChange={(e) => setCorretorFilter(e.target.value)} aria-label="Filtrar por corretor" className="w-40 text-xs">
              <option value="todos">Corretor: todos</option>
              {corretores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
          )}
          {temFiltros && (
            <button type="button" onClick={limparFiltros} className="rounded-full border border-dashed border-border px-3 py-1 text-xs font-medium text-primary transition hover:border-primary/40 hover:bg-primary/5">
              Limpar filtros
            </button>
          )}
          <span className="ml-2 h-5 w-px bg-border" aria-hidden />
          <button
            type="button"
            onClick={() => setShowArchived(!showArchived)}
            className={chip(showArchived, "#a1a1aa")}
          >
            {showArchived ? "Ocultar arquivados" : "Mostrar arquivados"}
          </button>
        </div>
      </div>
      {noResults ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/60 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <SearchX className="size-6" />
          </div>
          <p className="text-sm font-medium text-foreground">Nenhum lead encontrado para estes filtros</p>
          <button type="button" onClick={limparFiltros} className="text-xs font-medium text-primary hover:underline">Limpar filtros</button>
        </div>
      ) : (
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="kanban-scroll w-full flex-1 overflow-x-auto overflow-y-hidden pb-3">
          <div className={`flex w-max flex-nowrap gap-4 ${heightClass}`}>
          {LOCACAO_STATUSES.map((status) => {
            const col = byStatus(status)
            return (
              <Droppable droppableId={status} key={status}>
                {(provided, snapshot) => (
                  <div className="flex w-72 flex-shrink-0 flex-col">
                    <div className="mb-2 flex shrink-0 items-center justify-between rounded-t-xl border border-b-0 border-border bg-card px-3 py-2.5 shadow-sm" style={{ borderTopColor: LOCACAO_STATUS_ACCENT[status], borderTopWidth: 3, boxShadow: `0 6px 18px -8px ${LOCACAO_STATUS_ACCENT[status]}66` }}>
                      <span className="flex items-center gap-2 font-display text-sm font-semibold">
                        <span className="size-2 rounded-full" style={{ backgroundColor: LOCACAO_STATUS_ACCENT[status] }} aria-hidden />
                        {LOCACAO_STATUS_LABEL[status]}
                      </span>
                      <span className="flex min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-semibold text-muted-foreground">{col.length}</span>
                    </div>
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`-mt-2 flex min-h-32 flex-1 flex-col gap-2 overflow-y-auto rounded-b-xl border border-t-0 border-border p-2 transition-colors ${snapshot.isDraggingOver ? "bg-primary/5 ring-2 ring-inset ring-primary/30" : "bg-muted/40"}`}
                    >
                      {col.length === 0 && !snapshot.isDraggingOver && (
                        <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nenhum lead nesta etapa</p>
                      )}
                      {col.map((lead, i) => (
                        <Draggable draggableId={lead.id} index={i} key={lead.id}>
                          {(dp, ds) => (
                            <div
                              ref={dp.innerRef}
                              {...dp.draggableProps}
                              {...dp.dragHandleProps}
                              style={dp.draggableProps.style}
                              className={ds.isDragging ? "opacity-60" : ""}
                            >
                              <LeadCard
                                lead={lead}
                                showCorretor={showCorretor}
                                canManage={canManage(lead)}
                                podeExcluir={isGestor}
                                isGestor={isGestor}
                                onOpen={(item) => router.push(`/locacao/${item.id}`)}
                                onEdit={(item) => setEditLead(item)}
                                onDelete={(item) => setDelLead(item)}
                                onAssumir={(item) => setAssumirDialog(item)}
                                onArquivar={(item) => setArchiveLead(item)}
                                onDesarquivar={(item) => setDesarquivarLead(item)}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            )
          })}
          </div>
        </div>
      </DragDropContext>
      )}

      <Dialog open={!!visitLead} onClose={() => setVisitLead(null)} title="Agendar Visita">
        <form onSubmit={confirmVisit} className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Lead: <span className="font-medium text-foreground">{visitLead?.nome}</span> — {visitLead?.imovelRef || "sem imóvel"}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="vd">Data *</Label>
              <Input id="vd" type="date" value={vData} onChange={(e) => setVData(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="vh">Horário *</Label>
              <Input id="vh" type="time" value={vHora} onChange={(e) => setVHora(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="vr">Referência(s) do imóvel *</Label>
            <Input id="vr" value={vRefs} onChange={(e) => setVRefs(e.target.value)} placeholder="Ex: AP-1006, CA-2005" required />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="vc">Corretor responsável</Label>
            <Select id="vc" value={vCorretor} onChange={(e) => setVCorretor(e.target.value)}>
              {corretores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="vo">Observações</Label>
            <Textarea id="vo" value={vObs} onChange={(e) => setVObs(e.target.value)} />
          </div>
          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setVisitLead(null)}>Cancelar</Button>
            <Button type="submit">Agendar visita</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={!!propLead} onClose={() => setPropLead(null)} title="Registrar Proposta de Locação">
        <form onSubmit={confirmProposal} className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Lead: <span className="font-medium text-foreground">{propLead?.nome}</span> — {propLead?.imovelRef || "sem imóvel"}</p>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pv">Valor do aluguel (R$) *</Label>
            <Input id="pv" type="number" value={pValor} onChange={(e) => setPValor(e.target.value)} placeholder="2500" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pr">Referência(s) da proposta *</Label>
            <Input id="pr" value={pRefs} onChange={(e) => setPRefs(e.target.value)} placeholder="Ex: AP-1006" required />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="po">Observações</Label>
            <Textarea id="po" value={pObs} onChange={(e) => setPObs(e.target.value)} />
          </div>
          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setPropLead(null)}>Cancelar</Button>
            <Button type="submit">Registrar proposta</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={!!closeLead} onClose={() => setCloseLead(null)} title="Registrar Locação Fechada">
        <form onSubmit={confirmClose} className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Lead: <span className="font-medium text-foreground">{closeLead?.nome}</span> — {closeLead ? brl(closeLead.valorAluguel) : ""}</p>
          <div className="flex flex-col gap-1">
            <Label htmlFor="fr">Referência(s) do imóvel locado *</Label>
            <Input id="fr" value={fRefs} onChange={(e) => setFRefs(e.target.value)} placeholder="Ex: AP-1006" required />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="fvalor">Valor do aluguel (R$) *</Label>
            <Input id="fvalor" type="number" value={fValor} onChange={(e) => setFValor(e.target.value)} placeholder="2500" required />
          </div>
          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCloseLead(null)}>Cancelar</Button>
            <Button type="submit">Confirmar locação</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={!!editLead} onClose={() => setEditLead(null)} title="Editar Lead">
        {editLead && (
          <LocacaoLeadForm
            initial={editLead}
            defaultCorretorId={editLead.corretorId}
            showCorretor={isGestor}
            showStatus
            submitting={submitting}
            onSubmit={handleEditSubmit}
            onCancel={() => setEditLead(null)}
          />
        )}
      </Dialog>

      <Dialog open={!!assumirDialog} onClose={() => setAssumirDialog(null)} title="Assumir Atendimento">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Lead: <span className="font-medium text-foreground">{assumirDialog?.nome}</span>
            {assumirDialog && assumirDialog.corretorId && (
              <> — Corretor: <span className="font-medium text-foreground">{userName(assumirDialog.corretorId)}</span></>
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            {assumirDialog?.gestorResponsavel
              ? `Este lead está atualmente sob responsabilidade de ${userName(assumirDialog.gestorResponsavel)}. Deseja remover a supervisão deste lead?`
              : "Você está assumindo a supervisão deste lead. O corretor será notificado sobre sua supervisão."}
          </p>
          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setAssumirDialog(null)}>Cancelar</Button>
            <Button type="button" onClick={handleAssumir}>
              {assumirDialog?.gestorResponsavel ? "Remover supervisão" : "Assumir lead"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!archiveLead} onClose={() => (!submitting ? setArchiveLead(null) : undefined)} title="Arquivar Lead">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Lead: <span className="font-medium text-foreground">{archiveLead?.nome}</span>
            {archiveLead && archiveLead.corretorId && (
              <> — Corretor: <span className="font-medium text-foreground">{userName(archiveLead.corretorId)}</span></>
            )}
          </p>
          {archiveLead && (
            <p className="text-sm font-display font-semibold text-primary">{brl(archiveLead.valorAluguel)}{refsTexto(archiveLead) ? ` — Ref: ${refsTexto(archiveLead)}` : ""}</p>
          )}
          <p className="text-sm text-muted-foreground">
            O lead será <strong className="text-foreground">arquivado</strong> (sai do quadro, mas permanece no histórico). Nenhum evento será enviado ao Meta.
          </p>
          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setArchiveLead(null)} disabled={submitting}>Cancelar</Button>
            <Button type="button" onClick={handleArquivar} disabled={submitting}>
              {submitting ? "Arquivando…" : "Arquivar"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!desarquivarLead} onClose={() => (!submitting ? setDesarquivarLead(null) : undefined)} title="Desarquivar Lead">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Lead: <span className="font-medium text-foreground">{desarquivarLead?.nome}</span>
            {desarquivarLead && desarquivarLead.corretorId && (
              <> — Corretor: <span className="font-medium text-foreground">{userName(desarquivarLead.corretorId)}</span></>
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            O lead voltará para o quadro (etapa: <strong className="text-foreground">{desarquivarLead ? LOCACAO_STATUS_LABEL[desarquivarLead.status] : ""}</strong>).
          </p>
          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDesarquivarLead(null)} disabled={submitting}>Cancelar</Button>
            <Button type="button" onClick={handleDesarquivar} disabled={submitting}>
              {submitting ? "Desarquivando…" : "Desarquivar"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!delLead} onClose={() => (!submitting ? closeDelete() : undefined)} title="Excluir Lead">
        <p className="text-sm text-muted-foreground">
          Tem certeza que deseja excluir este lead? Esta ação não pode ser desfeita e será registrada na auditoria.
        </p>
        {delLead && (
          <p className="mt-2 text-sm font-medium text-foreground">{delLead.nome} — {delLead.imovelRef || "sem imóvel"}</p>
        )}
        <div className="mt-4 grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="del-motivo">Motivo da exclusão</Label>
            <Select id="del-motivo" value={delMotivo} onChange={(e) => setDelMotivo(e.target.value)}>
              <option value="">Selecione…</option>
              {MOTIVOS_EXCLUSAO.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="del-detalhe">Detalhe (obrigatório)</Label>
            <Textarea
              id="del-detalhe"
              rows={3}
              value={delDetalhe}
              onChange={(e) => setDelDetalhe(e.target.value)}
              placeholder="Explique o motivo desta exclusão para o registro de auditoria."
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={closeDelete} disabled={submitting}>Cancelar</Button>
          <Button type="button" className="bg-destructive text-white hover:bg-destructive/90" onClick={handleDeleteConfirm} disabled={submitting}>
            {submitting ? "Excluindo…" : "Excluir"}
          </Button>
        </div>
      </Dialog>
    </>
  )
}
