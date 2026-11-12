import { describe, it, expect, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { Dialog } from "@/components/ui/primitives"

describe("Acessibilidade do Diálogo (components/ui/primitives.tsx)", () => {
  it("renderiza atributos ARIA obrigatórios para leitores de tela", () => {
    const onClose = vi.fn()
    const html = renderToStaticMarkup(
      <Dialog open={true} onClose={onClose} title="Editar Lead">
        <div>Conteúdo de teste</div>
      </Dialog>
    )

    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-label="Editar Lead"')
    expect(html).toContain('tabindex="-1"')
    expect(html).toContain("Editar Lead")
    expect(html).toContain("Conteúdo de teste")
  })

  it("não renderiza nada quando open é false", () => {
    const onClose = vi.fn()
    const html = renderToStaticMarkup(
      <Dialog open={false} onClose={onClose} title="Diálogo Oculto">
        <div>Conteúdo Invisível</div>
      </Dialog>
    )

    expect(html).toBe("")
  })
})
