"use client"

import { AlertTriangle } from "lucide-react"
import { Badge } from "@/components/ui/primitives"
import type { AutomationConditionGroup, AutomationLimitsConfig } from "@/lib/automation-types"
import { CONDITION_FIELDS } from "./nova-automacao-utils"

interface NovaAutomacaoPreviewStepProps {
  conditions: AutomationConditionGroup
  waitAmount: number
  waitUnit: "minutes" | "hours" | "days"
  allowedStartHour: string
  allowedEndHour: string
  allowedDays: number[]
  supervisionEnabled: boolean
  limitsConfig: AutomationLimitsConfig
  eligibleCount: number
  previewMessage: string
}

export function NovaAutomacaoPreviewStep({
  conditions,
  waitAmount,
  waitUnit,
  allowedStartHour,
  allowedEndHour,
  allowedDays,
  supervisionEnabled,
  limitsConfig,
  eligibleCount,
  previewMessage,
}: NovaAutomacaoPreviewStepProps) {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold">Prévia e Resumo</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold">Condições ({conditions.rules.length})</h3>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {conditions.rules.map((r, i) => (
              <li key={i}>
                • {CONDITION_FIELDS.find((f) => f.value === r.field)?.label ?? r.field} {r.operator} {String(r.value)}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold">Configurações</h3>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            <li>
              • Espera: {waitAmount} {waitUnit === "minutes" ? "minutos" : waitUnit === "hours" ? "horas" : "dias"}
            </li>
            <li>
              • Horário: {allowedStartHour} - {allowedEndHour}
            </li>
            <li>
              • Dias: {allowedDays.map((d) => ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d]).join(", ")}
            </li>
            <li>• Supervisão: {supervisionEnabled ? "Sim" : "Não"}</li>
            <li>• Max envios/lead: {limitsConfig.max_sends_per_lead}</li>
          </ul>
        </div>
      </div>
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
        <p className="text-sm">
          <strong>Leads elegíveis estimados:</strong> {eligibleCount} leads atendem às condições atuais
        </p>
      </div>
      <div className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold">Prévia da Mensagem</h3>
        <div className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
          {previewMessage || "Nenhuma mensagem configurada"}
        </div>
      </div>
    </div>
  )
}

interface NovaAutomacaoActivationStepProps {
  name: string
  description: string
  conditionsCount: number
  waitAmount: number
  waitUnit: "minutes" | "hours" | "days"
  supervisionEnabled: boolean
}

export function NovaAutomacaoActivationStep({
  name,
  description,
  conditionsCount,
  waitAmount,
  waitUnit,
  supervisionEnabled,
}: NovaAutomacaoActivationStepProps) {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold">Revisão e Ativação</h2>
      <div className="rounded-lg border border-border p-4">
        <h3 className="font-semibold">{name || "Sem nome"}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description || "Sem descrição"}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant={conditionsCount > 0 ? "green" : "red"}>
            {conditionsCount} condições
          </Badge>
          <Badge variant="blue">
            {waitAmount} {waitUnit}
          </Badge>
          <Badge variant={supervisionEnabled ? "green" : "gray"}>
            Supervisão: {supervisionEnabled ? "Sim" : "Não"}
          </Badge>
        </div>
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <AlertTriangle className="mb-1 inline size-4" /> Ao ativar, a automação começará a avaliar leads imediatamente. Leads elegíveis receberão mensagens conforme a configuração.
      </div>
    </div>
  )
}
