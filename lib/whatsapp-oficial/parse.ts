/** Converte o payload do webhook da WhatsApp Cloud API em eventos simples (sem I/O, 100% testável). */
export type MidiaOficial = { tipo: "image" | "audio" | "video" | "document" | "sticker"; mediaId: string; mimeType: string | null; nomeArquivo: string | null }

export type EventoMensagem = {
  tipo: "mensagem"
  phoneNumberId: string
  wamid: string
  telefone: string
  nome: string | null
  corpo: string
  em: string
  midia: MidiaOficial | null
  anuncio: { titulo: string | null } | null
}
export type EventoStatus = {
  tipo: "status"
  phoneNumberId: string
  wamid: string
  status: "sent" | "delivered" | "read" | "failed"
  telefone: string | null
  erro: string | null
}
export type EventoOficial = EventoMensagem | EventoStatus

const txt = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null)
const obj = (v: unknown): Record<string, any> => (v && typeof v === "object" ? (v as Record<string, any>) : {})

function extrair(m: Record<string, any>): { corpo: string; midia: MidiaOficial | null } {
  const t = String(m.type || "")
  if (t === "text") return { corpo: txt(obj(m.text).body) ?? "", midia: null }
  if (t === "button") return { corpo: txt(obj(m.button).text) ?? "", midia: null }
  if (t === "interactive") {
    const i = obj(m.interactive)
    return { corpo: txt(obj(i.button_reply).title) ?? txt(obj(i.list_reply).title) ?? "", midia: null }
  }
  if (t === "image" || t === "audio" || t === "video" || t === "document" || t === "sticker") {
    const d = obj(m[t])
    const mediaId = txt(d.id)
    return {
      corpo: txt(d.caption) ?? "",
      midia: mediaId ? { tipo: t, mediaId, mimeType: txt(d.mime_type), nomeArquivo: txt(d.filename) } : null,
    }
  }
  if (t === "reaction") return { corpo: "", midia: null }
  return { corpo: `[${t || "mensagem"} não suportada]`, midia: null }
}

export function parsearWebhook(payload: unknown): EventoOficial[] {
  const eventos: EventoOficial[] = []
  for (const entry of Array.isArray(obj(payload).entry) ? obj(payload).entry : []) {
    for (const change of Array.isArray(obj(entry).changes) ? obj(entry).changes : []) {
      if (obj(change).field !== "messages") continue
      const v = obj(obj(change).value)
      const phoneNumberId = txt(obj(v.metadata).phone_number_id)
      if (!phoneNumberId) continue
      const nomes = new Map<string, string>()
      for (const c of Array.isArray(v.contacts) ? v.contacts : []) {
        const waId = txt(obj(c).wa_id)
        const nome = txt(obj(obj(c).profile).name)
        if (waId && nome) nomes.set(waId, nome)
      }
      for (const m of Array.isArray(v.messages) ? v.messages : []) {
        const wamid = txt(obj(m).id)
        const from = txt(obj(m).from)
        if (!wamid || !from || obj(m).type === "reaction") continue
        const { corpo, midia } = extrair(obj(m))
        const ts = Number(obj(m).timestamp)
        const ref = obj(obj(m).referral)
        eventos.push({
          tipo: "mensagem",
          phoneNumberId,
          wamid,
          telefone: from.replace(/\D/g, ""),
          nome: nomes.get(from) ?? null,
          corpo,
          em: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : new Date().toISOString(),
          midia,
          anuncio: txt(ref.source_url) || txt(ref.headline) ? { titulo: txt(ref.headline) } : null,
        })
      }
      for (const s of Array.isArray(v.statuses) ? v.statuses : []) {
        const wamid = txt(obj(s).id)
        const status = txt(obj(s).status)
        if (!wamid || !status || !["sent", "delivered", "read", "failed"].includes(status)) continue
        const err = Array.isArray(obj(s).errors) ? obj(obj(s).errors[0]) : {}
        eventos.push({
          tipo: "status",
          phoneNumberId,
          wamid,
          status: status as EventoStatus["status"],
          telefone: txt(obj(s).recipient_id),
          erro: status === "failed" ? [err.code, txt(err.title) ?? txt(obj(err.error_data).details)].filter(Boolean).join(" · ") || "falha no envio" : null,
        })
      }
    }
  }
  return eventos
}
