import {
  Settings,
  Zap,
  AlertTriangle,
  Clock,
  MessageCircle,
  Shield,
  Eye,
  Check,
} from "lucide-react"
import type {
  AutomationCancellationRules,
  AutomationConditionGroup,
  AutomationLimitsConfig,
} from "@/lib/automation-types"

export const WIZARD_STEPS = [
  { label: "Informações", icon: Settings },
  { label: "Gatilho", icon: Zap },
  { label: "Condições", icon: AlertTriangle },
  { label: "Espera", icon: Clock },
  { label: "Cancelamento", icon: AlertTriangle },
  { label: "Mensagem", icon: MessageCircle },
  { label: "Supervisão", icon: Shield },
  { label: "Limites", icon: AlertTriangle },
  { label: "Prévia", icon: Eye },
  { label: "Ativar", icon: Check },
]

export const CONDITION_FIELDS = [
  { value: "tag_origem", label: "Origem do lead" },
  { value: "status", label: "Etapa do kanban" },
  { value: "temperatura", label: "Temperatura" },
  { value: "has_valid_phone", label: "Possui telefone válido" },
  { value: "is_not_converted", label: "Não foi convertido" },
  { value: "is_not_lost", label: "Não foi perdido" },
  { value: "is_not_archived", label: "Não está arquivado" },
  { value: "automation_not_blocked", label: "Não bloqueado para automações" },
  { value: "not_recently_automated", label: "Não recebeu automação recente" },
]

export const DEFAULT_CONDITIONS: AutomationConditionGroup = {
  mode: "and",
  rules: [
    { field: "tag_origem", operator: "equals", value: "Tráfego Pago" },
    { field: "status", operator: "equals", value: "novo" },
    { field: "temperatura", operator: "equals", value: "frio" },
    { field: "has_valid_phone", operator: "equals", value: true },
    { field: "is_not_converted", operator: "equals", value: true },
    { field: "is_not_lost", operator: "equals", value: true },
    { field: "is_not_archived", operator: "equals", value: true },
    { field: "automation_not_blocked", operator: "equals", value: true },
    { field: "not_recently_automated", operator: "equals", value: true },
  ],
}

export const DEFAULT_CANCELLATION_RULES: AutomationCancellationRules = {
  cancel_on_manual_message: true,
  cancel_on_note: true,
  cancel_on_stage_change: true,
  cancel_on_responsible_change: true,
  cancel_on_temperature_change: true,
  cancel_on_tag_removed: true,
  cancel_on_stage_left: true,
  cancel_on_became_not_cold: true,
  cancel_on_lead_replied: true,
  cancel_on_lost: true,
  cancel_on_converted: true,
  cancel_on_archived: true,
  cancel_on_automated_paused: true,
  cancel_on_phone_invalid: true,
}

export const DEFAULT_LIMITS_CONFIG: AutomationLimitsConfig = {
  max_sends_per_lead: 3,
  max_daily_sends: 50,
  min_interval_between_messages_minutes: 60,
  block_window_hours: 24,
}

export function formatCancelRule(key: string): string {
  const map: Record<string, string> = {
    cancel_on_manual_message: "Corretor enviou mensagem manual",
    cancel_on_note: "Corretor adicionou observação",
    cancel_on_stage_change: "Lead mudou de etapa no kanban",
    cancel_on_responsible_change: "Corretor responsável alterado",
    cancel_on_temperature_change: "Temperatura do lead alterada",
    cancel_on_tag_removed: "Tag removida do lead",
    cancel_on_stage_left: "Lead saiu da etapa Novo Lead",
    cancel_on_became_not_cold: "Lead deixou de ser Frio",
    cancel_on_lead_replied: "Lead respondeu mensagem",
    cancel_on_lost: "Lead marcado como perdido",
    cancel_on_converted: "Lead foi convertido",
    cancel_on_archived: "Lead foi arquivado",
    cancel_on_automated_paused: "Automação pausada para o lead",
    cancel_on_phone_invalid: "Telefone deixou de ser válido",
  }
  return map[key] ?? key
}

export function generateAutomationSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export function renderPreviewMessage(content: string): string {
  if (!content) return ""
  let msg = content
  msg = msg.replaceAll("{{nome_lead}}", "Maria Silva")
  msg = msg.replaceAll("{{primeiro_nome}}", "Maria")
  msg = msg.replaceAll("{{nome_corretor}}", "João Santos")
  msg = msg.replaceAll("{{nome_imobiliaria}}", "Sua Imobiliária")
  msg = msg.replaceAll("{{cidade_lead}}", "Presidente Prudente")
  msg = msg.replaceAll("{{empreendimento_interesse}}", "Residencial Parque")
  msg = msg.replaceAll("{{origem_lead}}", "Tráfego Pago")
  msg = msg.replaceAll("{{telefone_lead}}", "(18) 99999-0000")
  msg = msg.replaceAll("{{data_atual}}", new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }))
  msg = msg.replaceAll("{{hora_atual}}", new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }))
  return msg
}
