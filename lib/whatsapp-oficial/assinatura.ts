import crypto from "crypto"

/** Confere o cabeçalho X-Hub-Signature-256 da Meta (HMAC-SHA256 do corpo bruto com o App Secret). */
export function assinaturaValida(corpoBruto: string, cabecalho: string | null | undefined, appSecret: string): boolean {
  if (!appSecret || !cabecalho?.startsWith("sha256=")) return false
  const esperado = crypto.createHmac("sha256", appSecret).update(corpoBruto).digest("hex")
  const a = Buffer.from(cabecalho.slice(7))
  const b = Buffer.from(esperado)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
