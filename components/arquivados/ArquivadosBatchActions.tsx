"use client"

import { ArchiveRestore, Calendar, CheckSquare, Trash2, UserCheck } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ArquivadosBatchActionsProps {
  selectedCount: number
  isGestor: boolean
  submittingAction: boolean
  onDesarquivar: () => void
  onOpenModalData: () => void
  onOpenModalCorretor: () => void
  onOpenModalExcluir: () => void
  onClearSelection: () => void
}

export function ArquivadosBatchActions({
  selectedCount,
  isGestor,
  submittingAction,
  onDesarquivar,
  onOpenModalData,
  onOpenModalCorretor,
  onOpenModalExcluir,
  onClearSelection,
}: ArquivadosBatchActionsProps) {
  if (selectedCount === 0) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
      <div className="flex items-center gap-2 font-medium text-foreground">
        <CheckSquare className="size-4 text-primary" />
        <span>{selectedCount} lead(s) selecionado(s)</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 border-emerald-600/30 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
          onClick={onDesarquivar}
          disabled={submittingAction}
        >
          <ArchiveRestore className="size-3.5" />
          Desarquivar agora
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={onOpenModalData}
          disabled={submittingAction}
        >
          <Calendar className="size-3.5" />
          Alterar data
        </Button>

        {isGestor && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={onOpenModalCorretor}
            disabled={submittingAction}
          >
            <UserCheck className="size-3.5" />
            Trocar corretor
          </Button>
        )}

        {isGestor && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
            onClick={onOpenModalExcluir}
            disabled={submittingAction}
          >
            <Trash2 className="size-3.5" />
            Excluir
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          disabled={submittingAction}
        >
          Limpar seleção
        </Button>
      </div>
    </div>
  )
}
