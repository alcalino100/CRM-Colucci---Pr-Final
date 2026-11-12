"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowRight, Check, Save, Zap } from "lucide-react"
import { Card, CardContent } from "@/components/ui/primitives"
import { useAutomation } from "@/lib/automation-store"
import { useLeads } from "@/lib/leads-store"
import { useAuth } from "@/lib/auth-context"
import { isGestorNivel } from "@/lib/roles"
import type {
  Automation,
  AutomationCancellationRules,
  AutomationConditionGroup,
  AutomationLimitsConfig,
  AutomationTriggerType,
} from "@/lib/automation-types"
import { cn } from "@/lib/utils"
import {
  WIZARD_STEPS,
  DEFAULT_CONDITIONS,
  DEFAULT_CANCELLATION_RULES,
  DEFAULT_LIMITS_CONFIG,
  generateAutomationSlug,
  renderPreviewMessage,
} from "@/components/automacoes-nova/nova-automacao-utils"
import {
  NovaAutomacaoInfoStep,
  NovaAutomacaoTriggerStep,
  NovaAutomacaoWaitStep,
  NovaAutomacaoCancellationStep,
  NovaAutomacaoSupervisionStep,
  NovaAutomacaoLimitsStep,
} from "@/components/automacoes-nova/NovaAutomacaoConfigSteps"
import { NovaAutomacaoConditionsStep } from "@/components/automacoes-nova/NovaAutomacaoConditionsStep"
import { NovaAutomacaoMessageStep } from "@/components/automacoes-nova/NovaAutomacaoMessageStep"
import {
  NovaAutomacaoPreviewStep,
  NovaAutomacaoActivationStep,
} from "@/components/automacoes-nova/NovaAutomacaoReviewSteps"

