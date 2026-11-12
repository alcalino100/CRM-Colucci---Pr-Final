"use client"

import { useState } from "react"
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd"
import { LeadCard } from "@/components/lead-card"
import { LEAD_STATUSES, STATUS_ACCENT, STATUS_LABEL } from "@/lib/labels"
import { CORRETOR_HIDDEN } from "@/lib/pipeline-stages"
import type { Lead, LeadStatus } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

export function KanbanColumns({
  isGestor,
  showCorretor,
  heightClass = "h-[calc(100vh-13rem)]",
  byStatus,
  canManage,
  tagColorMap,
  onDragEnd,
  onOpen,
  onEdit,
  onDelete,
  onAssumir,
  onEnviarMeta,
  onArquivar,
  onDesarquivar,
  onMoveLead,
}: {
  isGestor: boolean
  showCorretor: boolean
  heightClass?: string
  byStatus: (status: LeadStatus) => Lead[]
  canManage: (lead: Lead) => boolean
  tagColorMap: Record<string, string>
  onDragEnd: (result: DropResult) => void
  onOpen: (lead: Lead) => void
  onEdit: (lead: Lead) => void
  onDelete: (lead: Lead) => void
  onAssumir: (lead: Lead) => void
  onEnviarMeta: (lead: Lead) => void
  onArquivar: (lead: Lead) => void
  onDesarquivar: (lead: Lead) => void
  onMoveLead?: (lead: Lead, status: LeadStatus) => void
}) {
  const statuses = isGestor
    ? LEAD_STATUSES
    : LEAD_STATUSES.filter((s) => !CORRETOR_HIDDEN.has(s))

  const [activeMobileStatus, setActiveMobileStatus] = useState<LeadStatus>(statuses[0])
  const currentMobileStatus = statuses.includes(activeMobileStatus) ? activeMobileStatus : statuses[0]

  const mobileLeads = byStatus(currentMobileStatus)

  return (
    <div className="flex w-full flex-1 flex-col">
      {/* Mobile Single-Column with Stage Tabs (visible only on <md) */}
      <div className="flex flex-col gap-3 md:hidden">
        {/* Horizontal tabs with status chips and badge count */}
        <div
          role="tablist"
          aria-label="Etapas do funil"
          className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none"
        >
          {statuses.map((status) => {
            const count = byStatus(status).length
            const isActive = status === currentMobileStatus
            return (
              <button
                key={status}
                role="tab"
                aria-selected={isActive}
                type="button"
                onClick={() => setActiveMobileStatus(status)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition select-none btn-touch-target",
                  isActive
                    ? "border-primary bg-primary/10 text-primary shadow-sm"
                    : "border-border bg-card/60 text-muted-foreground hover:bg-muted"
                )}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: STATUS_ACCENT[status] }}
                  aria-hidden
                />
                <span className="truncate">{STATUS_LABEL[status]}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums font-bold",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Active Stage Column Header + Card List */}
        <div className="flex flex-col rounded-xl border border-border bg-card/40 overflow-hidden shadow-sm">
          <div
            className="flex items-center justify-between border-b border-border bg-card px-3 py-2.5"
            style={{
              borderTopColor: STATUS_ACCENT[currentMobileStatus],
              borderTopWidth: 3,
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: STATUS_ACCENT[currentMobileStatus] }}
                aria-hidden
              />
              <span className="font-semibold text-sm">
                {STATUS_LABEL[currentMobileStatus]}
              </span>
            </div>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
              {mobileLeads.length} {mobileLeads.length === 1 ? "lead" : "leads"}
            </span>
          </div>

          <div className="flex flex-col gap-2 p-2 min-h-64">
            {mobileLeads.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                Nenhum lead nesta etapa
              </div>
            ) : (
              mobileLeads.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  showCorretor={showCorretor}
                  canManage={canManage(lead)}
                  podeExcluir={isGestor}
                  isGestor={isGestor}
                  tagColorMap={tagColorMap}
                  onOpen={onOpen}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onAssumir={onAssumir}
                  onEnviarMeta={onEnviarMeta}
                  onArquivar={onArquivar}
                  onDesarquivar={onDesarquivar}
                  onMoveStatus={onMoveLead}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Desktop Multi-Column Horizontal Kanban (visible on >=md) */}
      <div className="hidden md:flex w-full flex-1">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="kanban-scroll w-full flex-1 overflow-x-auto overflow-y-hidden pb-3">
            <div className={`flex w-max flex-nowrap gap-4 ${heightClass}`}>
              {statuses.map((status) => {
                const col = byStatus(status)
                return (
                  <Droppable droppableId={status} key={status}>
                    {(provided, snapshot) => (
                      <div className="flex w-72 flex-shrink-0 flex-col">
                        <div
                          className="mb-2 flex shrink-0 items-center justify-between rounded-t-xl border border-b-0 border-border bg-card px-3 py-2.5 shadow-sm"
                          style={{
                            borderTopColor: STATUS_ACCENT[status],
                            borderTopWidth: 3,
                            boxShadow: `0 6px 18px -8px ${STATUS_ACCENT[status]}66`,
                          }}
                        >
                          <span className="flex items-center gap-2 font-display text-[11px] font-semibold uppercase tracking-[0.08em]">
                            <span
                              className="size-2 rounded-full"
                              style={{ backgroundColor: STATUS_ACCENT[status] }}
                              aria-hidden
                            />
                            {STATUS_LABEL[status]}
                          </span>
                          <span className="flex min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-semibold tabular-nums text-muted-foreground">
                            {col.length}
                          </span>
                        </div>
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`-mt-2 flex min-h-32 flex-1 flex-col gap-2 overflow-y-auto rounded-b-xl border border-t-0 border-border p-2 transition-colors ${
                            snapshot.isDraggingOver
                              ? "bg-primary/5 ring-2 ring-inset ring-primary/30"
                              : "bg-muted/40"
                          }`}
                        >
                          {col.length === 0 && !snapshot.isDraggingOver && (
                            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                              Nenhum lead nesta etapa
                            </p>
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
                                    tagColorMap={tagColorMap}
                                    onOpen={onOpen}
                                    onEdit={onEdit}
                                    onDelete={onDelete}
                                    onAssumir={onAssumir}
                                    onEnviarMeta={onEnviarMeta}
                                    onArquivar={onArquivar}
                                    onDesarquivar={onDesarquivar}
                                    onMoveStatus={onMoveLead}
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
      </div>
    </div>
  )
}
