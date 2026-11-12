import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import NotFound from "@/app/not-found"

describe("Página 404 (app/not-found.tsx)", () => {
  it("renderiza o cabeçalho 404 e mensagem amigável", () => {
    const html = renderToStaticMarkup(<NotFound />)
    expect(html).toContain("Erro 404")
    expect(html).toContain("Página não encontrada")
    expect(html).toContain("O endereço solicitado não existe")
  })

  it("oferece links de navegação para Kanban e Cadastros", () => {
    const html = renderToStaticMarkup(<NotFound />)
    expect(html).toContain('href="/kanban"')
    expect(html).toContain("Ir para o Kanban")
    expect(html).toContain('href="/cadastros"')
    expect(html).toContain("Cadastros")
    expect(html).toContain('href="/"')
  })
})
