"use client"

import { Input, Label, Select, Textarea } from "@/components/ui/primitives"
import type { AutomationCancellationRules, AutomationLimitsConfig } from "@/lib/automation-types"
import { cn } from "@/lib/utils"
import { formatCancelRule } from "./nova-automacao-utils"

export function NovaAutomacaoInfoStep({
  name,
  setName,
  description,
  setDescription,
  category,
  setCategory,
  status,
  setStatus,
}: {
  name: string
  setName: (v: string) => void
  description: string
  setDescription: (v: string) => void
  category: string
  setCategory: (v: string) => void
  status: "draft" | "active" | "paused"
  setStatus: (v: "draft" | "active") => void
}) {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold">Informações Gerais</h2>
      <div>
        <Label>Nome da Automação *</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Reativação de Leads Frios"
        />
      </div>
      <div>
        <Label>Descrição</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descreva o objetivo desta automação..."
          rows={3}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Categoria</Label>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="reativacao">Reativação</option>
            <option value="follow_up">Follow-up</option>
            <option value="nurture">Nurture</option>
          </Select>
        </div>
        <div>
          <Label>Status Inicial</Label>
          <Select value={status} onChange={(e) => setStatus(e.target.value as "draft" | "active")}>
            <option value="draft">Rascunho</option>
            <option value="active">Ativar imediatamente</option>
          </Select>
        </div>
      </div>
    </div>
  )
}

export function NovaAutomacaoTriggerStep({
  triggerType,
  setTriggerType,
}: {
  triggerType: string
  setTriggerType: (v: string) => void
}) {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold">Gatilho</h2>
      <p className="text-sm text-muted-foreground">Define quando a automação começa a avaliar leads</p>
      <div>
        <Label>Tipo de Gatilho</Label>
        <Select value={triggerType} onChange={(e) => setTriggerType(e.target.value)}>
          <option value="lead_inactive">Lead permanece sem interação</option>
          <option value="lead_created">Lead criado</option>
          <option value="lead_entered_stage">Lead entrou em etapa</option>
          <option value="lead_received_tag">Lead recebeu tag</option>
        </Select>
      </div>
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
        <p>
          O gatilho <strong>&quot;Lead permanece sem interação&quot;</strong> verifica periodicamente os leads que atendem às condições e cria jobs na fila quando o lead fica inativo pelo tempo configurado.
        </p>
      </div>
    </div>
  )
}

