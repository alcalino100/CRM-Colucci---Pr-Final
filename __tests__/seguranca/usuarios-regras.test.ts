import { describe, expect, it } from "vitest"
import { rolesAtribuiveis, validarAlteracao, validarCriacao } from "@/lib/auth/usuarios-regras"

const master = { id: "m", role: "gestor_master" as const }
const gestor = { id: "g", role: "gestor" as const }
const gestorLoc = { id: "gl", role: "gestor_locacao" as const }
const corretor = { id: "c", role: "corretor" as const }
const visitante = { id: "v", role: "visitante" as const }

describe("rolesAtribuiveis (espelha a tela de Gestão de Acessos)", () => {
  it("master atribui tudo menos visitante", () => {
    const r = rolesAtribuiveis("gestor_master")
    expect(r).toContain("gestor_master")
    expect(r).toContain("corretor_vendas")
    expect(r).not.toContain("visitante")
  })
  it("gestor comum não atribui gestor_master", () => expect(rolesAtribuiveis("gestor")).not.toContain("gestor_master"))
  it("gestor de locação só atribui perfis de locação", () => {
    expect(rolesAtribuiveis("gestor_locacao").sort()).toEqual(["corretor_locacao", "gestor_locacao"])
  })
})

describe("criar usuário", () => {
  it("gestor cria corretor", () => expect(validarCriacao("gestor", "corretor")).toBeNull())
  it("gestor NÃO cria gestor_master", () => expect(validarCriacao("gestor", "gestor_master")).toMatch(/Apenas o Gestor Master/))
  it("master cria gestor_master", () => expect(validarCriacao("gestor_master", "gestor_master")).toBeNull())
  it("corretor e visitante não criam ninguém", () => {
    expect(validarCriacao("corretor", "corretor")).toMatch(/restrito/)
    expect(validarCriacao("visitante", "corretor")).toMatch(/restrito/)
  })
  it("gestor de locação não cria perfil de vendas", () => expect(validarCriacao("gestor_locacao", "corretor_vendas")).toMatch(/não pode atribuir/))
})

describe("alterar usuário: escalada de privilégio", () => {
  it("gestor comum NÃO redefine a senha do master (era o caminho para tomar a conta)", () => {
    expect(validarAlteracao(gestor, { id: "m", role: "gestor_master" }, { senha: "novasenha" })).toMatch(/Apenas o Gestor Master/)
  })
  it("gestor comum não muda e-mail, nome, status nem perfil do master", () => {
    for (const patch of [{ email: "x@y.com" }, { nome: "X" }, { ativo: false }, { role: "corretor" as const }]) {
      expect(validarAlteracao(gestor, { id: "m", role: "gestor_master" }, patch)).not.toBeNull()
    }
  })
  it("gestor comum não promove ninguém a master", () => {
    expect(validarAlteracao(gestor, { id: "c", role: "corretor" }, { role: "gestor_master" })).toMatch(/não pode atribuir/)
  })
  it("corretor não altera ninguém além da própria foto", () => {
    expect(validarAlteracao(corretor, { id: "g", role: "gestor" }, { role: "gestor_master" })).toMatch(/restrito/)
    expect(validarAlteracao(corretor, { id: "g", role: "gestor" }, { senha: "abcdef" })).toMatch(/restrito/)
    expect(validarAlteracao(corretor, { id: "c", role: "corretor" }, { role: "gestor_master" })).toMatch(/restrito|próprio perfil/)
    expect(validarAlteracao(corretor, { id: "c", role: "corretor" }, { senha: "abcdef" })).toMatch(/restrito/)
  })
  it("qualquer usuário (menos visitante) troca a PRÓPRIA foto", () => {
    expect(validarAlteracao(corretor, { id: "c", role: "corretor" }, { avatar: "data:..." })).toBeNull()
    expect(validarAlteracao(gestor, { id: "g", role: "gestor" }, { avatar: "x" })).toBeNull()
    expect(validarAlteracao(visitante, { id: "v", role: "visitante" }, { avatar: "x" })).toMatch(/somente leitura/)
  })
  it("não troca a foto de outra pessoa se não for gestor", () => {
    expect(validarAlteracao(corretor, { id: "outro", role: "corretor" }, { avatar: "x" })).toMatch(/restrito/)
  })
  it("ninguém muda o próprio perfil nem se desativa (evita trancar o sistema)", () => {
    expect(validarAlteracao(master, { id: "m", role: "gestor_master" }, { role: "corretor" })).toMatch(/próprio perfil/)
    expect(validarAlteracao(gestor, { id: "g", role: "gestor" }, { ativo: false })).toMatch(/própria conta/)
  })
  it("gestor altera dados e senha de corretor; master altera outro master", () => {
    expect(validarAlteracao(gestor, { id: "c", role: "corretor" }, { nome: "N", email: "a@b.com", senha: "abcdef", ativo: false })).toBeNull()
    expect(validarAlteracao(master, { id: "m2", role: "gestor_master" }, { senha: "abcdef", ativo: false })).toBeNull()
  })
  it("gestor de locação não atribui perfil de vendas", () => {
    expect(validarAlteracao(gestorLoc, { id: "c", role: "corretor_locacao" }, { role: "corretor_vendas" })).toMatch(/não pode atribuir/)
  })
  it("patch vazio é recusado", () => expect(validarAlteracao(gestor, { id: "c", role: "corretor" }, {})).toMatch(/Nada para alterar/))
})
