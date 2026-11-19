import { z } from "zod"
import type { ImmobillisProvider } from "./provider"
import { erroR, okR, type Resultado } from "./types"

/**
 * Ferramentas do assistente: funções tipadas, SOMENTE LEITURA, com entrada validada por zod.
 * São a única forma de a IA tocar em dados do cliente. O mesmo registro pode ser
 * exposto depois como servidor MCP ou como `tools` de um LLM (ver `descreverFerramentas`).
 */
export type ContextoFerramenta = {
  provider: ImmobillisProvider
  /** Preenchido só depois da verificação de identidade. Sem ele, nenhuma ferramenta de dados roda. */
  clienteId?: string
}

export type Ferramenta<E extends z.ZodType = z.ZodType, S = unknown> = {
  nome: string
  descricao: string
  entrada: E
  executar: (ctx: ContextoFerramenta, entrada: z.infer<E>) => Promise<Resultado<S>>
}

/** Helper que preserva a tipagem da entrada de cada ferramenta. */
const definirFerramenta = <E extends z.ZodType, S>(f: Ferramenta<E, S>) => f

function exigirIdentidade(ctx: ContextoFerramenta): Resultado<never> | null {
  return ctx.clienteId ? null : erroR("nao_autorizado", "Identidade não verificada.")
}

export const buscarBoletos = definirFerramenta({
  nome: "buscar_boletos",
  descricao: "Lista boletos em aberto ou vencidos do cliente identificado (segunda via).",
  entrada: z.object({ incluirPagos: z.boolean().optional() }),
  async executar(ctx, entrada) {
    const bloqueio = exigirIdentidade(ctx)
    if (bloqueio) return bloqueio
    const status = entrada.incluirPagos ? undefined : (["aberto", "vencido"] as const)
    return ctx.provider.listarBoletos(ctx.clienteId!, status ? { status: [...status] } : undefined)
  },
})

export const listarContratos = definirFerramenta({
  nome: "listar_contratos",
  descricao: "Lista os contratos do cliente identificado.",
  entrada: z.object({}),
  async executar(ctx) {
    const bloqueio = exigirIdentidade(ctx)
    if (bloqueio) return bloqueio
    return ctx.provider.listarContratos(ctx.clienteId!)
  },
})

export const consultarReajuste = definirFerramenta({
  nome: "consultar_reajuste",
  descricao: "Consulta índice, data e estimativa do próximo reajuste de um contrato do cliente.",
  entrada: z.object({ contratoId: z.string().min(1) }),
  async executar(ctx, entrada) {
    const bloqueio = exigirIdentidade(ctx)
    if (bloqueio) return bloqueio
    // Garante que o contrato pertence ao cliente identificado (evita acesso a dados de terceiros).
    const contratos = await ctx.provider.listarContratos(ctx.clienteId!)
    if (!contratos.ok) return contratos
    if (!contratos.dados.some((c) => c.id === entrada.contratoId)) return erroR("nao_autorizado", "Contrato não pertence ao cliente.")
    return ctx.provider.obterReajuste(entrada.contratoId)
  },
})

export const obterInformeRendimentos = definirFerramenta({
  nome: "obter_informe_rendimentos",
  descricao: "Obtém o link do informe de rendimentos do cliente para o ano-base informado.",
  entrada: z.object({ anoBase: z.number().int().min(2000).max(2100) }),
  async executar(ctx, entrada) {
    const bloqueio = exigirIdentidade(ctx)
    if (bloqueio) return bloqueio
    return ctx.provider.obterInformeRendimentos(ctx.clienteId!, entrada.anoBase)
  },
})

export const FERRAMENTAS = [buscarBoletos, listarContratos, consultarReajuste, obterInformeRendimentos] as const

/** Executa uma ferramenta pelo nome validando a entrada. Usado pelo orquestrador, por LLM tool calling ou MCP. */
export async function executarFerramenta(nome: string, ctx: ContextoFerramenta, entradaBruta: unknown): Promise<Resultado<unknown>> {
  const f = FERRAMENTAS.find((x) => x.nome === nome) as unknown as Ferramenta | undefined
  if (!f) return erroR("entrada_invalida", `Ferramenta desconhecida: ${nome}`)
  const parsed = f.entrada.safeParse(entradaBruta ?? {})
  if (!parsed.success) return erroR("entrada_invalida", "Parâmetros inválidos.")
  return f.executar(ctx, parsed.data)
}

/** Definições em JSON Schema, prontas para LLM tool calling ou para um servidor MCP. */
export function descreverFerramentas() {
  return FERRAMENTAS.map((f) => ({ name: f.nome, description: f.descricao, inputSchema: z.toJSONSchema(f.entrada) }))
}
