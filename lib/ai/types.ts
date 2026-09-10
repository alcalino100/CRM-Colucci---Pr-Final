import { z } from "zod"

// ---------------------------------------------------------------------------
// Tipos centrais da IA conversacional (spec: snake_case no banco, camelCase fora
// só onde a UI precisa — aqui espelhamos o banco para evitar mapeamento).
// ---------------------------------------------------------------------------

export type EscalationCondition = "keyword" | "max_turns" | "sentiment"
export type EscalationAction = "notify_team" | "immediate_handoff" | "escalate_specialist"
export type EscalationChannel = "whatsapp" | "slack" | "email"
export type EscalationSeverity = "low" | "medium" | "high"

export type EscalationTrigger = {
  id: string
  ai_id: string
  name: string
  condition: EscalationCondition
  detection_keywords: string[]
  action: EscalationAction
  notification_channels: string[]
  assign_to?: string | null
  created_at: string
}

export type GoalType = "qualification" | "booking" | "info" | "custom"

export type Goal = {
  id: string
  ai_id: string
  name: string
  type: GoalType
  description: string
  questions: string[]
  success_criteria?: {
    questionsAnswered?: number
    budget_min?: number
    timeline_days?: number
  }
  next_step?: string
  fallback?: string
  prompt: string
  created_at: string
}

export type EscalationCheck = {
  shouldEscalate: boolean
  reason: string
  triggerName?: string
  severity: EscalationSeverity
}

// ---------------------------------------------------------------------------
// Validação (zod) — usada nas API routes.
// ---------------------------------------------------------------------------

export const TriggerSchema = z.object({
  name: z.string().min(1, "name é obrigatório").max(100, "name máx. 100 chars"),
  condition: z.enum(["keyword", "max_turns", "sentiment"]),
  detection_keywords: z.array(z.string()).default([]),
  action: z.enum(["notify_team", "immediate_handoff", "escalate_specialist"]),
  notification_channels: z.array(z.enum(["whatsapp", "slack", "email"])).default([]),
})

export type TriggerInput = z.infer<typeof TriggerSchema>

export const GoalSchema = z.object({
  name: z.string().min(1, "name é obrigatório").max(200, "name máx. 200 chars"),
  type: z.enum(["qualification", "booking", "info", "custom"]),
  description: z.string().default(""),
  questions: z.array(z.string()).default([]),
  success_criteria: z
    .object({
      questionsAnswered: z.number().optional(),
      budget_min: z.number().optional(),
      timeline_days: z.number().optional(),
    })
    .optional(),
  next_step: z.string().optional(),
  fallback: z.string().optional(),
  prompt: z.string().min(10, "prompt mín. 10 chars"),
})

export type GoalInput = z.infer<typeof GoalSchema>

export function zodMessage(e: unknown): string {
  if (e instanceof z.ZodError) {
    return "Validation error: " + e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
  }
  return String((e as Error)?.message ?? e)
}
