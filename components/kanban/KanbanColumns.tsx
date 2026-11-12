"use client"

import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd"
import { LeadCard } from "@/components/lead-card"
import { LEAD_STATUSES, STATUS_ACCENT, STATUS_LABEL } from "@/lib/labels"
import { CORRETOR_HIDDEN } from "@/lib/pipeline-stages"
import type { Lead, LeadStatus } from "@/lib/mock-data"

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
}) {
  const statuses = isGestor
    ? LEAD_STATUSES
    : LEAD_STATUSES.filter((s) => !CORRETOR_HIDDEN.has(s))

  return (
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
  )
}
