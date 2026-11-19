import { z } from "zod"

/**
 * Modelo interno da Colucci para o Assistente Virtual (item 5.4 do Projeto Conecta 360°).
 * A IA e a UI só conhecem estes tipos. O formato cru do Immobillis fica isolado
 * no provedor (ver provider.ts) e é convertido para cá por mappers.
 */

export const PerfilCliente = z.enum(["inquilino", "proprietario", "comprador", "vendedor", "investidor"])
export type PerfilCliente = z.infer<typeof PerfilCliente>

export const ClienteSchema = z.object({
  id: z.string(),
  nome: z.string(),
  cpfCnpj: z.string(), // somente dígitos
  telefone: z.string(), // somente dígitos, com DDI
  email: z.string().optional(),
  perfil: PerfilCliente,
})
export type Cliente = z.infer<typeof ClienteSchema>

export const StatusBoleto = z.enum(["aberto", "vencido", "pago", "cancelado"])
export type StatusBoleto = z.infer<typeof StatusBoleto>

export const BoletoSchema = z.object({
  id: z.string(),
  contratoId: z.string(),
  competencia: z.string(), // YYYY-MM
  vencimento: z.string(), // YYYY-MM-DD
  valor: z.number(), // reais
  status: StatusBoleto,
  linhaDigitavel: z.string().optional(),
  pdfUrl: z.string().optional(),
  pagoEm: z.string().optional(),
})
export type Boleto = z.infer<typeof BoletoSchema>

export const ContratoSchema = z.object({
  id: z.string(),
  clienteId: z.string(),
  imovelEndereco: z.string(),
  inicio: z.string(),
  fim: z.string(),
  valorAluguel: z.number(),
  indiceReajuste: z.string(), // ex: IGP-M, IPCA
  status: z.enum(["vigente", "encerrado", "em_renovacao"]),
})
export type Contrato = z.infer<typeof ContratoSchema>

export const ReajusteSchema = z.object({
  contratoId: z.string(),
  indice: z.string(),
  dataProximo: z.string(),
  percentualEstimado: z.number().optional(),
  valorAtual: z.number(),
  valorEstimado: z.number().optional(),
})
export type Reajuste = z.infer<typeof ReajusteSchema>

export const InformeRendimentosSchema = z.object({
  clienteId: z.string(),
  anoBase: z.number(),
  pdfUrl: z.string(),
  totalRendimentos: z.number().optional(),
})
export type InformeRendimentos = z.infer<typeof InformeRendimentosSchema>

/** Intenções que o assistente reconhece. "humano" e "desconhecida" sempre escalam. */
export const Intencao = z.enum([
  "segunda_via_boleto",
  "informe_rendimentos",
  "reajuste",
  "contrato",
  "manutencao",
  "financeiro_outros",
  "locacao",
  "vendas",
  "captacao",
  "faq",
  "falar_com_humano",
  "saudacao",
  "desconhecida",
])
export type Intencao = z.infer<typeof Intencao>

export const Departamento = z.enum(["financeiro", "manutencao", "locacao", "vendas", "administrativo", "captacao"])
export type Departamento = z.infer<typeof Departamento>

/** Erros previsíveis. O assistente nunca expõe detalhe técnico ao cliente. */
export type CodigoErro = "nao_encontrado" | "indisponivel" | "nao_autorizado" | "entrada_invalida"
export type Resultado<T> = { ok: true; dados: T } | { ok: false; codigo: CodigoErro; mensagem: string }

export const okR = <T,>(dados: T): Resultado<T> => ({ ok: true, dados })
export const erroR = (codigo: CodigoErro, mensagem: string): Resultado<never> => ({ ok: false, codigo, mensagem })
