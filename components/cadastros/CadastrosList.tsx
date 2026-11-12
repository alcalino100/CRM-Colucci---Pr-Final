"use client"

import Link from "next/link"
import { Sparkles, History, ArchiveRestore, Archive, Pencil, CheckSquare, Layers } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, Badge, Dialog } from "@/components/ui/primitives"
import { refsTexto, STATUS_LABEL, STATUS_VARIANT, TEMP_LABEL, TEMP_VARIANT } from "@/lib/labels"
import type { Lead } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import { LeadBulkEditForm } from "@/components/lead-bulk-edit-form"
import { fmtDateLead, fmtDateTimeLead, isLeadNovoNoPeriodo, type AbaCadastros } from "./cadastros-utils"

interface CadastrosListProps {
  leads: Lead[]
  novosCount: number
  antigosCount: number
  todosCount: number
  abaLeads: AbaCadastros
  onSelectAba: (aba: AbaCadastros) => void
  dataInicio: string
  dataFim: string
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onToggleSelectAll: () => void
  allFilteredSelected: boolean
  onClearSelection: () => void
  bulkEditOpen: boolean
  setBulkEditOpen: (open: boolean) => void
  bulkSubmitting: boolean
  onBulkSubmit: (patch: Record<string, unknown>) => Promise<void>
  userName: (id: string) => string
}

