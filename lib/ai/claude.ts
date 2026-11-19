/**
 * Cliente único da API da Anthropic (Claude) para todo o CRM.
 * Usado pela IA Conversacional (leads) e pelo Assistente Virtual (clientes).
 *
 * O que ele garante, e o código antigo (chamada inline em generateResponse.ts) não fazia:
 *  - timeout por tentativa (a Evolution/Vercel não ficam presas esperando a API);
 *  - retry com backoff e respeito ao `retry-after` em 429 / 5xx / 529 (overloaded);
 *  - cache de prompt no system (cortes de custo/latência em conversas longas);
 *  - loop de ferramentas com teto de rodadas e fechamento forçado em texto
 *    (nunca devolve resposta vazia só porque o modelo "empolgou" nas tools);
 *  - contagem de tokens completa (entrada, saída, cache);
 *  - fallback entre modelos só quando faz sentido (modelo inválido ou indisponível).
 */

export const CLAUDE_MODELO_PADRAO = "claude-sonnet-5-5"
export const CLAUDE_MODELO_RAPIDO = "claude-haiku-5-5"
/** Ordem de fallback quando o modelo configurado falha. Aceita também IDs antigos configurados à mão. */
export const CLAUDE_MODELOS_FALLBACK = [CLAUDE_MODELO_PADRAO, CLAUDE_MODELO_RAPIDO]

const ENDPOINT = "https://api.anthropic.com/v1/messages"
const STATUS_RETENTAVEL = new Set([408, 409, 429, 500, 502, 503, 504, 529])

export type ClaudeTool = { name: string; description: string; input_schema: Record<string, unknown> }
export type ClaudeMsg = { role: "user" | "assistant"; content: unknown }

export class ClaudeError extends Error {
  readonly status?: number
  readonly tipo?: string
  readonly retentavel: boolean
  readonly modeloInvalido: boolean
  constructor(mensagem: string, opts: { status?: number; tipo?: string; retentavel?: boolean; modeloInvalido?: boolean } = {}) {
    super(mensagem)
    this.name = "ClaudeError"
    this.status = opts.status
    this.tipo = opts.tipo
    this.retentavel = opts.retentavel ?? false
    this.modeloInvalido = opts.modeloInvalido ?? false
  }
}

export type ClaudeUso = { entrada: number; saida: number; cacheLeitura: number; cacheEscrita: number }

export type ClaudeParams = {
  apiKey: string
  model: string
  system: string
  messages: ClaudeMsg[]
  tools?: ClaudeTool[]
  /** Executa a ferramenta e devolve texto para o modelo. Erros viram texto de erro (o modelo se recupera). */
  onToolUse?: (name: string, input: Record<string, unknown>) => Promise<string>
  /** Força o modelo a chamar uma ferramenta específica (saída estruturada). */
  toolChoice?: { type: "tool"; name: string } | { type: "any" } | { type: "auto" } | { type: "none" }
  maxTokens?: number
  temperature?: number
  timeoutMs?: number
  maxRetries?: number
  maxRounds?: number
  cacheSystem?: boolean
  /** Injetáveis para teste. */
  fetchImpl?: typeof fetch
  sleepImpl?: (ms: number) => Promise<void>
}

export type ClaudeResultado = {
  texto: string
  modelo: string
  uso: ClaudeUso
  tokensTotal: number
  rodadas: number
  /** Chamadas de ferramenta feitas pelo modelo (úteis para saída estruturada com toolChoice). */
  chamadas: { name: string; input: Record<string, unknown> }[]
  parouPor: string
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function atrasoRetry(tentativa: number, retryAfter: string | null): number {
  const ra = retryAfter ? Number(retryAfter) : NaN
  if (Number.isFinite(ra) && ra >= 0) return Math.min(ra * 1000, 8000)
  const base = 400 * 2 ** tentativa
  return Math.min(base + Math.floor(Math.random() * 250), 8000)
}

async function uma(params: ClaudeParams, messages: ClaudeMsg[], tools: ClaudeTool[] | undefined, toolChoice: ClaudeParams["toolChoice"]) {
  const f = params.fetchImpl ?? fetch
  const dorme = params.sleepImpl ?? dormir
  const maxRetries = params.maxRetries ?? 2
  const body: Record<string, unknown> = {
    model: params.model,
    max_tokens: params.maxTokens ?? 500,
    system: params.cacheSystem === false ? params.system : [{ type: "text", text: params.system, cache_control: { type: "ephemeral" } }],
    messages,
  }
  if (params.temperature !== undefined) body.temperature = params.temperature
  if (tools?.length) body.tools = tools
  if (toolChoice && tools?.length) body.tool_choice = toolChoice

  let ultimo: ClaudeError | null = null
  for (let tentativa = 0; tentativa <= maxRetries; tentativa++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), params.timeoutMs ?? 25_000)
    try {
      const r = await f(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": params.apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
      const j = (await r.json().catch(() => ({}))) as any
      if (r.ok) return j
      const tipo: string | undefined = j?.error?.type
      const msg: string = j?.error?.message || `Claude HTTP ${r.status}`
      const modeloInvalido = r.status === 404 || tipo === "not_found_error" || (r.status === 400 && /model/i.test(msg))
      ultimo = new ClaudeError(msg, { status: r.status, tipo, retentavel: STATUS_RETENTAVEL.has(r.status), modeloInvalido })
      if (!ultimo.retentavel || tentativa === maxRetries) throw ultimo
      await dorme(atrasoRetry(tentativa, r.headers?.get?.("retry-after") ?? null))
    } catch (e) {
      if (e instanceof ClaudeError) {
        if (!e.retentavel || tentativa === maxRetries) throw e
        ultimo = e
        continue
      }
      const abort = (e as Error)?.name === "AbortError"
      ultimo = new ClaudeError(abort ? "Claude demorou demais para responder" : `Falha de rede com Claude: ${(e as Error)?.message ?? e}`, { retentavel: true })
      if (tentativa === maxRetries) throw ultimo
      await dorme(atrasoRetry(tentativa, null))
    } finally {
      clearTimeout(timer)
    }
  }
  throw ultimo ?? new ClaudeError("Claude falhou")
}

