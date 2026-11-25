import { GRAPH_URL, tokenCloud } from "./config"
import type { ModeloOficial } from "./modelo"

export { renderizarModelo, type ModeloOficial } from "./modelo"

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


/** Lista os modelos (templates) da conta WhatsApp Business. Só os APPROVED podem ser enviados. */
export async function listarModelos(wabaId: string): Promise<Resultado<{ modelos: ModeloOficial[] }>> {
  if (!tokenCloud()) return { ok: false, erro: "WHATSAPP_CLOUD_TOKEN não configurado no servidor." }
  try {
    const r = await graph(`/${encodeURIComponent(wabaId)}/message_templates?fields=name,status,language,category,components&limit=100`)
    if (!r.ok) return { ok: false, erro: erroGraph(r.json, r.status), status: r.status }
    const modelos: ModeloOficial[] = (r.json?.data ?? []).map((t: any) => {
      const corpo: string = (t.components ?? []).find((c: any) => c.type === "BODY")?.text ?? ""
      const vars = new Set<string>(); for (const m of corpo.matchAll(/\{\{(\d+)\}\}/g)) vars.add(m[1])
      return { nome: t.name, idioma: t.language, status: t.status, categoria: t.category ?? null, corpo, variaveis: vars.size }
    })
    return { ok: true, modelos }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "falha de rede" }
  }
}

/** Envia um modelo aprovado (único tipo permitido fora da janela de 24h). Variáveis = parâmetros do corpo, em ordem. */
export async function enviarModeloOficial(phoneNumberId: string, para: string, nome: string, idioma: string, variaveis: string[] = []): Promise<Resultado<{ wamid: string }>> {
  if (!tokenCloud()) return { ok: false, erro: "WHATSAPP_CLOUD_TOKEN não configurado no servidor." }
  try {
    const template: Record<string, unknown> = { name: nome, language: { code: idioma } }
    if (variaveis.length) template.components = [{ type: "body", parameters: variaveis.map((v) => ({ type: "text", text: v })) }]
    const r = await graph(`/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: "POST",
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: para, type: "template", template }),
    })
    const wamid = r.json?.messages?.[0]?.id
    if (!r.ok || !wamid) return { ok: false, erro: erroGraph(r.json, r.status), status: r.status }
    return { ok: true, wamid }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "falha de rede" }
  }
}

export type NovoModelo = { nome: string; idioma: string; categoria: "UTILITY" | "MARKETING" | "AUTHENTICATION"; corpo: string; exemplos: string[] }

/** Cria um modelo na conta (fica PENDING até a Meta aprovar). Cada variável {{n}} precisa de um exemplo. */
export async function criarModelo(wabaId: string, m: NovoModelo): Promise<Resultado<{ id: string; status: string }>> {
  if (!tokenCloud()) return { ok: false, erro: "WHATSAPP_CLOUD_TOKEN não configurado no servidor." }
  try {
    const body: Record<string, unknown> = { type: "BODY", text: m.corpo }
    if (m.exemplos.length) body.example = { body_text: [m.exemplos] }
    const r = await graph(`/${encodeURIComponent(wabaId)}/message_templates`, {
      method: "POST",
      body: JSON.stringify({ name: m.nome, language: m.idioma, category: m.categoria, components: [body] }),
    })
    if (!r.ok || !r.json?.id) return { ok: false, erro: erroGraph(r.json, r.status), status: r.status }
    return { ok: true, id: String(r.json.id), status: String(r.json.status ?? "PENDING") }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "falha de rede" }
  }
}

/** Exclui um modelo (todas as traduções com esse nome). */
export async function excluirModelo(wabaId: string, nome: string): Promise<Resultado<object>> {
  if (!tokenCloud()) return { ok: false, erro: "WHATSAPP_CLOUD_TOKEN não configurado no servidor." }
  try {
    const r = await graph(`/${encodeURIComponent(wabaId)}/message_templates?name=${encodeURIComponent(nome)}`, { method: "DELETE" })
    return r.ok ? { ok: true } : { ok: false, erro: erroGraph(r.json, r.status), status: r.status }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "falha de rede" }
  }
}
