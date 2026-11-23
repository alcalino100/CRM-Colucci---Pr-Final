import { beforeEach, describe, expect, it, vi } from "vitest"
import bcrypt from "bcryptjs"

type Linha = { id: string; nome: string; email: string; role: string; status: string; senha_hash?: string; avatar?: string }
let tabela: Linha[] = []
const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

// Fake mínimo do cliente do Supabase para a tabela `usuarios`.
function from() {
  const filtros: ((l: Linha) => boolean)[] = []
  let op: "select" | "insert" | "update" = "select"
  let valor: any
  const achar = () => tabela.filter((l) => filtros.every((f) => f(l)))
  const q: any = {
    select: () => q,
    eq: (c: keyof Linha, v: unknown) => { filtros.push((l) => l[c] === v); return q },
    neq: (c: keyof Linha, v: unknown) => { filtros.push((l) => l[c] !== v); return q },
    maybeSingle: async () => ({ data: achar()[0] ?? null, error: null }),
    insert: (v: Linha) => { op = "insert"; valor = v; return q },
    update: (v: Partial<Linha>) => { op = "update"; valor = v; return q },
    single: async () => {
      if (op === "insert") { const n = { id: UUID(tabela.length + 100), ...valor }; tabela.push(n); return { data: n, error: null } }
      return { data: achar()[0] ?? null, error: null }
    },
    then: (res: (v: unknown) => unknown) => { if (op === "update") achar().forEach((l) => Object.assign(l, valor)); return Promise.resolve({ error: null }).then(res) },
  }
  return q
}
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({ from }) }))

import { assinarSessao, COOKIE_SESSAO } from "@/lib/auth/sessao"
import { POST as criar } from "@/app/api/usuarios/route"
import { PATCH as alterar } from "@/app/api/usuarios/[id]/route"

const IDS = { master: UUID(1), gestor: UUID(2), corretor: UUID(3), visitante: UUID(4) }
beforeEach(() => {
  process.env.CRON_SECRET = "segredo-de-teste-123"
  tabela = [
    { id: IDS.master, nome: "Master", email: "master@x.com", role: "gestor_master", status: "ativo", senha_hash: "HASH_MASTER" },
    { id: IDS.gestor, nome: "Gestor", email: "gestor@x.com", role: "gestor", status: "ativo", senha_hash: "HASH_G" },
    { id: IDS.corretor, nome: "Corretor", email: "corretor@x.com", role: "corretor", status: "ativo", senha_hash: "HASH_C" },
    { id: IDS.visitante, nome: "Visitante", email: "vis@x.com", role: "visitante", status: "ativo", senha_hash: "HASH_V" },
  ]
})

const como = (quem: keyof typeof IDS | null, method: string, url: string, corpo?: unknown) => {
  const role = quem ? ({ master: "gestor_master", gestor: "gestor", corretor: "corretor", visitante: "visitante" } as const)[quem] : null
  const cookie = quem ? `${COOKIE_SESSAO}=${assinarSessao({ id: IDS[quem], role: role! })}` : ""
  return new Request(`https://01-colucci-imoveis.vercel.app${url}`, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined })
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const novo = { nome: "Ana", email: "ANA@x.com ", senha: "senha123", role: "corretor", ativo: true }

describe("POST /api/usuarios", () => {
  it("sem sessão: 401", async () => expect((await criar(como(null, "POST", "/api/usuarios", novo))).status).toBe(401))
  it("corretor e visitante: 403", async () => {
    expect((await criar(como("corretor", "POST", "/api/usuarios", novo))).status).toBe(403)
    expect((await criar(como("visitante", "POST", "/api/usuarios", novo))).status).toBe(403)
  })
  it("gestor cria: e-mail normalizado, senha só como hash bcrypt, resposta sem hash", async () => {
    const r = await criar(como("gestor", "POST", "/api/usuarios", novo))
    expect(r.status).toBe(200)
    const corpo = await r.json()
    expect(corpo.usuario).toMatchObject({ nome: "Ana", email: "ana@x.com", role: "corretor", ativo: true })
    expect(JSON.stringify(corpo)).not.toMatch(/senha|hash|\$2[aby]\$/)
    const salvo = tabela.find((l) => l.email === "ana@x.com")!
    expect(salvo.senha_hash).toMatch(/^\$2[aby]\$/)
    expect(await bcrypt.compare("senha123", salvo.senha_hash!)).toBe(true)
  })
  it("gestor NÃO cria gestor_master: 403 e nada é gravado", async () => {
    const r = await criar(como("gestor", "POST", "/api/usuarios", { ...novo, role: "gestor_master" }))
    expect(r.status).toBe(403)
    expect(tabela.some((l) => l.email === "ana@x.com")).toBe(false)
  })
  it("master cria gestor_master", async () => expect((await criar(como("master", "POST", "/api/usuarios", { ...novo, role: "gestor_master" }))).status).toBe(200))
  it("e-mail repetido: 409; dados inválidos: 400", async () => {
    expect((await criar(como("gestor", "POST", "/api/usuarios", { ...novo, email: "corretor@x.com" }))).status).toBe(409)
    for (const ruim of [{ ...novo, senha: "123" }, { ...novo, email: "nao-e-email" }, { ...novo, role: "dono_do_mundo" }, { ...novo, nome: "" }]) {
      expect((await criar(como("gestor", "POST", "/api/usuarios", ruim))).status).toBe(400)
    }
  })
  it("origem diferente (CSRF): 403", async () => {
    const req = new Request("https://01-colucci-imoveis.vercel.app/api/usuarios", { method: "POST", headers: { "content-type": "application/json", origin: "https://site-malicioso.com", cookie: `${COOKIE_SESSAO}=${assinarSessao({ id: IDS.gestor, role: "gestor" })}` }, body: JSON.stringify(novo) })
    expect((await criar(req)).status).toBe(403)
  })
})

