import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"
import type { EscalationCheck, EscalationTrigger } from "./types"

// Re-export de compatibilidade: o handoff vive em handoffNotifications.ts,
// mas testes/scripts podem importar tudo daqui.
export { notificarEscalacao } from "./handoffNotifications"
export type { HandoffParams } from "./handoffNotifications"

function db() {
  return createClient(SUPABASE_URL, SUPABASE_KEY)
}

export type HistoryMsg = { role: string; content: string }

const PALAVRAS_NEGATIVAS = [
  "não funciona",
  "nao funciona",
  "péssimo",
  "pessimo",
  "horrível",
  "horrivel",
  "pior",
  "nunca",
  "decepcionado",
  "decepcionada",
  "furioso",
  "furiosa",
  "raiva",
  "ódio",
  "odio",
  "absurdo",
  "vergonha",
  "processo",
  "procon",
  "reclamação",
  "reclamacao",
  "quero cancelar",
  "falar com humano",
  "falar com atendente",
  "quero um humano",
  "quero um atendente",
]

const normalize = (v: string): string => (v || "").toLowerCase().trim()

// Núcleo puro (sem I/O): avalia triggers contra a mensagem + histórico.
// Extraído para ser 100% testável offline (__tests__/ai/escalationDetector.test.ts).
export function avaliarTriggers(
  triggers: EscalationTrigger[],
  userMessage: string,
  conversationHistory: HistoryMsg[],
  maxMessagesDefault = 10,
): EscalationCheck {
  const msg = normalize(userMessage)
  const original = userMessage || ""
  const isAllCaps = msg.length > 5 && original.toUpperCase() === original && /[A-ZÃÕÁÉÍÓÚÂÊÔÇ]/.test(original)
  const temExclamacao = original.includes("!!") || original.includes("?!") || original.includes("!?")

  for (const trigger of triggers) {
    if (trigger.condition === "keyword") {
      const kws = Array.isArray(trigger.detection_keywords) ? trigger.detection_keywords : []
      for (const kw of kws) {
        const k = normalize(String(kw))
        if (k && msg.includes(k)) {
          return {
            shouldEscalate: true,
            reason: `Detectada palavra-chave: "${String(kw).trim()}"`,
            triggerName: trigger.name,
            severity: "high",
          }
        }
      }
    }

    if (trigger.condition === "sentiment") {
      if (isAllCaps && temExclamacao) {
        return {
          shouldEscalate: true,
          reason: "Mensagem em MAIÚSCULAS com ênfase (!!) — frustração provável",
          triggerName: trigger.name,
          severity: "high",
        }
      }
      const negCount = PALAVRAS_NEGATIVAS.filter((w) => msg.includes(w)).length
      if (negCount >= 2) {
        return {
          shouldEscalate: true,
          reason: `Frustração detectada (${negCount} expressões negativas)`,
          triggerName: trigger.name,
          severity: "high",
        }
      }
      if (isAllCaps) {
        return {
          shouldEscalate: true,
          reason: "Mensagem em MAIÚSCULAS — possível frustração",
          triggerName: trigger.name,
          severity: "medium",
        }
      }
    }

    if (trigger.condition === "max_turns") {
      const iaCount = conversationHistory.filter((m) => m.role === "ia" || m.role === "assistant").length
      const teto = maxMessagesDefault
      if (teto > 0 && iaCount >= teto) {
        return {
          shouldEscalate: true,
          reason: `Atingiu limite de ${teto} respostas da IA`,
          triggerName: trigger.name,
          severity: "medium",
        }
      }
    }
  }

  return { shouldEscalate: false, reason: "Nenhum trigger ativado", severity: "low" }
}

// Wrapper com banco: carrega triggers do agente e avalia.
export async function detectEscalation(
  aiId: string,
  userMessage: string,
  conversationHistory: HistoryMsg[],
  metadata?: { maxMessages?: number },
): Promise<EscalationCheck> {
  try {
    if (!aiId) return { shouldEscalate: false, reason: "Agente não informado", severity: "low" }
    const { data, error } = await db()
      .from("escalation_triggers")
      .select("*")
      .eq("ai_id", aiId)
    if (error) {
      console.error("[IA] erro carregar triggers", error.message)
      return { shouldEscalate: false, reason: "Erro ao carregar triggers", severity: "low" }
    }
    const triggers = (data ?? []) as EscalationTrigger[]
    if (!triggers.length) {
      return { shouldEscalate: false, reason: "Nenhum trigger configurado", severity: "low" }
    }
    return avaliarTriggers(triggers, userMessage, conversationHistory, metadata?.maxMessages ?? 10)
  } catch (e) {
    console.error("[IA] erro detectEscalation", e)
    return { shouldEscalate: false, reason: "Erro ao carregar triggers", severity: "low" }
  }
}
