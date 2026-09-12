import { decryptToken } from "@/lib/encryption"
import { providerFromModel } from "./generateResponse"
import { agenteParaInstancia } from "./inboxHandler"
import { transcreverAudio as transcreverAudioGemini } from "./audioTranscriber"

export type ProvedorMidia = "claude" | "gemini"

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

async function descreverGemini(base64: string, mime: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!key) throw new Error("GEMINI_API_KEY ausente")
  const modelos = ["gemini-2.5-flash", "gemini-flash-latest"]
  let ultimo = ""
  for (const m of modelos) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ inline_data: { mime_type: mime, data: base64 } }, { text: "Descreva esta imagem em português brasileiro, objetiva e fielmente, em até 3 linhas. Se houver texto visível, transcreva-o." }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
        }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) {
        ultimo = `HTTP ${r.status}`
        if (!/not found|not supported|no longer/i.test(String(j?.error?.message || ""))) break
        continue
      }
      const t = String(j?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim()
      if (t) return t
      ultimo = "vazio"
    } catch (e: unknown) {
      ultimo = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(`Gemini visão falhou: ${ultimo}`)
}

// Transcreve áudio: Claude do agente primeiro (quando configurado), Gemini como fallback.
// Retorna o texto + qual provedor funcionou (vai para a auditoria).
export async function transcreverAudioSmart(
  instanceName: string | undefined,
  base64: string,
  mimeType: string | null,
): Promise<{ texto: string; provedor: ProvedorMidia; modelo: string }> {
  const ctx = await provedorDoAgente(instanceName)
  let erroClaude: string | null = null
  if (ctx && ctx.provedor === "claude") {
    const key = chaveClaude(ctx.agente)
    const model = ctx.agente.model_name || "claude-haiku-4-5"
    if (key) {
      try {
        const mime = String(mimeType || "audio/ogg").split(";")[0].trim() || "audio/ogg"
        const texto = await chamarClaudeMidia({
          apiKey: key,
          model,
          blocoMidia: { type: "audio", source: { type: "base64", media_type: mime, data: base64 } },
          instrucao: "Transcreva este áudio em português brasileiro, fiel ao que foi dito, sem comentários. Retorne SÓ a transcrição.",
          maxTokens: 1000,
        })
        return { texto, provedor: "claude", modelo: model }
      } catch (e: unknown) {
        erroClaude = e instanceof Error ? e.message : String(e)
        console.error("[mídia] Claude áudio falhou, caindo para Gemini:", erroClaude)
      }
    } else {
      erroClaude = "sem chave Claude resolvida"
    }
  } else {
    erroClaude = "agente sem provedor Claude"
  }
  try {
    const g = await transcreverAudioGemini(base64, mimeType)
    return { texto: g.texto, provedor: "gemini", modelo: g.modelo }
  } catch (e: unknown) {
    const erroGemini = e instanceof Error ? e.message : String(e)
    throw new Error(`Claude: ${erroClaude} | Gemini: ${erroGemini}`)
  }
}

// Descreve imagem (Claude vision primeiro, Gemini fallback).
export async function descreverImagemSmart(
  instanceName: string | undefined,
  base64: string,
  mimeType: string | null,
): Promise<{ texto: string; provedor: ProvedorMidia; modelo: string }> {
  const mime = String(mimeType || "image/jpeg").split(";")[0].trim() || "image/jpeg"
  const ctx = await provedorDoAgente(instanceName)
  let erroClaude: string | null = null
  if (ctx && ctx.provedor === "claude") {
    const key = chaveClaude(ctx.agente)
    const model = ctx.agente.model_name || "claude-haiku-4-5"
    if (key) {
      try {
        const texto = await chamarClaudeMidia({
          apiKey: key,
          model,
          blocoMidia: { type: "image", source: { type: "base64", media_type: mime, data: base64 } },
          instrucao: "Descreva esta imagem em português brasileiro, objetiva e fielmente, em até 3 linhas. Se houver texto visível, transcreva-o.",
          maxTokens: 500,
        })
        return { texto, provedor: "claude", modelo: model }
      } catch (e: unknown) {
        erroClaude = e instanceof Error ? e.message : String(e)
        console.error("[mídia] Claude visão falhou, caindo para Gemini:", erroClaude)
      }
    } else {
      erroClaude = "sem chave Claude resolvida"
    }
  } else {
    erroClaude = "agente sem provedor Claude"
  }
  try {
    const texto = await descreverGemini(base64, mime)
    return { texto, provedor: "gemini", modelo: "gemini-2.5-flash" }
  } catch (e: unknown) {
    const erroGemini = e instanceof Error ? e.message : String(e)
    throw new Error(`Claude: ${erroClaude} | Gemini: ${erroGemini}`)
  }
}