function somar(a: ClaudeUso, j: any): ClaudeUso {
  const u = j?.usage ?? {}
  return {
    entrada: a.entrada + (u.input_tokens ?? 0),
    saida: a.saida + (u.output_tokens ?? 0),
    cacheLeitura: a.cacheLeitura + (u.cache_read_input_tokens ?? 0),
    cacheEscrita: a.cacheEscrita + (u.cache_creation_input_tokens ?? 0),
  }
}

type Bloco = { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }
const textoDe = (blocos: Bloco[]) => blocos.filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim()

/** Uma conversa completa com um modelo (com loop de ferramentas). */
export async function chamarClaude(params: ClaudeParams): Promise<ClaudeResultado> {
  const msgs: ClaudeMsg[] = [...params.messages]
  const maxRodadas = params.maxRounds ?? 4
  let uso: ClaudeUso = { entrada: 0, saida: 0, cacheLeitura: 0, cacheEscrita: 0 }
  const chamadas: ClaudeResultado["chamadas"] = []

  for (let rodada = 1; rodada <= maxRodadas; rodada++) {
    const j = await uma(params, msgs, params.tools, params.toolChoice)
    uso = somar(uso, j)
    const blocos = (j.content ?? []) as Bloco[]
    const usos = blocos.filter((b) => b.type === "tool_use")
    for (const u of usos) chamadas.push({ name: u.name ?? "", input: u.input ?? {} })
    const fim = (texto: string, parouPor: string): ClaudeResultado => ({
      texto, modelo: params.model, uso, tokensTotal: uso.entrada + uso.saida, rodadas: rodada, chamadas, parouPor,
    })
    // Sem executor de ferramentas (ex.: saída estruturada) ou sem tool_use: terminou.
    if (!usos.length || !params.onToolUse) return fim(textoDe(blocos), String(j.stop_reason ?? "end_turn"))

    const resultados: { type: "tool_result"; tool_use_id: string; content: string }[] = []
    for (const u of usos) {
      let saida: string
      try {
        saida = await params.onToolUse(u.name ?? "", u.input ?? {})
      } catch (e) {
        saida = `Erro na ferramenta ${u.name}: ${e instanceof Error ? e.message : String(e)}`
      }
      resultados.push({ type: "tool_result", tool_use_id: u.id ?? "", content: String(saida).slice(0, 2000) })
    }
    msgs.push({ role: "assistant", content: blocos }, { role: "user", content: resultados })
  }

  // Estourou as rodadas: fecha pedindo texto final, sem mais ferramentas (nunca devolve vazio).
  const j = await uma(params, msgs, params.tools, { type: "none" })
  uso = somar(uso, j)
  return { texto: textoDe((j.content ?? []) as Bloco[]), modelo: params.model, uso, tokensTotal: uso.entrada + uso.saida, rodadas: maxRodadas + 1, chamadas, parouPor: "max_rodadas" }
}

/** Tenta o modelo configurado e cai para os de reserva se ele for inválido ou estiver indisponível. */
export async function chamarClaudeComFallback(params: Omit<ClaudeParams, "model"> & { modelos: string[] }): Promise<ClaudeResultado> {
  const { modelos, ...resto } = params
  const lista = Array.from(new Set(modelos.filter(Boolean)))
  let ultimo: unknown = new ClaudeError("Nenhum modelo Claude configurado")
  for (const model of lista) {
    try {
      return await chamarClaude({ ...resto, model })
    } catch (e) {
      ultimo = e
      const trocar = e instanceof ClaudeError && (e.modeloInvalido || e.retentavel)
      if (!trocar) break
    }
  }
  throw ultimo
}
