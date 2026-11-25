import { beforeEach, describe, expect, it, vi } from "vitest"

const updates: any[] = []
const deletes: string[] = []
const criar = vi.fn(async (..._a: unknown[]) => ({ ok: true as const, id: "1", status: "PENDING" }))
const consultar = vi.fn(async (..._a: unknown[]) => ({ ok: true as const, numero: "+55 18 3333-4444", nomeVerificado: "Colucci", qualidade: "GREEN" }))

vi.mock("@/lib/whatsapp/server", () => {
  const q: any = {
    select: () => q, eq: (_c: string, v: string) => { q._eq = v; return q }, order: () => q,
    maybeSingle: async () => ({ data: { waba_id: "WABA1", phone_number_id: "PN1" } }),
    update: (p: any) => { updates.push(p); return q },
    delete: () => ({ eq: async (_c: string, v: string) => { deletes.push(v); return { error: null } } }),
    then: (res: any) => res({ error: null }),
  }
  return { wsupabase: { from: () => q } }
})
vi.mock("@/lib/auth/sessao", () => ({ exigirGestor: () => ({ ok: true, sessao: { id: "u", role: "gestor", exp: 0 } }), negarAcesso: () => new Response("", { status: 401 }) }))
vi.mock("@/lib/whatsapp-oficial/client", () => ({ criarModelo: (...a: unknown[]) => criar(...a), excluirModelo: vi.fn(async () => ({ ok: true })), listarModelos: vi.fn(async () => ({ ok: true, modelos: [] })), consultarNumero: (...a: unknown[]) => consultar(...a) }))

import { PATCH, DELETE } from "@/app/api/whatsapp/oficial/canais/route"
import { POST as criarModelo } from "@/app/api/whatsapp/oficial/modelos/gerenciar/route"

const req = (metodo: string, corpo?: unknown, url = "http://x/api") => new Request(url, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo) })

describe("edição de números", () => {
  beforeEach(() => { updates.length = 0; deletes.length = 0; vi.clearAllMocks() })
  it("edita nome e WABA ID (só dígitos)", async () => {
    const r = await PATCH(req("PATCH", { id: "c1", nome: "  Novo nome ", wabaId: "WABA 123 456" }))
    expect((await r.json()).ok).toBe(true)
    expect(updates[0]).toMatchObject({ nome: "Novo nome", waba_id: "123456" })
  })
  it("recusa nome vazio", async () => {
    const r = await PATCH(req("PATCH", { id: "c1", nome: "   " }))
    expect(r.status).toBe(400)
    expect(updates).toHaveLength(0)
  })
  it("revalida na Meta e atualiza telefone, nome verificado e qualidade", async () => {
    await PATCH(req("PATCH", { id: "c1", revalidar: true }))
    expect(consultar).toHaveBeenCalledWith("PN1")
    expect(updates[0]).toMatchObject({ numero: "+55 18 3333-4444", nome_verificado: "Colucci", qualidade: "GREEN" })
  })
  it("modo IA exige o agente", async () => {
    const r = await PATCH(req("PATCH", { id: "c1", modo: "ia" }))
    expect(r.status).toBe(400)
  })
  it("remove o canal", async () => {
    const r = await DELETE(req("DELETE", undefined, "http://x/api?id=c1"))
    expect((await r.json()).ok).toBe(true)
    expect(deletes).toEqual(["c1"])
  })
})

describe("criação de modelos", () => {
  beforeEach(() => vi.clearAllMocks())
  const post = (b: unknown) => criarModelo(req("POST", { canalId: "c1", idioma: "pt_BR", categoria: "UTILITY", ...(b as object) }))
  it("recusa nome com maiúsculas/espaços", async () => {
    expect((await post({ nome: "Meu Modelo", corpo: "oi" })).status).toBe(400)
    expect(criar).not.toHaveBeenCalled()
  })
  it("exige exemplo para cada variável", async () => {
    expect((await post({ nome: "boleto", corpo: "Oi {{1}}, vence {{2}}", exemplos: ["Ana"] })).status).toBe(400)
    expect(criar).not.toHaveBeenCalled()
  })
  it("cria o modelo com exemplos e manda para aprovação", async () => {
    const r = await post({ nome: "boleto", corpo: "Oi {{1}}, vence {{2}}", exemplos: ["Ana", "10/12"] })
    expect((await r.json()).status).toBe("PENDING")
    expect(criar).toHaveBeenCalledWith("WABA1", expect.objectContaining({ nome: "boleto", categoria: "UTILITY", exemplos: ["Ana", "10/12"] }))
  })
})
