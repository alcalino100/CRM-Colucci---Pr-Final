import { describe, it, expect, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav"

const mockUseAuth = vi.fn()
const mockUsePathname = vi.fn()

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}))

describe("MobileBottomNav Component", () => {
  it("renders manager items (Kanban, Inbox, Cadastros, Follow-up, Mais) when role is gestor", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "1", nome: "Gestor Master", role: "gestor_master" },
    })
    mockUsePathname.mockReturnValue("/cadastros")

    const html = renderToStaticMarkup(<MobileBottomNav onOpenMenu={vi.fn()} />)

    expect(html).toContain("Kanban")
    expect(html).toContain("Inbox")
    expect(html).toContain("Cadastros")
    expect(html).toContain("Follow-up")
    expect(html).toContain("Mais")
  })

  it("renders broker items (Kanban, Agenda, Arquivados, Perfil, Mais) when role is corretor", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "2", nome: "Corretor Teste", role: "corretor" },
    })
    mockUsePathname.mockReturnValue("/painel-corretor")

    const html = renderToStaticMarkup(<MobileBottomNav onOpenMenu={vi.fn()} />)

    expect(html).toContain("Kanban")
    expect(html).toContain("Agenda")
    expect(html).toContain("Arquivados")
    expect(html).toContain("Perfil")
    expect(html).toContain("Mais")
  })
})
