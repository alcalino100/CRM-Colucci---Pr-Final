import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ResponsiveTable, type ResponsiveColumn } from "@/components/ui/responsive-table"

interface TestItem {
  id: string
  nome: string
  status: string
  valor: number
}

const mockData: TestItem[] = [
  { id: "1", nome: "Lead Alpha", status: "Novo", valor: 500000 },
  { id: "2", nome: "Lead Beta", status: "Em Atendimento", valor: 750000 },
]

const columns: ResponsiveColumn<TestItem>[] = [
  {
    key: "nome",
    header: "Nome do Lead",
    priority: true,
    render: (item) => <span data-testid={`nome-${item.id}`}>{item.nome}</span>,
  },
  {
    key: "status",
    header: "Etapa",
    priority: true,
    render: (item) => <span data-testid={`status-${item.id}`}>{item.status}</span>,
  },
  {
    key: "valor",
    header: "Valor",
    mobileLabel: "Valor Imóvel",
    align: "right",
    render: (item) => `R$ ${item.valor.toLocaleString("pt-BR")}`,
  },
]

describe("ResponsiveTable Component", () => {
  it("renders both desktop table structure and mobile card container", () => {
    const html = renderToStaticMarkup(
      <ResponsiveTable
        data={mockData}
        columns={columns}
        keyExtractor={(item) => item.id}
      />
    )

    expect(html).toContain("hidden md:block")
    expect(html).toContain("<table")
    expect(html).toContain("flex flex-col gap-3 md:hidden")
    expect(html).toContain("Nome do Lead")
    expect(html).toContain("Lead Alpha")
    expect(html).toContain("Lead Beta")
    expect(html).toContain("Valor Imóvel")
  })

  it("renders emptyMessage when data array is empty", () => {
    const html = renderToStaticMarkup(
      <ResponsiveTable
        data={[]}
        columns={columns}
        keyExtractor={(item) => item.id}
        emptyMessage="Nenhum registro para exibir"
      />
    )

    expect(html).toContain("Nenhum registro para exibir")
  })
})
