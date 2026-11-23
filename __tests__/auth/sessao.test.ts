import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { assinarSessao, cookieDaSessao, cookieLimpo, exigirGestor, lerCookie, lerSessao, COOKIE_SESSAO } from "@/lib/auth/sessao"

const antes = { s: process.env.SESSION_SECRET, c: process.env.CRON_SECRET }
beforeEach(() => { delete process.env.SESSION_SECRET; process.env.CRON_SECRET = "segredo-de-teste-123" })
afterEach(() => { process.env.SESSION_SECRET = antes.s; process.env.CRON_SECRET = antes.c; if (antes.s === undefined) delete process.env.SESSION_SECRET; if (antes.c === undefined) delete process.env.CRON_SECRET })

const req = (cookie: string | null, init: { method?: string; origin?: string } = {}) =>
  new Request("https://01-colucci-imoveis.vercel.app/api/assistente/config", { method: init.method ?? "GET", headers: { ...(cookie ? { cookie } : {}), ...(init.origin ? { origin: init.origin } : {}) } })
const com = (role: string, extra?: { method?: string; origin?: string }) => req(`${COOKIE_SESSAO}=${assinarSessao({ id: "u1", role })}`, extra)

describe("sessão assinada", () => {
  it("assina e lê de volta", () => {
    const t = assinarSessao({ id: "u1", role: "gestor" })!
    expect(lerSessao(t)).toMatchObject({ id: "u1", role: "gestor" })
  })
  it("rejeita token adulterado (perfil trocado para master)", () => {
    const t = assinarSessao({ id: "u1", role: "corretor" })!
    const [dados, sig] = t.split(".")
    const forjado = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(dados, "base64url").toString()), role: "gestor_master" })).toString("base64url")
    expect(lerSessao(`${forjado}.${sig}`)).toBeNull()
    expect(lerSessao(`${dados}.${sig}x`)).toBeNull()
    expect(lerSessao("lixo")).toBeNull()
    expect(lerSessao(undefined)).toBeNull()
  })
  it("expira", () => {
    const t = assinarSessao({ id: "u1", role: "gestor" }, 1_000_000, 60)!
    expect(lerSessao(t, 1_000_000 + 59_000)).not.toBeNull()
    expect(lerSessao(t, 1_000_000 + 61_000)).toBeNull()
  })
  it("token feito com outro segredo não vale", () => {
    const t = assinarSessao({ id: "u1", role: "gestor" })!
    process.env.CRON_SECRET = "outro-segredo"
    expect(lerSessao(t)).toBeNull()
  })
  it("SESSION_SECRET tem prioridade sobre CRON_SECRET", () => {
    const t = assinarSessao({ id: "u1", role: "gestor" })!
    process.env.SESSION_SECRET = "dedicado"
    expect(lerSessao(t)).toBeNull()
    expect(lerSessao(assinarSessao({ id: "u1", role: "gestor" }))).not.toBeNull()
  })
  it("sem segredo configurado: não assina e não valida (fecha)", () => {
    delete process.env.CRON_SECRET
    expect(assinarSessao({ id: "u1", role: "gestor" })).toBeNull()
    expect(exigirGestor(req(null))).toMatchObject({ ok: false, status: 503 })
  })
  it("cookies: HttpOnly, SameSite, Secure só em produção, limpar", () => {
    expect(cookieDaSessao("abc", true)).toMatch(/HttpOnly.*SameSite=Lax.*Secure/)
    expect(cookieDaSessao("abc", false)).not.toMatch(/Secure/)
    expect(cookieLimpo(true)).toMatch(/Max-Age=0/)
    expect(lerCookie("a=1; colucci_sessao=xyz; b=2")).toBe("xyz")
    expect(lerCookie("a=1")).toBeUndefined()
  })
})

describe("exigirGestor", () => {
  it("sem cookie: 401", () => expect(exigirGestor(req(null))).toMatchObject({ ok: false, status: 401 }))
  it("gestor passa em leitura e escrita", () => {
    expect(exigirGestor(com("gestor"))).toMatchObject({ ok: true })
    expect(exigirGestor(com("gestor_master", { method: "PUT" }))).toMatchObject({ ok: true })
  })
  it("corretor: 403", () => expect(exigirGestor(com("corretor"))).toMatchObject({ ok: false, status: 403 }))
  it("visitante lê mas não altera", () => {
    expect(exigirGestor(com("visitante"))).toMatchObject({ ok: true })
    expect(exigirGestor(com("visitante", { method: "PUT" }))).toMatchObject({ ok: false, status: 403 })
    expect(exigirGestor(com("visitante", { method: "POST" }))).toMatchObject({ ok: false, status: 403 })
  })
  it("alteração vinda de outra origem é barrada (CSRF); mesma origem passa", () => {
    expect(exigirGestor(com("gestor", { method: "PUT", origin: "https://site-malicioso.com" }))).toMatchObject({ ok: false, status: 403 })
    expect(exigirGestor(com("gestor", { method: "PUT", origin: "https://01-colucci-imoveis.vercel.app" }))).toMatchObject({ ok: true })
  })
})
