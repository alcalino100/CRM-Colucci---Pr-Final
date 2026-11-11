import { NextResponse } from "next/server"

/**
 * Resposta de sucesso padronizada para rotas de API.
 * Retorna { ok: true, ...data } com status HTTP padrão 200.
 */
export function ok<T extends Record<string, unknown>>(data?: T, status = 200, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, ...(data ?? {}) }, { status, ...init })
}

/**
 * Resposta de erro padronizada para rotas de API.
 * Retorna { ok: false, erro, details } com status HTTP padrão 400.
 */
export function fail(erro: string, status = 400, details: unknown = null, init?: ResponseInit): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      erro,
      ...(details !== null && details !== undefined ? { details } : {}),
    },
    { status, ...init }
  )
}
