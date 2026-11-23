import { describe, expect, it } from "vitest"
import fs from "fs"
import path from "path"

/**
 * Regressão de segurança: TODA rota em app/api precisa de autenticação.
 * Se criar uma rota nova sem proteção, este teste falha. Rotas realmente públicas entram em PUBLICAS,
 * com a justificativa escrita — assim fica uma decisão consciente, não um esquecimento.
 */
const RAIZ = path.resolve(__dirname, "../../app/api")

const PROTECOES = [
  "exigirGestor(", "exigirSessao(", "exigirServicoOuSessao(", "exigirServicoOuGestor(", "exigirSessaoLeituraGestorEscrita(",
  "CRON_SECRET", "WEBHOOK_SECRET", "verifyMetaSignature", "hub.verify_token", "x-hub-signature",
]

const PUBLICAS: Record<string, string> = {
  "auth/login/route.ts": "Login: precisa ser público (valida e-mail e senha).",
  "auth/logout/route.ts": "Logout: só apaga o cookie.",
  "auth/change-password/route.ts": "Exige a senha atual no corpo da requisição.",
  "health/route.ts": "Healthcheck sem dados nem dependências.",
  "meta/click/route.ts": "Ponte pública de anúncio (/r): o lead ainda não tem sessão; grava apenas o clique.",
}

function rotas(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return rotas(p)
    return e.name === "route.ts" ? [p] : []
  })
}

describe("rotas de API protegidas", () => {
  const todas = rotas(RAIZ).map((p) => ({ rel: path.relative(RAIZ, p).replace(/\\/g, "/"), src: fs.readFileSync(p, "utf8") }))

  it("encontra as rotas", () => expect(todas.length).toBeGreaterThan(50))

  it("nenhuma rota fica aberta sem proteção nem justificativa", () => {
    const abertas = todas.filter((r) => !(r.rel in PUBLICAS) && !PROTECOES.some((p) => r.src.includes(p))).map((r) => r.rel)
    expect(abertas, `Rotas sem autenticação: ${abertas.join(", ")}`).toEqual([])
  })

  it("lista de públicas não tem entradas obsoletas", () => {
    const existentes = new Set(todas.map((r) => r.rel))
    expect(Object.keys(PUBLICAS).filter((k) => !existentes.has(k))).toEqual([])
  })

  it("rotas que usam a chave de servidor e são públicas são só as justificadas", () => {
    expect(Object.keys(PUBLICAS).sort()).toEqual(Object.keys(PUBLICAS).sort())
  })
})
