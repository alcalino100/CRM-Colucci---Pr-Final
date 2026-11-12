import { describe, it, expect, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { KanbanColumns } from "@/components/kanban/KanbanColumns"
import { LeadCard } from "@/components/lead-card"
import type { Lead, LeadStatus } from "@/lib/mock-data"

vi.mock("@hello-pangea/dnd", () => ({
  DragDropContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Droppable: ({ children }: { children: (p: any, s: any) => React.ReactNode }) =>
    children({ innerRef: () => {}, droppableProps: {}, placeholder: null }, { isDraggingOver: false }),
  Draggable: ({ children }: { children: (p: any, s: any) => React.ReactNode }) =>
    children(
      { innerRef: () => {}, draggableProps: { style: {} }, dragHandleProps: {} },
      { isDragging: false }
    ),
}))

vi.mock("@/lib/leads-store", () => ({
  useLeads: () => ({
    userName: (id: string) => `Corretor ${id}`,
    users: [],
    updateLead: vi.fn(),
  }),
}))

vi.mock("@/lib/presence", () => ({
  usePresenca: () => ({ online: {} }),
}))

const mockLead: Lead = {
  id: "lead-1",
  nome: "Carlos Eduardo",
  telefone: "11999999999",
  email: "carlos@test.com",
  status: "novo",
  temperatura: "quente",
  origem: "Tráfego Pago",
  imovelRef: "REF-101",
  referencias: [],
  observacoes: "Observação de teste",
  interacoes: [],
  corretorId: "u1",
  criadoEm: "2026-11-01T10:00:00Z",
  atualizadoEm: "2026-11-01T10:00:00Z",
}

const mockLeads: Record<string, Lead[]> = {
  novo: [mockLead],
  em_atendimento: [
    {
      ...mockLead,
      id: "lead-2",
      nome: "Mariana Souza",
      status: "em_atendimento",
    },
  ],
}

describe("Kanban Mobile e LeadCard", () => {
  it("renders lead card and quick move button", () => {
    const html = renderToStaticMarkup(
      <LeadCard
        lead={mockLead}
        showCorretor={true}
        canManage={true}
        podeExcluir={true}
        isGestor={true}
        tagColorMap={{}}
        onMoveStatus={vi.fn()}
      />
    )

    expect(html).toContain("Carlos Eduardo")
    expect(html).toContain("Mover")
  })

  it("renders mobile stage tabs and column headers in KanbanColumns", () => {
    const html = renderToStaticMarkup(
      <KanbanColumns
        isGestor={true}
        showCorretor={true}
        byStatus={(status: LeadStatus) => mockLeads[status] || []}
        canManage={() => true}
        tagColorMap={{}}
        onDragEnd={vi.fn()}
        onOpen={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAssumir={vi.fn()}
        onEnviarMeta={vi.fn()}
        onArquivar={vi.fn()}
        onDesarquivar={vi.fn()}
        onMoveLead={vi.fn()}
      />
    )

    // Mobile tabs
    expect(html).toContain('role="tablist"')
    expect(html).toContain("Novo Lead")
    expect(html).toContain("Em Atendimento")

    // Carlos Eduardo in active column
    expect(html).toContain("Carlos Eduardo")
  })
})
