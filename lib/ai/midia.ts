import { decryptToken } from "@/lib/encryption"
import { providerFromModel } from "./generateResponse"
import { agenteParaInstancia } from "./inboxHandler"
import { transcreverAudioGemini, transcreverAudioWhisper } from "./audioTranscriber"

export type ProvedorMidia = "claude" | "gemini" | "openai"

// Chave Claude do agente (token próprio descriptografado ou env), como em generateResponse.
function chaveClaude(agente: { api_token?: string }): string {
  const raw = agente?.api_token
  if (raw) {
    try {
      return decryptToken(raw)
    } catch {
      return raw
    }
  }
  return process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || ""
}

async function provedorDoAgente(instanceName?: string): Promise<{ agente: { id: string; model_name?: string; api_token?: string }; provedor: string } | null> {
  try {
    const agente = await agenteParaInstancia(instanceName)
    if (!agente) return null
    return { agente, provedor: providerFromModel(agente.model_name) }
  } catch {
    return null
  }
}

async function chamarClaudeMidia(params: {
  apiKey: string
  model: string
  blocoMidia: Record<string, unknown>
  instrucao: string
  maxTokens: number
}): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": params.apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: params.model,
      max_tokens: params.maxTokens,
      messages: [{ role: "user", content: [params.blocoMidia, { type: "text", text: params.instrucao }] }],
    }),
  })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`Claude mídia: HTTP ${r.status} (${j?.error?.message || "sem detalhe"})`)
  const texto = String(j?.content?.[0]?.text || "").trim()
  if (!texto) throw new Error("Claude mídia: resposta vazia")
  return texto
}

// Descreve imagem: SOMENTE Claude. Áudio: OpenAI Whisper com fallback Gemini
// (áudios não têm suporte na Messages API da Anthropic). Para garantir robustez,
// o Gemini só aparece se o Whisper falhar — registrado na auditoria via provedor.
export async function descreverImagemSmart(
  instanceName: string | undefined,
  base64: string,
  mimeType: string | null,
): Promise<{ texto: string; provedor: ProvedorMidia; modelo: string }> {
  const mime = String(mimeType || "image/jpeg").split(";")[0].trim() || "image/jpeg"
  const ctx = await provedorDoAgente(instanceName)
  if (!ctx || ctx.provedor !== "claude") {
    throw new Error("Agente da instância não é Claude (verifique model_name do agente)")
  }
  const key = chaveClaude(ctx.agente)
  if (!key) throw new Error("Sem chave Claude resolvida para a instância")
  const model = ctx.agente.model_name || "claude-haiku-4-5"
  const texto = await chamarClaudeMidia({
    apiKey: key,
    model,
    blocoMidia: { type: "image", source: { type: "base64", media_type: mime, data: base64 } },
    instrucao: "Descreva esta imagem em português brasileiro, objetiva e fielmente, em até 3 linhas. Se houver texto visível, transcreva-o.",
    maxTokens: 500,
  })
  return { texto, provedor: "claude", modelo: model }
}

// Transcreve áudio: OpenAI Whisper primeiro; Gemini apenas como fallback se o
// Whisper falhar (registrado no log). A API do Claude NÃO aceita áudio.
export async function transcreverAudioSmart(
  instanceName: string | undefined,
  base64: string,
  mimeType: string | null,
): Promise<{ texto: string; provedor: ProvedorMidia; modelo: string }> {
  try {
    const t = await transcreverAudioWhisper(base64, mimeType)
    return { texto: t.texto, provedor: "openai", modelo: t.modelo }
  } catch (e: unknown) {
    if (process.env.OPENAI_API_KEY) {
      console.error("[mídia] Whisper falhou, caindo para Gemini:", e instanceof Error ? e.message : String(e))
    }
  }
  const g = await transcreverAudioGemini(base64, mimeType)
  return { texto: g.texto, provedor: "gemini", modelo: g.modelo }
}
