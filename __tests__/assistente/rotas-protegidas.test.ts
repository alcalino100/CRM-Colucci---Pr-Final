import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("@/lib/assistente/repositorio-supabase", () => ({
  repositorioSupabase: { listarAtendimentos: vi.fn().mockResolvedValue([]), calcularIndicadores: vi.fn(), obterConfig: vi.fn().mockResolvedValue({ ativo: false, instancias: [], numerosTeste: [], capacidades: {}, usarIa: false }), salvarConfig: vi.fn().mockResolvedValue({}) },
  tabelaAusente: () => false,
}))
vi.mock("@/lib/assistente/ia-claude", () => ({ resolverClaude: vi.fn().mockResolvedValue(null), criarChamadaIa: vi.fn(), criarAgenteDeps: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from: () => ({ select: () => ({ limit: async () => ({ data: [] }) }) }) }) }))

import { assinarSessao, COOKIE_SESSAO } from "@/lib/auth/sessao"
import { GET as atendimentos } from "@/app/api/assistente/atendimentos/route"
import { GET as indicadores } from "@/app/api/assistente/indicadores/route"
import { GET as configGet, PUT as configPut } from "@/app/api/assistente/config/route"
import { POST as simular } from "@/app/api/assistente/simular/route"
import { POST as diagnostico } from "@/app/api/assistente/diagnostico/route"

beforeEach(() => { process.env.CRON_SECRET = "segredo-de-teste-123"; process.env.SUPABASE_SECRET_KEY = "x" })

const url = "https://01-colucci-imoveis.vercel.app/api/assistente/x"
const sem = (method = "GET", body?: unknown) => new Request(url, { method, ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}) })
const com = (role: string, method = "GET", body?: unknown) =>
  new Request(url, { method, headers: { cookie: `${COOKIE_SESSAO}=${assinarSessao({ id: "u", role })}`, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })

describe("rotas /api/assistente exigem sessão de gestor", () => {
  it.each([
    ["atendimentos", () => atendimentos(sem())],
    ["indicadores", () => indicadores(sem())],
    ["config GET", () => configGet(sem())],
    ["config PUT (ligar o assistente / trocar números)", () => configPut(sem("PUT", { ativo: true }))],
    ["simular (gasta crédito do Claude)", () => simular(sem("POST", { texto: "oi", telefone: "5511999990001", estado: { etapa: "inicio", tentativasIdentidade: 0, naoEntendidas: 0 } }))],
    ["diagnostico", () => diagnostico(sem("POST"))],
  ])("%s sem login: 401", async (_n, chamar) => {
    const r = await chamar()
    expect(r.status).toBe(401)
  })

  it("corretor não acessa: 403", async () => {
    expect((await atendimentos(com("corretor"))).status).toBe(403)
    expect((await configPut(com("corretor", "PUT", { ativo: true }))).status).toBe(403)
  })

  it("gestor acessa", async () => {
    expect((await atendimentos(com("gestor"))).status).toBe(200)
    expect((await configGet(com("gestor_master"))).status).toBe(200)
  })

  it("visitante só lê", async () => {
    expect((await atendimentos(com("visitante"))).status).toBe(200)
    expect((await configPut(com("visitante", "PUT", { ativo: true }))).status).toBe(403)
  })
})
