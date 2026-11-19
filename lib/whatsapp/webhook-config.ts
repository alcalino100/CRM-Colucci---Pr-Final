// Configuração do webhook da Evolution por instância.
//
// Por que existe: o webhook só era configurado quando o corretor clicava em "Conectar" (QR Code),
// e usava o domínio de ONDE o clique aconteceu (preview, domínio antigo...). Se a Evolution reiniciou,
// perdeu a configuração ou ela apontava para um domínio errado, a instância continuava "conectada"
// mas NENHUMA mensagem chegava ao CRM (leads de anúncio perdidos em silêncio).
// Aqui o webhook passa a ter um endereço canônico e é verificado/reparado automaticamente.

import { evolutionConfig } from "@/lib/whatsapp/server"

export const EVENTOS_WEBHOOK = ["MESSAGES_UPSERT", "CONNECTION_UPDATE"] as const
const ORIGEM_PADRAO = "https://crm-colucci-pre-final.vercel.app"

export interface WebhookAtual {
  url: string | null
  enabled: boolean | null
  events: string[]
}

export interface DiagnosticoWebhook {
  ok: boolean
  motivos: string[]
}

/** Origem (domínio) de produção do CRM, sem barra final. */
export function origemCanonica(env: NodeJS.ProcessEnv = process.env): string {
  const bruta =
    env.NEXT_PUBLIC_APP_URL?.trim() ||
    (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL.trim()}` : "") ||
    ORIGEM_PADRAO
  return bruta.replace(/\/+$/, "")
}

/** URL completa que a Evolution deve chamar (inclui o segredo, quando configurado). */
export function urlWebhookCanonica(env: NodeJS.ProcessEnv = process.env): string {
  const segredo = env.WHATSAPP_WEBHOOK_SECRET
  return `${origemCanonica(env)}/api/whatsapp/webhook${segredo ? `?secret=${encodeURIComponent(segredo)}` : ""}`
}

/** Extrai url/enabled/events de formatos variados de resposta da Evolution (v1/v2). */
export function normalizarWebhook(payload: unknown): WebhookAtual {
  const p = (payload ?? {}) as Record<string, any>
  const w = (p.webhook ?? p) as Record<string, any>
  const eventos = w.events ?? w.webhookEvents ?? []
  return {
    url: typeof w.url === "string" ? w.url : typeof w.webhookUrl === "string" ? w.webhookUrl : null,
    enabled: typeof w.enabled === "boolean" ? w.enabled : null,
    events: Array.isArray(eventos) ? eventos.map((e: unknown) => String(e).toUpperCase()) : [],
  }
}

/** Compara origem+caminho; o segredo (?secret=) só é comparado se a Evolution devolver a query. */
export function mesmaUrl(atual: string, esperada: string): boolean {
  try {
    const a = new URL(atual)
    const e = new URL(esperada)
    if (a.origin !== e.origin || a.pathname.replace(/\/+$/, "") !== e.pathname.replace(/\/+$/, "")) return false
    const sa = a.searchParams.get("secret")
    const se = e.searchParams.get("secret")
    if (sa !== null && sa !== se) return false
    if (sa === null && se !== null && a.search) return false
    return true
  } catch {
    return atual === esperada
  }
}

/** Compara a configuração atual com a esperada. Pura e testável. */
export function diagnosticarWebhook(atual: WebhookAtual | null, urlEsperada: string): DiagnosticoWebhook {
  if (!atual || !atual.url) return { ok: false, motivos: ["sem webhook configurado"] }
  const motivos: string[] = []
  if (!mesmaUrl(atual.url, urlEsperada)) motivos.push("url diferente da canônica")
  if (atual.enabled === false) motivos.push("webhook desabilitado")
  if (!atual.events.includes("MESSAGES_UPSERT")) motivos.push("evento MESSAGES_UPSERT ausente")
  return { ok: motivos.length === 0, motivos }
}

async function fetchComTimeout(url: string, init: RequestInit, ms = 8000): Promise<Response> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ac.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function lerWebhook(instanceName: string): Promise<WebhookAtual | null> {
  const cfg = evolutionConfig()
  if (!cfg.ok) return null
  try {
    const res = await fetchComTimeout(`${cfg.url}/webhook/find/${encodeURIComponent(instanceName)}`, { headers: { apikey: cfg.key } })
    if (!res.ok) return null
    return normalizarWebhook(await res.json().catch(() => null))
  } catch {
    return null
  }
}

/** Grava o webhook canônico na instância. Retorna null se deu certo, ou o motivo da falha. */
export async function definirWebhook(instanceName: string, urlWebhook = urlWebhookCanonica()): Promise<string | null> {
  const cfg = evolutionConfig()
  if (!cfg.ok) return "Evolution não configurada"
  try {
    const res = await fetchComTimeout(`${cfg.url}/webhook/set/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.key },
      body: JSON.stringify({
        webhook: {
          url: urlWebhook,
          enabled: true,
          events: [...EVENTOS_WEBHOOK],
          webhook_by_events: false,
          webhook_base64: false,
        },
      }),
    })
    if (!res.ok) return `webhook: ${res.status} ${(await res.text().catch(() => "")).slice(0, 160)}`
    return null
  } catch (err) {
    return `webhook: ${(err as any)?.cause?.code || (err as any)?.name || "UNKNOWN"}`
  }
}

export interface ResultadoGarantirWebhook {
  instanceName: string
  /** "ok" já estava certo · "reparado" estava errado e foi corrigido · "falhou" não foi possível corrigir · "indeterminado" Evolution não respondeu */
  situacao: "ok" | "reparado" | "falhou" | "indeterminado"
  motivos: string[]
  erro?: string
}

/** Verifica o webhook da instância e conserta se estiver errado/ausente. */
export async function garantirWebhook(instanceName: string): Promise<ResultadoGarantirWebhook> {
  const esperada = urlWebhookCanonica()
  const atual = await lerWebhook(instanceName)
  // A Evolution não respondeu: não mexe (evita sobrescrever às cegas).
  if (atual === null) return { instanceName, situacao: "indeterminado", motivos: ["não foi possível ler o webhook"] }
  const diag = diagnosticarWebhook(atual, esperada)
  if (diag.ok) return { instanceName, situacao: "ok", motivos: [] }
  const erro = await definirWebhook(instanceName, esperada)
  if (erro) return { instanceName, situacao: "falhou", motivos: diag.motivos, erro }
  return { instanceName, situacao: "reparado", motivos: diag.motivos }
}

/** Reinicia a sessão da instância na Evolution (resolve sessão "aberta" porém travada). */
export async function reiniciarInstancia(instanceName: string): Promise<boolean> {
  const cfg = evolutionConfig()
  if (!cfg.ok) return false
  try {
    const res = await fetchComTimeout(`${cfg.url}/instance/restart/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      headers: { apikey: cfg.key },
    }, 10000)
    return res.ok
  } catch {
    return false
  }
}
