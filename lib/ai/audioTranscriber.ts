// Transcrição de áudios do WhatsApp para o fluxo NORMAL (vínculo de lead, regras,
// escalação, auditoria) — nada de pipeline paralela. Estratégia:
//   1. OpenAI Whisper (se OPENAI_API_KEY configurada) — melhor fidelidade e custo.
//   2. Gemini multimodal (áudio nativo) — fallback, sem serviço extra.
// A API da Anthropic (Claude) NÃO aceita entrada de áudio — apenas text/image/pdf/
// document — então não há tentativa de transcrição por Claude aqui.
export type TranscricaoOut = { texto: string; modelo: string }

// Mime que os provedores aceitam para áudio (corta ";codecs=..." do WhatsApp).
export function normalizarMimeAudio(mime: string | null | undefined): string {
  const base = String(mime || "").split(";")[0].trim().toLowerCase()
  if (base === "audio/ogg" || base === "audio/opus") return "audio/ogg"
  if (base === "audio/mpeg" || base === "audio/mp3") return "audio/mpeg"
  if (base === "audio/wav" || base === "audio/x-wav") return "audio/wav"
  if (base === "audio/mp4" || base === "audio/x-m4a" || base === "audio/aac") return "audio/mp4"
  if (base === "audio/webm") return "audio/webm"
  if (base === "audio/flac") return "audio/flac"
  if (base === "audio/amr") return "audio/amr"
  return base || "audio/ogg"
}

function extPorMime(mime: string): string {
  if (mime === "audio/mpeg" || mime === "audio/mp3") return "mp3"
  if (mime === "audio/mp4" || mime === "audio/x-m4a" || mime === "audio/aac") return "m4a"
  if (mime === "audio/wav" || mime === "audio/x-wav") return "wav"
  if (mime === "audio/webm") return "webm"
  if (mime === "audio/flac") return "flac"
  if (mime === "audio/amr") return "amr"
  return "ogg"
}

// Whisper via API REST (FormData/Blob globais do Node runtime).
export async function transcreverAudioWhisper(base64: string, mimeType: string | null): Promise<TranscricaoOut> {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error("OPENAI_API_KEY ausente")
  if (!base64) throw new Error("Áudio vazio")
  const mime = normalizarMimeAudio(mimeType)
  const buf = Buffer.from(base64, "base64")
  const form = new FormData()
  form.append("file", new Blob([buf], { type: mime }), `audio.${extPorMime(mime)}`)
  form.append("model", "whisper-1")
  form.append("language", "pt")
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`Whisper: HTTP ${r.status} (${j?.error?.message || "sem detalhe"})`)
  const texto = String(j?.text || "").trim()
  if (!texto) throw new Error("Whisper: transcrição vazia")
  return { texto, modelo: "whisper-1" }
}

const MODELOS = ["gemini-2.5-flash", "gemini-flash-latest"]

export async function transcreverAudioGemini(base64: string, mimeType: string | null): Promise<TranscricaoOut> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!key) throw new Error("GEMINI_API_KEY ausente no ambiente")
  if (!base64) throw new Error("Áudio vazio")
  const mime = normalizarMimeAudio(mimeType)
  let ultimoErro = ""
  for (const m of MODELOS) {
    let r: Response
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { inline_data: { mime_type: mime, data: base64 } },
                { text: "Transcreva este áudio em português brasileiro, fiel ao que foi dito, sem comentários. Retorne SÓ a transcrição." },
              ],
            },
          ],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1000 },
        }),
      })
    } catch (e: unknown) {
      ultimoErro = `rede (${e instanceof Error ? e.message : String(e)})`
      continue
    }
    const j = await r.json().catch(() => null)
    if (r.ok) {
      const texto = String(j?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim()
      if (texto) return { texto, modelo: m }
      ultimoErro = "transcrição vazia"
      continue
    }
    ultimoErro = `HTTP ${r.status} (${j?.error?.message || "sem detalhe"})`
    // 429 (cota) NÃO interrompe: outro modelo pode ter cota livre. Demais erros sim.
    if (!/not found|not supported|no longer/i.test(ultimoErro) && !/HTTP 429/.test(ultimoErro)) break
  }
  throw new Error(`Transcrição falhou: ${ultimoErro}`)
}