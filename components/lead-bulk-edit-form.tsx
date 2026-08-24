"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label, Select } from "@/components/ui/primitives"
import { useLeads } from "@/lib/leads-store"
import { LEAD_STATUSES, STATUS_LABEL, TEMP_LABEL, TEMPERATURAS } from "@/lib/labels"
import type { LeadStatus, Temperatura } from "@/lib/mock-data"

interface BulkField<T> {
  label: string
  value: T | null
  setValue: (v: T | null) => void
  options: { value: string; label: string }[]
}

export function LeadBulkEditForm({
  count,
  submitting,
  onSubmit,
  onCancel,
}: {
  count: number
  submitting: boolean
  onSubmit: (patch: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [status, setStatus] = useState<LeadStatus | null>(null)
  const [temperatura, setTemperatura] = useState<Temperatura | null>(null)
  const [corretorId, setCorretorId] = useState<string | null>(null)
  const { corretores } = useLeads()

  const fields: BulkField<any>[] = [
    {
      label: "Status",
      value: status,
      setValue: setStatus,
      options: LEAD_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
    },
    {
      label: "Temperatura",
      value: temperatura,
      setValue: setTemperatura,
      options: TEMPERATURAS.map((t) => ({ value: t, label: TEMP_LABEL[t] })),
    },
    {
      label: "Corretor",
      value: corretorId,
      setValue: setCorretorId,
      options: corretores.map((c) => ({ value: c.id, label: c.nome })),
    },
  ]

  function handleSubmit() {
    const patch: Record<string, unknown> = {}
    if (status !== null) patch.status = status
    if (temperatura !== null) patch.temperatura = temperatura
    if (corretorId !== null) patch.corretorId = corretorId
    if (Object.keys(patch).length === 0) return
    onSubmit(patch)
  }

  const hasChanges = status !== null || temperatura !== null || corretorId !== null

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Alterar <strong>{count} lead{count !== 1 ? "s" : ""}</strong> selecionado{count !== 1 ? "s" : ""}. Deixe como <strong>&quot;Manter&quot;</strong> para não alterar o campo.
      </p>

      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f.label} className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-medium whitespace-nowrap w-24">
              <input
                type="checkbox"
                checked={f.value !== null}
                onChange={(e) => f.setValue(e.target.checked ? f.options[0].value : null)}
                className="size-4 accent-primary"
              />
              {f.label}
            </label>
            <Select
              value={f.value ?? ""}
              onChange={(e) => f.setValue(e.target.value || null)}
              disabled={f.value === null}
              className="flex-1"
            >
              <option value="">{f.value === null ? "Manter" : "Selecione..."}</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="ghost" onClick={onCancel} disabled={submitting}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={submitting || !hasChanges}>
          {submitting ? "Salvando..." : `Aplicar em ${count} lead${count !== 1 ? "s" : ""}`}
        </Button>
      </div>
    </div>
  )
}