export default function NovaAutomacaoPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get("id")
  const { user } = useAuth()
  const { automations, addAutomation, updateAutomation, templates, updateTemplate } = useAutomation()
  const { users, leads } = useLeads()

  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (user && !isGestorNivel(user.role)) router.replace("/painel-corretor")
  }, [user, router])
  if (user && !isGestorNivel(user.role)) return null

  // Form state
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState("reativacao")
  const [status, setStatus] = useState<"draft" | "active" | "paused">("draft")
  const [triggerType, setTriggerType] = useState<string>("lead_inactive")
  const [conditions, setConditions] = useState<AutomationConditionGroup>(DEFAULT_CONDITIONS)
  const [waitAmount, setWaitAmount] = useState(10)
  const [waitUnit, setWaitUnit] = useState<"minutes" | "hours" | "days">("minutes")
  const [allowedStartHour, setAllowedStartHour] = useState("08:00")
  const [allowedEndHour, setAllowedEndHour] = useState("18:00")
  const [allowedDays, setAllowedDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [cancellationRules, setCancellationRules] = useState<AutomationCancellationRules>(DEFAULT_CANCELLATION_RULES)
  const [messageTemplateId, setMessageTemplateId] = useState<string>(templates[0]?.id ?? "")
  const [messageContent, setMessageContent] = useState("")
  const [supervisionEnabled, setSupervisionEnabled] = useState(true)
  const [supervisorUserId, setSupervisorUserId] = useState<string>("")
  const [keepCurrentAgent, setKeepCurrentAgent] = useState(true)
  const [createAutomaticNote, setCreateAutomaticNote] = useState(true)
  const [limitsConfig, setLimitsConfig] = useState<AutomationLimitsConfig>(DEFAULT_LIMITS_CONFIG)

  // Carregar automação existente para edição
  useEffect(() => {
    if (!editId) return
    const auto = automations.find((a) => a.id === editId)
    if (!auto) return
    setName(auto.name)
    setDescription(auto.description ?? "")
    setCategory(auto.category)
    setStatus(auto.status === "draft" ? "draft" : auto.status === "paused" ? "paused" : "active")
    setTriggerType(auto.trigger_type)
    setConditions(auto.conditions)
    setWaitAmount(auto.wait_config.amount)
    setWaitUnit(auto.wait_config.unit)
    setAllowedStartHour(auto.wait_config.allowed_start_hour ?? "08:00")
    setAllowedEndHour(auto.wait_config.allowed_end_hour ?? "18:00")
    setAllowedDays(auto.wait_config.allowed_days ?? [1, 2, 3, 4, 5])
    setCancellationRules(auto.cancellation_rules)
    setMessageTemplateId(auto.message_template_id ?? "")
    setSupervisionEnabled(auto.supervision_enabled)
    setSupervisorUserId(auto.supervisor_user_id ?? "")
    setKeepCurrentAgent(auto.keep_current_agent)
    setCreateAutomaticNote(auto.create_automatic_note)
    setLimitsConfig(auto.limits_config)
  }, [editId, automations])

  // Load template content
  useEffect(() => {
    if (!messageTemplateId) return
    const tmpl = templates.find((t) => t.id === messageTemplateId)
    if (tmpl) setMessageContent(tmpl.content)
  }, [messageTemplateId, templates])

  // Set supervisor default
  useEffect(() => {
    if (!supervisorUserId) {
      const pati = users.find((u) => u.nome === "Patricia")
      if (pati) setSupervisorUserId(pati.id)
    }
  }, [users, supervisorUserId])

  const previewMessage = useMemo(() => renderPreviewMessage(messageContent), [messageContent])

  const eligibleCount = useMemo(() => {
    return leads.filter(
      (l) => l.status === "novo" && l.origem === "Tráfego Pago" && l.temperatura === "frio"
    ).length
  }, [leads])

  function toggleDay(day: number) {
    setAllowedDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()))
  }

  async function handleSave(newStatus: "draft" | "active") {
    setSaving(true)
    const slug = generateAutomationSlug(name)

    const data: Omit<Automation, "id" | "created_at" | "updated_at" | "deleted_at"> = {
      organization_id: "00000000-0000-0000-0000-000000000000",
      name,
      slug,
      description,
      category,
      status: newStatus,
      priority: 0,
      trigger_type: triggerType as AutomationTriggerType,
      trigger_config: {},
      conditions,
      wait_config: {
        amount: waitAmount,
        unit: waitUnit,
        allowed_start_hour: allowedStartHour,
        allowed_end_hour: allowedEndHour,
        allowed_days: allowedDays,
        timezone: "America/Sao_Paulo",
      },
      cancellation_rules: cancellationRules,
      message_template_id: messageTemplateId || null,
      whatsapp_connection_id: null,
      supervision_enabled: supervisionEnabled,
      supervisor_user_id: supervisorUserId || null,
      keep_current_agent: keepCurrentAgent,
      create_automatic_note: createAutomaticNote,
      automatic_note_template:
        "Automação {{nome_automacao}} enviada com sucesso em {{data_atual}} às {{hora_atual}}. Gestor {{nome_gestor}} assumiu a supervisão do lead.",
      limits_config: limitsConfig,
      is_test_mode: false,
      is_simulation_mode: false,
      created_by: user?.id ?? null,
      updated_by: user?.id ?? null,
    }

    const result = editId ? await updateAutomation(editId, data) : await addAutomation(data)

    // Salvar conteúdo editado da mensagem no template
    if (result.ok && messageTemplateId && messageContent) {
      const tmpl = templates.find((t) => t.id === messageTemplateId)
      if (tmpl && tmpl.content !== messageContent) {
        await updateTemplate(messageTemplateId, { content: messageContent })
      }
    }

    setSaving(false)
    if (result.ok) router.push("/automacoes/regras")
    else alert(result.error)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg p-2 hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {editId ? "Editar" : "Nova"} Automação
          </h1>
          <p className="text-sm text-muted-foreground">Configure a automação de reativação de leads</p>
        </div>
      </div>

      {/* Stepper */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-1 overflow-x-auto">
            {WIZARD_STEPS.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setStep(i)}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition",
                  i === step
                    ? "bg-primary text-primary-foreground"
                    : i < step
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {i < step ? <Check className="size-3.5" /> : <s.icon className="size-3.5" />}
                {s.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step content */}
      <Card>
        <CardContent className="p-6">
          {step === 0 && (
            <NovaAutomacaoInfoStep
              name={name}
              setName={setName}
              description={description}
              setDescription={setDescription}
              category={category}
              setCategory={setCategory}
              status={status}
              setStatus={setStatus}
            />
          )}

          {step === 1 && (
            <NovaAutomacaoTriggerStep triggerType={triggerType} setTriggerType={setTriggerType} />
          )}

          {step === 2 && (
            <NovaAutomacaoConditionsStep
              conditions={conditions}
              setConditions={setConditions}
            />
          )}

          {step === 3 && (
            <NovaAutomacaoWaitStep
              waitAmount={waitAmount}
              setWaitAmount={setWaitAmount}
              waitUnit={waitUnit}
              setWaitUnit={setWaitUnit}
              allowedStartHour={allowedStartHour}
              setAllowedStartHour={setAllowedStartHour}
              allowedEndHour={allowedEndHour}
              setAllowedEndHour={setAllowedEndHour}
              allowedDays={allowedDays}
              toggleDay={toggleDay}
            />
          )}

          {step === 4 && (
            <NovaAutomacaoCancellationStep
              cancellationRules={cancellationRules}
              setCancellationRules={setCancellationRules}
            />
          )}

          {step === 5 && (
            <NovaAutomacaoMessageStep
              templates={templates}
              messageTemplateId={messageTemplateId}
              setMessageTemplateId={setMessageTemplateId}
              messageContent={messageContent}
              setMessageContent={setMessageContent}
              previewMessage={previewMessage}
            />
          )}

          {step === 6 && (
            <NovaAutomacaoSupervisionStep
              supervisionEnabled={supervisionEnabled}
              setSupervisionEnabled={setSupervisionEnabled}
              supervisorUserId={supervisorUserId}
              setSupervisorUserId={setSupervisorUserId}
              keepCurrentAgent={keepCurrentAgent}
              setKeepCurrentAgent={setKeepCurrentAgent}
              createAutomaticNote={createAutomaticNote}
              setCreateAutomaticNote={setCreateAutomaticNote}
              users={users}
            />
          )}

          {step === 7 && (
            <NovaAutomacaoLimitsStep
              limitsConfig={limitsConfig}
              setLimitsConfig={setLimitsConfig}
            />
          )}

          {step === 8 && (
            <NovaAutomacaoPreviewStep
              conditions={conditions}
              waitAmount={waitAmount}
              waitUnit={waitUnit}
              allowedStartHour={allowedStartHour}
              allowedEndHour={allowedEndHour}
              allowedDays={allowedDays}
              supervisionEnabled={supervisionEnabled}
              limitsConfig={limitsConfig}
              eligibleCount={eligibleCount}
              previewMessage={previewMessage}
            />
          )}

          {step === 9 && (
            <NovaAutomacaoActivationStep
              name={name}
              description={description}
              conditionsCount={conditions.rules.length}
              waitAmount={waitAmount}
              waitUnit={waitUnit}
              supervisionEnabled={supervisionEnabled}
            />
          )}
        </CardContent>
      </Card>

      {/* Navegação */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-muted disabled:opacity-40"
        >
          <ArrowLeft className="size-4" /> Anterior
        </button>
        <div className="flex gap-2">
          {step === WIZARD_STEPS.length - 1 ? (
            <>
              <button
                type="button"
                onClick={() => handleSave("draft")}
                disabled={saving || !name}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-muted disabled:opacity-40"
              >
                <Save className="size-4" /> Salvar Rascunho
              </button>
              <button
                type="button"
                onClick={() => handleSave("active")}
                disabled={saving || !name}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
              >
                <Zap className="size-4" /> Ativar Automação
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(WIZARD_STEPS.length - 1, s + 1))}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              Próximo <ArrowRight className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
