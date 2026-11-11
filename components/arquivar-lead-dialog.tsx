"use client"

import { useState, useId } from "react"
import { Calendar, Clock, AlertCircle, Archive, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, Input, Label, Select, Textarea, useToast } from "@/components/ui/primitives"
import { MOTIVOS_ARQUIVAMENTO, MOTIVO_ARQUIVAMENTO_LABEL, type Lead, type MotivoArquivamento } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

export function getHojeBrasilia(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

export function adicionarDiasBrasilia(dias: number): string {
  const agora = new Date()
  const futuro = new Date(agora.getTime() + dias * 24 * 60 * 60 * 1000)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(futuro)
}

export function adicionarMesesBrasilia(meses: number): string {
  const agora = new Date()
  const futuro = new Date(agora)
  futuro.setMonth(futuro.getMonth() + meses)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(futuro)
}

export function formatarDataBrasiliaExtenso(dataIso: string): string {
  if (!dataIso) return ""
  const [y, m, d] = dataIso.split("-").map(Number)
  if (!y || !m || !d) return dataIso
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  return dt.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}

interface ArquivarLeadDialogProps {
  lead: Lead | null
  open: boolean
  onClose: () => void
  onConfirm: (params: {
    motivo: MotivoArquivamento | string
    dataReaparecimento: string
    observacao?: string
  }) => Promise<void>
}

export function ArquivarLeadDialog({
  lead,
  open,
  onClose,
  onConfirm,
}: ArquivarLeadDialogProps) {
  const toast = useToast()
  const hoje = getHojeBrasilia()
  const dataMax = adicionarMesesBrasilia(24) // Limite de 24 meses
  const [motivo, setMotivo] = useState<MotivoArquivamento>("quer comprar em data futura")
  const [dataReaparecimento, setDataReaparecimento] = useState<string>(adicionarMesesBrasilia(6))
  const [atalhoAtivo, setAtalhoAtivo] = useState<string>("6m")
  const [observacao, setObservacao] = useState<string>("")
  const [submitting, setSubmitting] = useState(false)
  const motivoId = useId()
  const dataId = useId()
  const obsId = useId()

  const atalhos = [
    { id: "30d", label: "30 dias", calc: () => adicionarDiasBrasilia(30) },
    { id: "90d", label: "90 dias", calc: () => adicionarDiasBrasilia(90) },
    { id: "6m", label: "6 meses", calc: () => adicionarMesesBrasilia(6) },
    { id: "1a", label: "1 ano", calc: () => adicionarMesesBrasilia(12) },
    { id: "custom", label: "Personalizada", calc: null },
  ]

  function handleSelectAtalho(at: (typeof atalhos)[0]) {
    setAtalhoAtivo(at.id)
    if (at.calc) {
      setDataReaparecimento(at.calc())
    }
  }

  function handleDataChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setDataReaparecimento(val)
    setAtalhoAtivo("custom")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!lead || submitting) return

    if (!motivo) {
      toast("Selecione o motivo do arquivamento.", "error")
      return
    }

    if (!dataReaparecimento) {
      toast("Defina a data de reaparecimento do lead.", "error")
      return
    }

    if (dataReaparecimento <= hoje) {
      toast("A data de reaparecimento deve ser futura (não pode ser hoje nem no passado).", "error")
      return
    }

    if (dataReaparecimento > dataMax) {
      toast("O prazo máximo de arquivamento é de 24 meses.", "error")
      return
    }

    setSubmitting(true)
    try {
      await onConfirm({
        motivo,
        dataReaparecimento,
        observacao: observacao.trim() || undefined,
      })
      onClose()
    } catch {
      toast("Erro ao arquivar o lead.", "error")
    } finally {
      setSubmitting(false)
    }
  }

  if (!lead) return null

  return (
    <Dialog open={open} onClose={onClose} title="Arquivar Lead com Previsão">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-foreground">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
          <p className="font-semibold flex items-center gap-1.5">
            <Archive className="size-4 text-amber-600 dark:text-amber-400" />
            Lead: {lead.nome} ({lead.telefone || "sem telefone"})
          </p>
          <p className="mt-1 text-muted-foreground">
            O lead sairá do funil ativo para não poluir sua esteira e retornará automaticamente como <strong>Novo Lead</strong> na data agendada, com todo o histórico e tags preservados.
          </p>
        </div>

        <div>
          <Label htmlFor={motivoId} className="mb-1 block text-xs font-semibold">
            Motivo do Arquivamento <span className="text-destructive">*</span>
          </Label>
          <Select
            id={motivoId}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value as MotivoArquivamento)}
            required
            className="w-full"
          >
            {MOTIVOS_ARQUIVAMENTO.map((m) => (
              <option key={m} value={m}>
                {MOTIVO_ARQUIVAMENTO_LABEL[m]}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor={dataId} className="mb-1 block text-xs font-semibold">
            Data de Reaparecimento <span className="text-destructive">*</span>
          </Label>

          {/* Atalhos rápidos */}
          <div className="mb-2 flex flex-wrap gap-1.5">
            {atalhos.map((at) => (
              <button
                key={at.id}
                type="button"
                onClick={() => handleSelectAtalho(at)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition",
                  atalhoAtivo === at.id
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {at.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Input
              id={dataId}
              type="date"
              min={adicionarDiasBrasilia(1)}
              max={dataMax}
              value={dataReaparecimento}
              onChange={handleDataChange}
              required
              className="w-full"
            />
          </div>

          {dataReaparecimento && dataReaparecimento > hoje && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Calendar className="size-3.5 text-primary" />
              Retorna em: <strong className="capitalize text-foreground">{formatarDataBrasiliaExtenso(dataReaparecimento)}</strong>
            </p>
          )}

          {dataReaparecimento && dataReaparecimento <= hoje && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-destructive">
              <AlertCircle className="size-3.5" />
              A data de reaparecimento não pode ser passada nem no mesmo dia.
            </p>
          )}
        </div>

        <div>
          <Label htmlFor={obsId} className="mb-1 block text-xs font-semibold">
            Observações adicionais (opcional)
          </Label>
          <Textarea
            id={obsId}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex.: Cliente solicitou novo contato após a colheita da safra / venda do apartamento antigo."
            className="h-20 text-xs"
          />
        </div>

        <div className="mt-2 flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting || !dataReaparecimento || dataReaparecimento <= hoje}>
            {submitting ? "Arquivando..." : "Confirmar Arquivamento"}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
