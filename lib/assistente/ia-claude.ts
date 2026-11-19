import "server-only"
import { chamarClaudeComFallback, CLAUDE_MODELO_PADRAO, CLAUDE_MODELO_RAPIDO } from "@/lib/ai/claude"
import { providerFromModel } from "@/lib/ai/generateResponse"
import { decryptToken } from "@/lib/encryption"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import type { ChamadaIa } from "./ia"

export type CredencialClaude = { apiKey: string; modeloAgente?: string; origem: "agente" | "ambiente" }

/**
 * Reaproveita a IA que já está conectada no CRM:
 *  1) se a config aponta um agente da IA Conversacional que usa Claude, usa a chave/modelo dele;
 *  2) senão, usa CLAUDE_API_KEY / ANTHROPIC_API_KEY do servidor.
 * Devolve null se não houver chave Claude (o assistente segue 100% determinístico).
 */
export async function resolverCredencialClaude(aiAgentId?: string): Promise<CredencialClaude | null> {
  if (aiAgentId) {
    try {
      const { data } = await (getSupabaseAdmin() as any).from("ai_agents").select("model_name,api_token").eq("id", aiAgentId).maybeSingle()
      if (data && providerFromModel(data.model_name) === "claude") {
        let chave: string | undefined
        if (data.api_token) {
          try { chave = decryptToken(data.api_token) } catch { chave = data.api_token }
        }
        chave = chave || process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY
        if (chave) return { apiKey: chave, modeloAgente: data.model_name, origem: "agente" }
      }
    } catch {
      /* cai para o ambiente */
    }
  }
  const env = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY
  return env ? { apiKey: env, origem: "ambiente" } : null
}

/** Chamada de IA do assistente: modelo rápido primeiro (latência de WhatsApp), com reserva no modelo do agente/padrão. */
export function criarChamadaIa(cred: CredencialClaude): ChamadaIa {
  return (p) =>
    chamarClaudeComFallback({
      apiKey: cred.apiKey,
      modelos: [CLAUDE_MODELO_RAPIDO, cred.modeloAgente ?? "", CLAUDE_MODELO_PADRAO],
      system: p.system,
      messages: p.messages,
      tools: p.tools,
      toolChoice: p.toolChoice,
      maxTokens: p.maxTokens,
      timeoutMs: p.timeoutMs,
      maxRetries: 1,
      temperature: 0.3,
    })
}