describe("PATCH /api/usuarios/[id]", () => {
  it("sem sessão: 401", async () => expect((await alterar(como(null, "PATCH", "/x", { nome: "Z" }), ctx(IDS.corretor))).status).toBe(401))

  it("ATAQUE: gestor tenta redefinir a senha do master: 403 e o hash do master não muda", async () => {
    const r = await alterar(como("gestor", "PATCH", "/x", { senha: "hackeado123" }), ctx(IDS.master))
    expect(r.status).toBe(403)
    expect(tabela.find((l) => l.id === IDS.master)!.senha_hash).toBe("HASH_MASTER")
  })
  it("ATAQUE: corretor tenta virar master: 403 e o perfil não muda", async () => {
    const r = await alterar(como("corretor", "PATCH", "/x", { role: "gestor_master" }), ctx(IDS.corretor))
    expect(r.status).toBe(403)
    expect(tabela.find((l) => l.id === IDS.corretor)!.role).toBe("corretor")
  })
  it("ATAQUE: gestor promove corretor a master: 403", async () => {
    expect((await alterar(como("gestor", "PATCH", "/x", { role: "gestor_master" }), ctx(IDS.corretor))).status).toBe(403)
    expect(tabela.find((l) => l.id === IDS.corretor)!.role).toBe("corretor")
  })

  it("gestor altera dados e senha de corretor (senha vira hash, e em branco mantém a atual)", async () => {
    expect((await alterar(como("gestor", "PATCH", "/x", { nome: "Novo Nome", senha: "novasenha1" }), ctx(IDS.corretor))).status).toBe(200)
    const c = tabela.find((l) => l.id === IDS.corretor)!
    expect(c.nome).toBe("Novo Nome")
    expect(await bcrypt.compare("novasenha1", c.senha_hash!)).toBe(true)
    const antes = c.senha_hash
    expect((await alterar(como("gestor", "PATCH", "/x", { nome: "Outro" }), ctx(IDS.corretor))).status).toBe(200)
    expect(c.senha_hash).toBe(antes)
  })
  it("corretor troca a própria foto; não a de outro", async () => {
    expect((await alterar(como("corretor", "PATCH", "/x", { avatar: "data:image/png;base64,AAA" }), ctx(IDS.corretor))).status).toBe(200)
    expect(tabela.find((l) => l.id === IDS.corretor)!.avatar).toBe("data:image/png;base64,AAA")
    expect((await alterar(como("corretor", "PATCH", "/x", { avatar: "x" }), ctx(IDS.gestor))).status).toBe(403)
  })
  it("visitante não altera nem a própria foto", async () => expect((await alterar(como("visitante", "PATCH", "/x", { avatar: "x" }), ctx(IDS.visitante))).status).toBe(403))
  it("master altera outro usuário; id inexistente 404; id inválido 400; e-mail repetido 409", async () => {
    expect((await alterar(como("master", "PATCH", "/x", { role: "gestor" }), ctx(IDS.corretor))).status).toBe(200)
    expect((await alterar(como("master", "PATCH", "/x", { nome: "x" }), ctx(UUID(999)))).status).toBe(404)
    expect((await alterar(como("master", "PATCH", "/x", { nome: "x" }), ctx("nao-uuid"))).status).toBe(400)
    expect((await alterar(como("gestor", "PATCH", "/x", { email: "master@x.com" }), ctx(IDS.corretor))).status).toBe(409)
  })
  it("ninguém desativa a si mesmo nem muda o próprio perfil", async () => {
    expect((await alterar(como("gestor", "PATCH", "/x", { ativo: false }), ctx(IDS.gestor))).status).toBe(403)
    expect((await alterar(como("master", "PATCH", "/x", { role: "corretor" }), ctx(IDS.master))).status).toBe(403)
  })
})
