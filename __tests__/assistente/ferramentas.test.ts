import { describe, expect, it } from "vitest"
import { criarMockProvider, descreverFerramentas, executarFerramenta } from "@/lib/assistente"

const provider = criarMockProvider()

describe("ferramentas", () => {
  it("recusam execução sem identidade verificada", async () => {
    const r = await executarFerramenta("buscar_boletos", { provider }, {})
    expect(r).toMatchObject({ ok: false, codigo: "nao_autorizado" })
  })

  it("buscar_boletos retorna só aberto/vencido do cliente", async () => {
    const r = await executarFerramenta("buscar_boletos", { provider, clienteId: "c1" }, {})
    expect(r.ok).toBe(true)
    if (r.ok) expect((r.dados as any[]).map((b) => b.id)).toEqual(["b1"])
  })

  it("consultar_reajuste bloqueia contrato de outro cliente", async () => {
    const r = await executarFerramenta("consultar_reajuste", { provider, clienteId: "c1" }, { contratoId: "k2" })
    expect(r).toMatchObject({ ok: false, codigo: "nao_autorizado" })
  })

  it("valida entrada com zod", async () => {
    const r = await executarFerramenta("obter_informe_rendimentos", { provider, clienteId: "c2" }, { anoBase: "abc" })
    expect(r).toMatchObject({ ok: false, codigo: "entrada_invalida" })
  })

  it("ferramenta desconhecida é erro previsível", async () => {
    const r = await executarFerramenta("apagar_tudo", { provider, clienteId: "c1" }, {})
    expect(r).toMatchObject({ ok: false, codigo: "entrada_invalida" })
  })

  it("descreve as ferramentas em JSON Schema (pronto para LLM/MCP)", () => {
    const defs = descreverFerramentas()
    expect(defs.map((d) => d.name)).toContain("buscar_boletos")
    expect(defs.every((d) => typeof d.inputSchema === "object")).toBe(true)
  })
})
