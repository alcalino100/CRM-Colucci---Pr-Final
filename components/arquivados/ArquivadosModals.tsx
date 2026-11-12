"use client"

import { AlertTriangle } from "lucide-react"
import {
  Dialog,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui/primitives"
import { Button } from "@/components/ui/button"
import {
  adicionarDiasBrasilia,
  adicionarMesesBrasilia,
} from "@/components/arquivar-lead-dialog"

interface ModalAlterarDataProps {
  open: boolean
  onClose: () => void
  selectedCount: number
  novaDataReaparecimento: string
  setNovaDataReaparecimento: (d: string) => void
  onSalvarNovaData: () => void
  submittingAction: boolean
}

export function ModalAlterarData({
  open,
  onClose,
  selectedCount,
  novaDataReaparecimento,
  setNovaDataReaparecimento,
  onSalvarNovaData,
  submittingAction,
}: ModalAlterarDataProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Alterar Data de Reaparecimento"
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Defina uma nova data de hibernação programada para os{" "}
          <strong>{selectedCount}</strong> lead(s) selecionado(s).
        </p>

        <div className="flex flex-wrap gap-1.5">
          {[
            { id: "30d", label: "+30 dias", calc: () => adicionarDiasBrasilia(30) },
            { id: "90d", label: "+90 dias", calc: () => adicionarDiasBrasilia(90) },
            { id: "6m", label: "+6 meses", calc: () => adicionarMesesBrasilia(6) },
            { id: "1a", label: "+1 ano", calc: () => adicionarMesesBrasilia(12) },
          ].map((at) => (
            <Button
              key={at.id}
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => setNovaDataReaparecimento(at.calc())}
            >
              {at.label}
            </Button>
          ))}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="nova-data">Nova data de reaparecimento</Label>
          <Input
            id="nova-data"
            type="date"
            min={adicionarDiasBrasilia(1)}
            max={adicionarMesesBrasilia(24)}
            value={novaDataReaparecimento}
            onChange={(e) => setNovaDataReaparecimento(e.target.value)}
          />
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submittingAction}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={onSalvarNovaData}
            disabled={submittingAction || !novaDataReaparecimento}
          >
            {submittingAction ? "Salvando..." : "Atualizar data"}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

interface ModalTrocarCorretorProps {
  open: boolean
  onClose: () => void
  selectedCount: number
  novoCorretorId: string
  setNovoCorretorId: (id: string) => void
  corretores: { id: string; nome: string; email: string }[]
  onSalvarNovoCorretor: () => void
  submittingAction: boolean
}

export function ModalTrocarCorretor({
  open,
  onClose,
  selectedCount,
  novoCorretorId,
  setNovoCorretorId,
  corretores,
  onSalvarNovoCorretor,
  submittingAction,
}: ModalTrocarCorretorProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Trocar Corretor Responsável"
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Selecione o novo corretor responsável para os{" "}
          <strong>{selectedCount}</strong> lead(s) arquivado(s).
        </p>

        <div className="grid gap-1.5">
          <Label htmlFor="novo-corretor">Novo corretor</Label>
          <Select
            id="novo-corretor"
            value={novoCorretorId}
            onChange={(e) => setNovoCorretorId(e.target.value)}
          >
            <option value="">Selecione um corretor...</option>
            {corretores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} ({c.email})
              </option>
            ))}
          </Select>
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submittingAction}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={onSalvarNovoCorretor}
            disabled={submittingAction || !novoCorretorId}
          >
            {submittingAction ? "Salvando..." : "Confirmar troca"}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

interface ModalExcluirLoteProps {
  open: boolean
  onClose: () => void
  selectedCount: number
  motivoExclusao: string
  setMotivoExclusao: (m: string) => void
  onExcluirSelecionados: () => void
  submittingAction: boolean
}

export function ModalExcluirLote({
  open,
  onClose,
  selectedCount,
  motivoExclusao,
  setMotivoExclusao,
  onExcluirSelecionados,
  submittingAction,
}: ModalExcluirLoteProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Excluir Leads Arquivados"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
          <AlertTriangle className="size-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Ação irreversível</p>
            <p className="text-xs">
              Esta ação excluirá permanentemente os <strong>{selectedCount}</strong> lead(s) selecionados e registrará um log de auditoria com a justificativa.
            </p>
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="motivo-exclusao">Motivo da exclusão (obrigatório)</Label>
          <Textarea
            id="motivo-exclusao"
            rows={3}
            value={motivoExclusao}
            onChange={(e) => setMotivoExclusao(e.target.value)}
            placeholder="Explique o motivo para o registro nos logs de auditoria..."
          />
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submittingAction}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onExcluirSelecionados}
            disabled={submittingAction || !motivoExclusao.trim()}
          >
            {submittingAction ? "Excluindo..." : "Excluir definitivamente"}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