export function CadastrosList({
  leads,
  novosCount,
  antigosCount,
  todosCount,
  abaLeads,
  onSelectAba,
  dataInicio,
  dataFim,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  allFilteredSelected,
  onClearSelection,
  bulkEditOpen,
  setBulkEditOpen,
  bulkSubmitting,
  onBulkSubmit,
  userName,
}: CadastrosListProps) {
  return (
    <Card>
      <CardHeader className="pb-3 border-b border-border/60">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Listagem e Gestão de Leads</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {dataInicio || dataFim
                ? `${fmtDateLead(dataInicio || "2000-01-01")} — ${fmtDateLead(dataFim || "2099-12-31")}`
                : "Todos os períodos"}{" "}
              · {leads.length} {leads.length === 1 ? "lead exibido" : "leads exibidos"}
            </p>
          </div>

          {/* Abas para isolar e nunca misturar leads antigos com novos */}
          <div className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => onSelectAba("novos")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                abaLeads === "novos"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Sparkles className="size-3.5" />
              Novos Cadastros
              <span
                className={cn(
                  "ml-1 rounded-full px-1.5 py-0.2 text-[10px]",
                  abaLeads === "novos"
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {novosCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onSelectAba("antigos_movimentados")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                abaLeads === "antigos_movimentados"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <History className="size-3.5" />
              Base Anterior Ativa
              <span
                className={cn(
                  "ml-1 rounded-full px-1.5 py-0.2 text-[10px]",
                  abaLeads === "antigos_movimentados"
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {antigosCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onSelectAba("todos")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                abaLeads === "todos"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Layers className="size-3.5" />
              Todos
              <span
                className={cn(
                  "ml-1 rounded-full px-1.5 py-0.2 text-[10px]",
                  abaLeads === "todos"
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {todosCount}
              </span>
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {leads.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm font-medium text-muted-foreground">
              {abaLeads === "novos"
                ? "Nenhum lead novo cadastrado neste período com os filtros atuais"
                : abaLeads === "antigos_movimentados"
                ? "Nenhum lead da base anterior teve movimentação neste período"
                : "Nenhum lead encontrado com os filtros atuais"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {/* Select all bar */}
            <label className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm font-medium cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={onToggleSelectAll}
                className="size-4 accent-primary"
              />
              <span className="flex items-center gap-1.5">
                <CheckSquare className="size-3.5 text-muted-foreground" />
                Selecionar todos ({leads.length})
              </span>
              {selectedIds.size > 0 && !allFilteredSelected && (
                <span className="ml-1 text-xs text-muted-foreground">
                  · {selectedIds.size} selecionado{selectedIds.size !== 1 ? "s" : ""}
                </span>
              )}
            </label>

            {leads.map((l) => {
              const isNovo = isLeadNovoNoPeriodo(l, dataInicio, dataFim)
              const isReativado = Boolean(l.reativadoEm && !l.arquivadoEm)
              const isArquivado = Boolean(l.arquivadoEm)

              return (
                <div
                  key={l.id}
                  className={cn(
                    "flex flex-col gap-2 rounded-xl border border-border p-3 transition sm:flex-row sm:items-center sm:gap-2",
                    selectedIds.has(l.id) && "border-primary bg-primary/5",
                    isNovo && "border-emerald-500/30 bg-emerald-500/[0.02]",
                    isReativado && "border-amber-500/40 bg-amber-500/[0.03]"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(l.id)}
                      onChange={() => onToggleSelect(l.id)}
                      className="size-4 shrink-0 accent-primary"
                    />

                    <Link href={`/painel-corretor/${l.id}`} className="min-w-0 truncate font-semibold hover:text-primary">
                      {l.nome}
                    </Link>

                    {/* Badges de Identificação de Origem e Idade do Lead */}
                    {isNovo ? (
                      <Badge variant="green" className="shrink-0 flex items-center gap-1 text-[11px] font-bold">
                        <Sparkles className="size-3" />
                        Novo Cadastro
                      </Badge>
                    ) : isReativado ? (
                      <Badge variant="amber" className="shrink-0 flex items-center gap-1 text-[11px] font-bold">
                        <ArchiveRestore className="size-3" />
                        Reativado {l.reativadoEm ? `(${fmtDateLead(l.reativadoEm)})` : ""}
                      </Badge>
                    ) : (
                      <Badge variant="gray" className="shrink-0 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <History className="size-3" />
                        Base Anterior ({fmtDateLead(l.criadoEm)})
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pl-6 sm:pl-0">
                    {isArquivado && (
                      <Badge variant="gray" className="flex items-center gap-1 text-[11px]">
                        <Archive className="size-3 text-slate-500" />
                        Arquivado
                      </Badge>
                    )}

                    {refsTexto(l) && <Badge variant="gray">{refsTexto(l)}</Badge>}
                    <Badge variant={STATUS_VARIANT[l.status]}>{STATUS_LABEL[l.status]}</Badge>
                    <Badge variant={TEMP_VARIANT[l.temperatura]}>{TEMP_LABEL[l.temperatura]}</Badge>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground pl-6 sm:pl-0 sm:ml-auto">
                    <span className="font-medium text-foreground/80">{l.origem}</span>
                    <span>{userName(l.corretorId)}</span>
                    <span
                      title={`Cadastrado: ${fmtDateTimeLead(l.criadoEm)} | Atualizado: ${fmtDateTimeLead(l.atualizadoEm)}`}
                      className={cn(isNovo ? "font-semibold text-emerald-700 dark:text-emerald-400" : "")}
                    >
                      {isNovo ? fmtDateTimeLead(l.criadoEm) : `Ativo em ${fmtDateLead(l.atualizadoEm)}`}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>

      {/* Floating bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-border bg-background/95 backdrop-blur p-3 shadow-xl">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">
              {selectedIds.size} lead{selectedIds.size !== 1 ? "s" : ""} selecionado{selectedIds.size !== 1 ? "s" : ""}
            </span>
            <button
              type="button"
              onClick={() => setBulkEditOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              <Pencil className="size-4" /> Editar em massa
            </button>
            <button
              type="button"
              onClick={onClearSelection}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-muted"
            >
              Limpar
            </button>
          </div>
        </div>
      )}

      {/* Bulk edit dialog */}
      <Dialog open={bulkEditOpen} onClose={() => setBulkEditOpen(false)} title="Editar leads em massa">
        <LeadBulkEditForm
          count={selectedIds.size}
          submitting={bulkSubmitting}
          onSubmit={onBulkSubmit}
          onCancel={() => setBulkEditOpen(false)}
        />
      </Dialog>
    </Card>
  )
}
