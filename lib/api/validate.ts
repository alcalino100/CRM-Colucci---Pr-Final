import { type NextResponse } from "next/server"
import { z, type ZodType } from "zod"
import { fail } from "./response"

export type ValidationResult<T> =
  | { success: true; data: T; response?: never }
  | { success: false; data?: never; response: NextResponse }

/**
 * Valida o corpo JSON de uma requisição HTTP contra um schema Zod.
 * Em caso de falha de parsing ou validação, retorna response HTTP 400 pronto.
 */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<ValidationResult<T>> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return {
      success: false,
      response: fail("Corpo da requisição deve ser um JSON válido.", 400),
    }
  }

  const result = schema.safeParse(raw)
  if (!result.success) {
    const issue = result.error.issues[0]
    const path = issue?.path.length ? `[${issue.path.join(".")}] ` : ""
    const message = `${path}${issue?.message ?? "Dados inválidos."}`
    return {
      success: false,
      response: fail(message, 400, result.error.flatten()),
    }
  }

  return { success: true, data: result.data }
}

/**
 * Valida os parâmetros de busca (query parameters) de uma requisição contra um schema Zod.
 */
export function parseQuery<T>(reqOrUrl: Request | URL, schema: ZodType<T>): ValidationResult<T> {
  const url = reqOrUrl instanceof URL ? reqOrUrl : new URL(reqOrUrl.url)
  const raw: Record<string, string> = {}
  url.searchParams.forEach((val, key) => {
    raw[key] = val
  })

  const result = schema.safeParse(raw)
  if (!result.success) {
    const issue = result.error.issues[0]
    const path = issue?.path.length ? `[${issue.path.join(".")}] ` : ""
    const message = `${path}${issue?.message ?? "Parâmetros inválidos."}`
    return {
      success: false,
      response: fail(message, 400, result.error.flatten()),
    }
  }

  return { success: true, data: result.data }
}
