import { describe, it, expect, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import GlobalError from "@/app/error"

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

describe("ErrorBoundary Global (app/error.tsx)", () => {
  it("renderiza o estado de erro, título e ações de recuperação", () => {
    const error = new Error("Simulação de falha fatal") as Error & { digest?: string }
    error.digest = "INCIDENT-998877"
    const reset = vi.fn()

    const html = renderToStaticMarkup(<GlobalError error={error} reset={reset} />)

    expect(html).toContain("Instabilidade Detectada")
    expect(html).toContain("Algo deu errado")
    expect(html).toContain("INCIDENT-998877")
    expect(html).toContain("Tentar novamente")
    expect(html).toContain('href="/kanban"')
    expect(html).toContain("Recarregar aplicação")
  })

  it("renderiza sem digest quando digest não é fornecido", () => {
    const error = new Error("Erro comum")
    const reset = vi.fn()

    const html = renderToStaticMarkup(<GlobalError error={error} reset={reset} />)

    expect(html).toContain("Algo deu errado")
    expect(html).not.toContain("Código do incidente")
  })
})
