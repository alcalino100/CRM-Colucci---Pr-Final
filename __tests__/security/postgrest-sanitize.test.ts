import { describe, it, expect } from "vitest"
import { sanitizePostgrestFilter } from "@/lib/supabase/postgrest"

describe("sanitizePostgrestFilter - Proteção contra PostgREST Filter Injection", () => {
  it("deve manter termos alfanuméricos normais", () => {
    expect(sanitizePostgrestFilter("Guilherme")).toBe("Guilherme")
    expect(sanitizePostgrestFilter("18996917711")).toBe("18996917711")
    expect(sanitizePostgrestFilter("Apartamento 101")).toBe("Apartamento 101")
  })

  it("deve remover delimitadores sintáticos do PostgREST que quebram or() e filtros", () => {
    // Vírgula que dividiria filtros PostgREST
    expect(sanitizePostgrestFilter("teste,status.eq.fechado")).toBe("testestatus.eq.fechado")
    // Parênteses que alterariam agrupamento
    expect(sanitizePostgrestFilter("lead(id.eq.1)")).toBe("leadid.eq.1")
    // Dois-pontos que delimitam operadores PostgREST
    expect(sanitizePostgrestFilter("nome:ilike:teste")).toBe("nomeiliketeste")
    // Colchetes e aspas
    expect(sanitizePostgrestFilter(`["admin", 'root']`)).toBe("admin root")
  })

  it("deve escapar wildcards % e _ para busca literal segura", () => {
    expect(sanitizePostgrestFilter("100%")).toBe("100\\%")
    expect(sanitizePostgrestFilter("lead_teste")).toBe("lead\\_teste")
  })

  it("deve remover caracteres de controle nulos e não imprimíveis", () => {
    expect(sanitizePostgrestFilter("teste\u0000injetado\u001F")).toBe("testeinjetado")
  })

  it("deve lidar com valores não-string de forma segura", () => {
    expect(sanitizePostgrestFilter(null)).toBe("")
    expect(sanitizePostgrestFilter(undefined)).toBe("")
    expect(sanitizePostgrestFilter(12345)).toBe("")
  })
})
