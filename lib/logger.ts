/**
 * Logger estruturado compatível com LGPD (isomórfico: browser e servidor).
 *
 * Regras inegociáveis:
 * - Telefones e e-mails são automaticamente mascarados.
 * - Conteúdo de mensagens (corpo, texto, transcrição) NUNCA é logado; apenas id, tamanho e status.
 * - Tokens, senhas e segredos são redigidos automaticamente.
 * - Em produção (servidor): JSON estruturado em stdout/stderr.
 * - Em desenvolvimento / browser: formatação limpa e legível.
 */

export type LogLevel = "debug" | "info" | "warn" | "error"

export interface LogContext {
  [key: string]: unknown
}

const SENSITIVE_KEY_REGEX = /^(password|senha|secret|token|apikey|api_key|authorization|bearer|cookie)$/i
const MESSAGE_BODY_KEY_REGEX = /^(body|mensagem|message|content|texto|caption|transcricao|payload)$/i

/**
 * Mascara telefone preservando código de área e final para auditoria sem expor o titular.
 * Ex: "5518996917711" -> "55189****7711"
 * Ex: "(18) 99691-7711" -> "(18) 99***-7711"
 */
export function maskPhone(phone: unknown): string {
  if (typeof phone !== "string") return "[INVALID_PHONE]"
  const trimmed = phone.trim()
  if (!trimmed) return ""
  const digits = trimmed.replace(/\D/g, "")
  if (digits.length < 8) return "***"
  if (digits.length <= 11) {
    const ddd = digits.slice(0, 2)
    const init = digits.slice(2, 4)
    const end = digits.slice(-4)
    return `(${ddd}) ${init}***-${end}`
  }
  // Formato internacional: DDI + DDD + ... + final
  const ddi = digits.slice(0, 2)
  const ddd = digits.slice(2, 4)
  const end = digits.slice(-4)
  return `+${ddi} (${ddd}) ****-${end}`
}

/**
 * Mascara e-mail no formato u***@d***.com
 */
export function maskEmail(email: unknown): string {
  if (typeof email !== "string") return "[INVALID_EMAIL]"
  const trimmed = email.trim()
  const atIndex = trimmed.indexOf("@")
  if (atIndex < 1) return "***@***"
  const user = trimmed.slice(0, atIndex)
  const domain = trimmed.slice(atIndex + 1)
  const dotIndex = domain.indexOf(".")
  const domName = dotIndex > 0 ? domain.slice(0, dotIndex) : domain
  const tld = dotIndex > 0 ? domain.slice(dotIndex) : ""

  const maskedUser = user.length > 2 ? `${user[0]}***${user[user.length - 1]}` : `${user[0]}***`
  const maskedDom = domName.length > 1 ? `${domName[0]}***` : `${domName}***`
  return `${maskedUser}@${maskedDom}${tld}`
}

/**
 * Sanitiza recursivamente objetos de contexto para compliance LGPD antes de emitir log.
 */
export function sanitizeLogData<T>(input: T, depth = 0): unknown {
  if (depth > 6) return "[MAX_DEPTH]"
  if (input === null || input === undefined) return input

  if (typeof input === "string") {
    // Detecta e mascara e-mails em strings
    let sanitized = input.replace(/([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, (m) => maskEmail(m))
    // Detecta e mascara telefones BR em strings (ex: (18) 99691-7711 ou 5518996917711)
    sanitized = sanitized.replace(/(?:\+?55\s?)?(?:\(?([0-9]{2})\)?\s?)?(?:9\s?[0-9]{4})[-.\s]?[0-9]{4}/g, (m) => maskPhone(m))
    return sanitized
  }

  if (typeof input === "number" || typeof input === "boolean") return input

  if (input instanceof Error) {
    return {
      name: input.name,
      message: sanitizeLogData(input.message, depth + 1),
      stack: process.env.NODE_ENV !== "production" ? input.stack : undefined,
    }
  }

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeLogData(item, depth + 1))
  }

  if (typeof input === "object") {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        result[key] = "[REDACTED_SECRET]"
        continue
      }
      if (MESSAGE_BODY_KEY_REGEX.test(key)) {
        if (typeof val === "string") {
          result[key] = `[PROTECTED_LGPD: ${val.length} chars]`
        } else if (val) {
          result[key] = "[PROTECTED_LGPD_PAYLOAD]"
        } else {
          result[key] = val
        }
        continue
      }
      if (/telefone|phone|celular|whatsapp/i.test(key) && typeof val === "string") {
        result[key] = maskPhone(val)
        continue
      }
      if (/email|e-mail/i.test(key) && typeof val === "string") {
        result[key] = maskEmail(val)
        continue
      }
      result[key] = sanitizeLogData(val, depth + 1)
    }
    return result
  }

  return String(input)
}

function emit(level: LogLevel, message: string, context?: LogContext) {
  const timestamp = new Date().toISOString()
  const sanitizedContext = context ? (sanitizeLogData(context) as LogContext) : undefined
  const isServer = typeof window === "undefined"
  const isProd = process.env.NODE_ENV === "production"

  if (isServer && isProd) {
    const payload = JSON.stringify({
      timestamp,
      level: level.toUpperCase(),
      message: sanitizeLogData(message),
      ...(sanitizedContext ? { context: sanitizedContext } : {}),
    })
    if (level === "error") {
      process.stderr.write(payload + "\n")
    } else {
      process.stdout.write(payload + "\n")
    }
    return
  }

  // Browser ou desenvolvimento: console nativo com prefixo limpo
  const prefix = `[${timestamp.slice(11, 19)}] [${level.toUpperCase()}]`
  const sanitizedMessage = typeof message === "string" ? sanitizeLogData(message) : message
  const args = sanitizedContext ? [prefix, sanitizedMessage, sanitizedContext] : [prefix, sanitizedMessage]

  switch (level) {
    case "error":
      // eslint-disable-next-line no-console
      console.error(...args)
      break
    case "warn":
      // eslint-disable-next-line no-console
      console.warn(...args)
      break
    case "debug":
      // eslint-disable-next-line no-console
      console.debug(...args)
      break
    case "info":
    default:
      // eslint-disable-next-line no-console
      console.info(...args)
      break
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit("debug", message, context),
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, context),
  error: (message: string, context?: LogContext) => emit("error", message, context),
}