export function NovaAutomacaoWaitStep({
  waitAmount,
  setWaitAmount,
  waitUnit,
  setWaitUnit,
  allowedStartHour,
  setAllowedStartHour,
  allowedEndHour,
  setAllowedEndHour,
  allowedDays,
  toggleDay,
}: {
  waitAmount: number
  setWaitAmount: (v: number) => void
  waitUnit: "minutes" | "hours" | "days"
  setWaitUnit: (v: "minutes" | "hours" | "days") => void
  allowedStartHour: string
  setAllowedStartHour: (v: string) => void
  allowedEndHour: string
  setAllowedEndHour: (v: string) => void
  allowedDays: number[]
  toggleDay: (day: number) => void
}) {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold">Período de Espera</h2>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Esperar por</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              value={waitAmount}
              onChange={(e) => setWaitAmount(parseInt(e.target.value, 10) || 1)}
              className="w-24"
            />
            <Select value={waitUnit} onChange={(e) => setWaitUnit(e.target.value as "minutes" | "hours" | "days")}>
              <option value="minutes">Minutos</option>
              <option value="hours">Horas</option>
              <option value="days">Dias</option>
            </Select>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Horário inicial permitido</Label>
          <Input type="time" value={allowedStartHour} onChange={(e) => setAllowedStartHour(e.target.value)} />
        </div>
        <div>
          <Label>Horário final permitido</Label>
          <Input type="time" value={allowedEndHour} onChange={(e) => setAllowedEndHour(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>Dias da semana permitidos</Label>
        <div className="mt-1 flex gap-2">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d, i) => (
            <button
              key={i}
              type="button"
              onClick={() => toggleDay(i)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                allowedDays.includes(i)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function NovaAutomacaoCancellationStep({
  cancellationRules,
  setCancellationRules,
}: {
  cancellationRules: AutomationCancellationRules
  setCancellationRules: React.Dispatch<React.SetStateAction<AutomationCancellationRules>>
}) {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold">Regras de Cancelamento</h2>
      <p className="text-sm text-muted-foreground">
        Se qualquer uma dessas ações ocorrer antes do envio, o job é cancelado automaticamente
      </p>
      <div className="space-y-2">
        {Object.entries(cancellationRules).map(([key, value]) => (
          <label key={key} className="flex items-center gap-3 rounded-lg border border-border/60 p-3">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => setCancellationRules((prev) => ({ ...prev, [key]: e.target.checked }))}
              className="size-4 rounded border-gray-300"
            />
            <span className="text-sm">{formatCancelRule(key)}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

export function NovaAutomacaoSupervisionStep({
  supervisionEnabled,
  setSupervisionEnabled,
  supervisorUserId,
  setSupervisorUserId,
  keepCurrentAgent,
  setKeepCurrentAgent,
  createAutomaticNote,
  setCreateAutomaticNote,
  users,
}: {
  supervisionEnabled: boolean
  setSupervisionEnabled: (v: boolean) => void
  supervisorUserId: string
  setSupervisorUserId: (v: string) => void
  keepCurrentAgent: boolean
  setKeepCurrentAgent: (v: boolean) => void
  createAutomaticNote: boolean
  setCreateAutomaticNote: (v: boolean) => void
  users: { id: string; nome: string; role: string }[]
}) {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold">Supervisão</h2>
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={supervisionEnabled}
          onChange={(e) => setSupervisionEnabled(e.target.checked)}
          className="size-4 rounded"
        />
        <span className="text-sm font-medium">Aplicar supervisão após envio bem-sucedido</span>
      </label>
      {supervisionEnabled && (
        <>
          <div>
            <Label>Gestor Supervisor</Label>
            <Select value={supervisorUserId} onChange={(e) => setSupervisorUserId(e.target.value)}>
              <option value="">Selecionar...</option>
              {users
                .filter((u) => u.role.includes("gestor"))
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
            </Select>
          </div>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={keepCurrentAgent}
              onChange={(e) => setKeepCurrentAgent(e.target.checked)}
              className="size-4 rounded"
            />
            <span className="text-sm">Manter corretor atual (não substituir responsável)</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={createAutomaticNote}
              onChange={(e) => setCreateAutomaticNote(e.target.checked)}
              className="size-4 rounded"
            />
            <span className="text-sm">Criar observação automática no histórico</span>
          </label>
        </>
      )}
    </div>
  )
}

export function NovaAutomacaoLimitsStep({
  limitsConfig,
  setLimitsConfig,
}: {
  limitsConfig: AutomationLimitsConfig
  setLimitsConfig: React.Dispatch<React.SetStateAction<AutomationLimitsConfig>>
}) {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold">Limites e Segurança</h2>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Máx. envios por lead</Label>
          <Input
            type="number"
            value={limitsConfig.max_sends_per_lead ?? 3}
            onChange={(e) =>
              setLimitsConfig((p) => ({ ...p, max_sends_per_lead: parseInt(e.target.value, 10) || 3 }))
            }
          />
        </div>
        <div>
          <Label>Máx. envios diários</Label>
          <Input
            type="number"
            value={limitsConfig.max_daily_sends ?? 50}
            onChange={(e) =>
              setLimitsConfig((p) => ({ ...p, max_daily_sends: parseInt(e.target.value, 10) || 50 }))
            }
          />
        </div>
        <div>
          <Label>Intervalo mínimo (min)</Label>
          <Input
            type="number"
            value={limitsConfig.min_interval_between_messages_minutes ?? 60}
            onChange={(e) =>
              setLimitsConfig((p) => ({
                ...p,
                min_interval_between_messages_minutes: parseInt(e.target.value, 10) || 60,
              }))
            }
          />
        </div>
        <div>
          <Label>Janela de bloqueio (horas)</Label>
          <Input
            type="number"
            value={limitsConfig.block_window_hours ?? 24}
            onChange={(e) =>
              setLimitsConfig((p) => ({ ...p, block_window_hours: parseInt(e.target.value, 10) || 24 }))
            }
          />
        </div>
      </div>
    </div>
  )
}
