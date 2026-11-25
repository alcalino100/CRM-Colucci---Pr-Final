import { GRAPH_URL, tokenCloud } from "./config"

type Resultado<T> = ({ ok: true } & T) | { ok: false; erro: string; status?: number }

async function graph(caminho: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; json: any }> {
  const res = await fetch(`${GRAPH_URL}${caminho}`, {
    ...init,
    headers: { Authorization: `Bearer ${tokenCloud()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  })
  const json = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, json }
}

const erroGraph = (j: any, status: number) => `${status} ${j?.error?.message ?? "erro na API da Meta"}${j?.error?.code ? ` (código ${j.error.code})` : ""}`

/** Envia texto livre (só permitido dentro da janela de 24h). Devolve o wamid. */
export async function enviarTextoOficial(phoneNumberId: string, para: string, texto: string): Promise<Resultado<{ wamid: string }>> {
  if (!tokenCloud()) return { ok: false, erro: "WHATSAPP_CLOUD_TOKEN não configurado no servidor." }
  try {
    const r = await graph(`/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: "POST",
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: para, type: "text", text: { body: texto, preview_url: true } }),
    })
    const wamid = r.json?.messages?.[0]?.id
    if (!r.ok || !wamid) return { ok: false, erro: erroGraph(r.json, r.status), status: r.status }
    return { ok: true, wamid }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "falha de rede" }
  }
}

/** Marca a mensagem como lida (tique azul para o cliente). Best-effort. */
export async function marcarComoLida(phoneNumberId: string, wamid: string): Promise<void> {
  if (!tokenCloud()) return
  await graph(`/${encodeURIComponent(phoneNumberId)}/messages`, { method: "POST", body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: wamid }) }).catch(() => {})
}

/** Baixa uma mídia recebida (2 passos: URL temporária + download autenticado). */
export async function baixarMidiaOficial(mediaId: string): Promise<{ buffer: Buffer; mimeType: string | null } | null> {
  if (!tokenCloud()) return null
  try {
    const meta = await graph(`/${encodeURIComponent(mediaId)}`)
    const url: string | undefined = meta.json?.url
    if (!meta.ok || !url) return null
    const arq = await fetch(url, { headers: { Authorization: `Bearer ${tokenCloud()}` } })
    if (!arq.ok) return null
    return { buffer: Buffer.from(await arq.arrayBuffer()), mimeType: meta.json?.mime_type ?? arq.headers.get("content-type") }
  } catch {
    return null
  }
}

/** Consulta o número no Graph (valida token e traz nome verificado/qualidade). */
export async function consultarNumero(phoneNumberId: string): Promise<Resultado<{ numero: string | null; nomeVerificado: string | null; qualidade: string | null }>> {
  if (!tokenCloud()) return { ok: false, erro: "WHATSAPP_CLOUD_TOKEN não configurado no servidor." }
  try {
    const r = await graph(`/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name,quality_rating`)
    if (!r.ok) return { ok: false, erro: erroGraph(r.json, r.status), status: r.status }
    return { ok: true, numero: r.json?.display_phone_number ?? null, nomeVerificado: r.json?.verified_name ?? null, qualidade: r.json?.quality_rating ?? null }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "falha de rede" }
  }
}
