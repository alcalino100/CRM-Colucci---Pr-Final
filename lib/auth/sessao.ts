import crypto from "crypto"
import { isGestorNivel } from "@/lib/roles"
import type { Role } from "@/lib/mock-data"

/**
 * Sessão assinada no servidor (cookie HttpOnly), emitida no login.
 * O CRM guarda a sessão do navegador em localStorage (só serve para a interface); rotas sensíveis precisam de uma
 * prova que o navegador não consegue forjar. Esta é essa prova: HMAC-SHA256 do usuário+perfil+validade.
 *
 * Segredo: SESSION_SECRET (se existir) ou CRON_SECRET (já configurado em produção). Nunca vai para o navegador.
 * Sem segredo configurado, as rotas protegidas FECHAM (503), nunca abrem.
 */
export const COOKIE_SESSAO = "colucci_sessao"
export const TTL_SESSAO_SEG = 12 * 3600

export type Sessao = { id: string; role: string; exp: number }

const segredo = () => process.env.SESSION_SECRET || process.env.CRON_SECRET || null
const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url")
const assinatura = (dados: string, chave: string) => crypto.createHmac("sha256", `${chave}|sessao-v1`).update(dados).digest("base64url")

export function assinarSessao(u: { id: string; role: string }, agoraMs = Date.now(), ttlSeg = TTL_SESSAO_SEG): string | null {
  const chave = segredo()
  if (!chave) return null
  const dados = b64(JSON.stringify({ id: u.id, role: u.role, exp: Math.floor(agoraMs / 1000) + ttlSeg } satisfies Sessao))
  return `${dados}.${assinatura(dados, chave)}`
}

export function lerSessao(token: string | null | undefined, agoraMs = Date.now()): Sessao | null {
  const chave = segredo()
  if (!chave || !token) return null
  const [dados, sig] = token.split(".")
  if (!dados || !sig) return null
  const esperado = assinatura(dados, chave)
  const a = Buffer.from(sig)
  const b = Buffer.from(esperado)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const s = JSON.parse(Buffer.from(dados, "base64url").toString("utf8")) as Sessao
    if (typeof s?.id !== "string" || typeof s?.role !== "string" || typeof s?.exp !== "number") return null
    return s.exp * 1000 > agoraMs ? s : null
  } catch {
    return null
  }
}

export function cookieDaSessao(token: string, producao = process.env.NODE_ENV === "production"): string {
  return `${COOKIE_SESSAO}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_SESSAO_SEG}${producao ? "; Secure" : ""}`
}

export function cookieLimpo(producao = process.env.NODE_ENV === "production"): string {
  return `${COOKIE_SESSAO}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${producao ? "; Secure" : ""}`
}

export function lerCookie(header: string | null | undefined, nome = COOKIE_SESSAO): string | undefined {
  for (const parte of (header ?? "").split(";")) {
    const i = parte.indexOf("=")
    if (i > 0 && parte.slice(0, i).trim() === nome) return parte.slice(i + 1).trim()
  }
  return undefined
}

export type ResultadoAuth = { ok: true; sessao: Sessao } | { ok: false; status: 401 | 403 | 503; erro: string }

/** Exige sessão válida de GESTOR. Perfil "visitante" (somente leitura) só passa em GET. Mutação exige mesma origem. */
export function exigirGestor(req: Request, agoraMs = Date.now()): ResultadoAuth {
  if (!segredo()) return { ok: false, status: 503, erro: "Servidor sem segredo de sessão configurado (SESSION_SECRET ou CRON_SECRET)." }
  const sessao = lerSessao(lerCookie(req.headers.get("cookie")), agoraMs)
  if (!sessao) return { ok: false, status: 401, erro: "Sessão expirada ou ausente. Saia e entre novamente no CRM." }
  if (!isGestorNivel(sessao.role as Role)) return { ok: false, status: 403, erro: "Acesso restrito a gestores." }
  const leitura = req.method === "GET" || req.method === "HEAD"
  if (!leitura) {
    if (sessao.role === "visitante") return { ok: false, status: 403, erro: "Perfil somente leitura." }
    const origem = req.headers.get("origin")
    if (origem) {
      let host = ""
      try { host = new URL(origem).host } catch { /* origem inválida */ }
      if (host !== new URL(req.url).host) return { ok: false, status: 403, erro: "Origem não permitida." }
    }
  }
  return { ok: true, sessao }
}

/** Exige apenas uma sessão válida (qualquer perfil). Quem decide o que cada perfil pode fazer é a rota. Mutação exige mesma origem. */
export function exigirSessao(req: Request, agoraMs = Date.now()): { ok: true; sessao: Sessao } | { ok: false; status: 401 | 403 | 503; erro: string } {
  if (!segredo()) return { ok: false, status: 503, erro: "Servidor sem segredo de sessão configurado (SESSION_SECRET ou CRON_SECRET)." }
  const sessao = lerSessao(lerCookie(req.headers.get("cookie")), agoraMs)
  if (!sessao) return { ok: false, status: 401, erro: "Sessão expirada ou ausente. Saia e entre novamente no CRM." }
  if (req.method !== "GET" && req.method !== "HEAD") {
    if (sessao.role === "visitante") return { ok: false, status: 403, erro: "Perfil somente leitura." }
    const origem = req.headers.get("origin")
    if (origem) {
      let host = ""
      try { host = new URL(origem).host } catch { /* origem inválida */ }
      if (host !== new URL(req.url).host) return { ok: false, status: 403, erro: "Origem não permitida." }
    }
  }
  return { ok: true, sessao }
}

type Negado = { ok: false; status: 401 | 403 | 503; erro: string }

/** Chamada de serviço (Vercel Cron / integrações): Authorization: Bearer CRON_SECRET. */
export function temSegredoDeServico(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const enviado = req.headers.get("authorization") ?? ""
  const esperado = `Bearer ${secret}`
  const a = Buffer.from(enviado)
  const b = Buffer.from(esperado)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/** Serviço (cron/integração) OU sessão de qualquer perfil. */
export function exigirServicoOuSessao(req: Request): ResultadoAuth {
  if (temSegredoDeServico(req)) return { ok: true, sessao: { id: "servico", role: "servico", exp: 0 } }
  return exigirSessao(req)
}

/** Serviço (cron/integração) OU sessão de gestor. */
export function exigirServicoOuGestor(req: Request): ResultadoAuth {
  if (temSegredoDeServico(req)) return { ok: true, sessao: { id: "servico", role: "servico", exp: 0 } }
  return exigirGestor(req)
}

/** Leitura (GET/HEAD) para qualquer sessão; alterações só para gestor. */
export function exigirSessaoLeituraGestorEscrita(req: Request): ResultadoAuth {
  return req.method === "GET" || req.method === "HEAD" ? exigirSessao(req) : exigirGestor(req)
}

/** Resposta JSON padrão para uma autorização negada. */
export function negarAcesso(r: Negado): Response {
  return new Response(JSON.stringify({ ok: false, error: r.erro }), {
    status: r.status,
    headers: { "content-type": "application/json" },
  })
}
