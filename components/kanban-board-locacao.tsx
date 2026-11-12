"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { SearchX } from "lucide-react"
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd"
import { useToast } from "@/components/ui/primitives"
import { LeadCard } from "@/components/lead-card-locacao"
import { type LocacaoLeadFormValues } from "@/components/locacao-lead-form"
import { useSaleCelebration } from "@/components/sale-celebration"
import { broadcastSaleCelebration } from "@/lib/kanban-sale-dispatcher"
import { useLocacao } from "@/lib/locacao-store"
import { useAuth } from "@/lib/auth-context"
import { isGestorNivel } from "@/lib/roles"
import { LOCACAO_STATUSES, LOCACAO_STATUS_ACCENT, LOCACAO_STATUS_LABEL, brl, refsTexto } from "@/lib/locacao-labels"
import type { LocacaoLead, LocacaoStatus } from "@/lib/locacao-labels"
import { KanbanLocacaoFilterBar } from "./kanban-locacao/KanbanLocacaoFilterBar"
import { KanbanLocacaoDialogs } from "./kanban-locacao/KanbanLocacaoDialogs"
import {
  INITIAL_LOCACAO_FILTERS,
  filterLocacaoLeads,
  sortLocacaoLeads,
  hasActiveLocacaoFilters,
  type LocacaoFilters,
} from "./kanban-locacao/kanban-locacao-utils"

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
  const { updateLead, deleteLead, addVisit, addInteraction, notify, logChange, logAudit, corretores, userName } = useLocacao()
  const { user } = useAuth()
  const router = useRouter()
  const toast = useToast()
  const celebrate = useSaleCelebration()

  // Modal target leads
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

  // Filters state
  const [filters, setFilters] = useState<LocacaoFilters>(INITIAL_LOCACAO_FILTERS)

  // Form states for modals
  const [vData, setVData] = useState("")
  const [vHora, setVHora] = useState("10:00")
  const [vCorretor, setVCorretor] = useState("")
  const [vRefs, setVRefs] = useState("")
  const [vObs, setVObs] = useState("")
  const [pValor, setPValor] = useState("")
  const [pRefs, setPRefs] = useState("")
  const [pObs, setPObs] = useState("")
  const [fRefs, setFRefs] = useState("")
  const [fValor, setFValor] = useState("")

  const usuarioNome = user ? userName(user.id) : "Sistema"
  const canManage = (lead: LocacaoLead) => isGestor || lead.corretorId === currentCorretorId

  function handleUpdateFilters(updates: Partial<LocacaoFilters>) {
    setFilters((prev) => ({ ...prev, ...updates }))
  }

  function handleClearFilters() {
    setFilters(INITIAL_LOCACAO_FILTERS)
  }

  function handleEditSubmit(v: LocacaoLeadFormValues) {
    if (!editLead) return
    if (v.status === "locado" && editLead.status !== "locado") {
      setFRefs(refsTexto(editLead))
      setFValor(editLead.valorAluguel ? String(editLead.valorAluguel) : "")
      setCloseLead(editLead)
      setEditLead(null)
      return
    }
    setSubmitting(true)
    const fields: (keyof LocacaoLeadFormValues)[] = [
      "nome", "telefone", "email", "imovelRef", "origem", "observacoes",
      "status", "valorAluguel", "corretorId", "temperatura", "tipoImovelDesejado",
      "quartos", "aluguelMax", "garantia", "vagas", "metragemMin",
      "aceitaCondominio", "salas", "atividadeComercial",
    ]
    for (const f of fields) {
      const before = (editLead as unknown as Record<string, unknown>)[f]
      const after = (v as unknown as Record<string, unknown>)[f]
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
    broadcastSaleCelebration({
      nome: closeLead.nome,
      valor,
      ref: fRefs.trim(),
      tipo: "Locação",
      corretorNome: userName(closeLead.corretorId),
    })
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
    if (!isGestorNivel(user.role)) {
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
    if (!isGestorNivel(user.role)) {
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

  const filtered = filterLocacaoLeads(leads, filters)
  const byStatus = (s: LocacaoStatus) => sortLocacaoLeads(filtered.filter((l) => l.status === s))
  const temFiltros = hasActiveLocacaoFilters(filters)
  const noResults = temFiltros && filtered.length === 0

  return (
    <>
      <KanbanLocacaoFilterBar
        filters={filters}
        onChangeFilters={handleUpdateFilters}
        onClearFilters={handleClearFilters}
        hasActiveFilters={temFiltros}
        isGestor={isGestor}
        corretores={corretores}
      />

      {noResults ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/60 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <SearchX className="size-6" />
          </div>
          <p className="text-sm font-medium text-foreground">Nenhum lead encontrado para estes filtros</p>
          <button type="button" onClick={handleClearFilters} className="text-xs font-medium text-primary hover:underline">
            Limpar filtros
          </button>
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
                        <div
                          className="mb-2 flex shrink-0 items-center justify-between rounded-t-xl border border-b-0 border-border bg-card px-3 py-2.5 shadow-sm"
                          style={{
                            borderTopColor: LOCACAO_STATUS_ACCENT[status],
                            borderTopWidth: 3,
                            boxShadow: `0 6px 18px -8px ${LOCACAO_STATUS_ACCENT[status]}66`,
                          }}
                        >
                          <span className="flex items-center gap-2 font-display text-sm font-semibold">
                            <span className="size-2 rounded-full" style={{ backgroundColor: LOCACAO_STATUS_ACCENT[status] }} aria-hidden />
                            {LOCACAO_STATUS_LABEL[status]}
                          </span>
                          <span className="flex min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-semibold text-muted-foreground">
                            {col.length}
                          </span>
                        </div>
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`-mt-2 flex min-h-32 flex-1 flex-col gap-2 overflow-y-auto rounded-b-xl border border-t-0 border-border p-2 transition-colors ${
                            snapshot.isDraggingOver ? "bg-primary/5 ring-2 ring-inset ring-primary/30" : "bg-muted/40"
                          }`}
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

      <KanbanLocacaoDialogs
        visitLead={visitLead}
        onCloseVisit={() => setVisitLead(null)}
        onConfirmVisit={confirmVisit}
        vData={vData}
        setVData={setVData}
        vHora={vHora}
        setVHora={setVHora}
        vCorretor={vCorretor}
        setVCorretor={setVCorretor}
        vRefs={vRefs}
        setVRefs={setVRefs}
        vObs={vObs}
        setVObs={setVObs}

        propLead={propLead}
        onCloseProp={() => setPropLead(null)}
        onConfirmProposal={confirmProposal}
        pValor={pValor}
        setPValor={setPValor}
        pRefs={pRefs}
        setPRefs={setPRefs}
        pObs={pObs}
        setPObs={setPObs}

        closeLead={closeLead}
        onCloseClose={() => setCloseLead(null)}
        onConfirmClose={confirmClose}
        fRefs={fRefs}
        setFRefs={setFRefs}
        fValor={fValor}
        setFValor={setFValor}

        editLead={editLead}
        onCloseEdit={() => setEditLead(null)}
        onEditSubmit={handleEditSubmit}
        isGestor={isGestor}

        assumirDialog={assumirDialog}
        onCloseAssumir={() => setAssumirDialog(null)}
        onConfirmAssumir={handleAssumir}

        archiveLead={archiveLead}
        onCloseArchive={() => setArchiveLead(null)}
        onConfirmArchive={handleArquivar}

        desarquivarLead={desarquivarLead}
        onCloseDesarquivar={() => setDesarquivarLead(null)}
        onConfirmDesarquivar={handleDesarquivar}

        delLead={delLead}
        onCloseDelete={closeDelete}
        onConfirmDelete={handleDeleteConfirm}
        delMotivo={delMotivo}
        setDelMotivo={setDelMotivo}
        delDetalhe={delDetalhe}
        setDelDetalhe={setDelDetalhe}

        submitting={submitting}
        corretores={corretores}
        userName={userName}
      />
    </>
  )
}
