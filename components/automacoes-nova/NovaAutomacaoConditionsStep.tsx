"use client"

import { Badge, Input, Select } from "@/components/ui/primitives"
import type { AutomationCondition, AutomationConditionGroup } from "@/lib/automation-types"
import { CONDITION_FIELDS } from "./nova-automacao-utils"

interface NovaAutomacaoConditionsStepProps {
  conditions: AutomationConditionGroup
  setConditions: React.Dispatch<React.SetStateAction<AutomationConditionGroup>>
}

export function NovaAutomacaoConditionsStep({
  conditions,
  setConditions,
}: NovaAutomacaoConditionsStepProps) {
  function addCondition() {
    setConditions((prev) => ({
      ...prev,
      rules: [...prev.rules, { field: "status", operator: "equals", value: "" }],
    }))
  }

  function removeCondition(index: number) {
    setConditions((prev) => ({
      ...prev,
      rules: prev.rules.filter((_, i) => i !== index),
    }))
  }

  function updateCondition(index: number, patch: Partial<AutomationCondition>) {
    setConditions((prev) => ({
      ...prev,
      rules: prev.rules.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    }))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Condições</h2>
        <div className="flex items-center gap-2">
          <Badge variant={conditions.mode === "and" ? "blue" : "amber"}>
            {conditions.mode === "and" ? "AND (todas)" : "OR (qualquer)"}
          </Badge>
          <button
            type="button"
            onClick={() => setConditions((p) => ({ ...p, mode: p.mode === "and" ? "or" : "and" }))}
            className="text-xs font-medium text-primary hover:underline"
          >
            Alternar
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {conditions.rules.map((rule, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg border border-border/60 p-3">
            <Select
              value={rule.field}
              onChange={(e) => updateCondition(i, { field: e.target.value })}
              className="w-48"
            >
              {CONDITION_FIELDS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
            <Select
              value={rule.operator}
              onChange={(e) => updateCondition(i, { operator: e.target.value as AutomationCondition["operator"] })}
              className="w-36"
            >
              <option value="equals">É igual a</option>
              <option value="not_equals">Não é igual a</option>
              <option value="greater_than">Maior que</option>
              <option value="less_than">Menor que</option>
            </Select>
            {typeof rule.value === "boolean" ? (
              <Select
                value={String(rule.value)}
                onChange={(e) => updateCondition(i, { value: e.target.value === "true" })}
                className="w-32"
              >
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </Select>
            ) : typeof rule.value === "number" ? (
              <Input
                type="number"
                value={rule.value}
                onChange={(e) => updateCondition(i, { value: parseInt(e.target.value, 10) || 0 })}
                className="w-32"
              />
            ) : (
              <Input
                value={String(rule.value)}
                onChange={(e) => updateCondition(i, { value: e.target.value })}
                className="flex-1"
                placeholder="Valor..."
              />
            )}
            <button
              type="button"
              onClick={() => removeCondition(i)}
              className="rounded p-1 text-red-500 hover:bg-red-50 text-xs"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addCondition}
        className="text-sm font-medium text-primary hover:underline"
      >
        + Adicionar condição
      </button>
    </div>
  )
}
