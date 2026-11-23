import { describe, expect, it } from "vitest"
import fs from "fs"
import path from "path"

/**
 * Trava de regressão da Fase 1: código de SERVIDOR nunca volta a criar cliente do Supabase com a chave PÚBLICA.
 * Só o cliente do navegador (lib/supabase/client.ts) pode. Se alguém copiar o padrão antigo, este teste falha.
 */
function arquivos(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next") continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) arquivos(p, acc)
    else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p)
  }
  return acc
}

describe("servidor usa a chave de servidor do Supabase", () => {
  const raiz = path.resolve(__dirname, "../..")
  const alvos = [...arquivos(path.join(raiz, "app")), ...arquivos(path.join(raiz, "lib"))]

  it("nenhum arquivo cria cliente com SUPABASE_KEY (pública), exceto o do navegador", () => {
    const ruins = alvos.filter((f) => !f.endsWith(path.join("lib", "supabase", "client.ts"))).filter((f) => /createClient(<[A-Za-z]+>)?\(\s*SUPABASE_URL,\s*SUPABASE_KEY\b/.test(fs.readFileSync(f, "utf8")))
    expect(ruins.map((f) => path.relative(raiz, f))).toEqual([])
  })

  it("o cliente do navegador continua usando a chave pública (nunca a secreta)", () => {
    const c = fs.readFileSync(path.join(raiz, "lib/supabase/client.ts"), "utf8")
    expect(c).toContain("SUPABASE_KEY")
    expect(c).not.toContain("SUPABASE_SECRET_KEY")
    expect(c).not.toContain("SUPABASE_SERVER_KEY")
  })

  it("a chave secreta só é lida em arquivos de servidor (nunca em componente 'use client')", () => {
    const vazando = alvos.filter((f) => {
      const s = fs.readFileSync(f, "utf8")
      return s.slice(0, 200).includes('"use client"') && /SUPABASE_SECRET_KEY|SUPABASE_SERVER_KEY|supabase\/server-key|supabase\/admin/.test(s)
    })
    expect(vazando.map((f) => path.relative(raiz, f))).toEqual([])
  })
})
