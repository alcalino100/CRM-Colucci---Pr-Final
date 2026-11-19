import type { Boleto, Cliente, Contrato, InformeRendimentos, Reajuste, Resultado } from "./types"

/**
 * Contrato único entre o assistente e o sistema Immobillis.
 * Hoje há apenas o provedor simulado (mock-provider.ts). Quando a API real estiver
 * disponível, cria-se `ImmobillisHttpProvider implements ImmobillisProvider`
 * (client HTTP + schemas + mappers) sem alterar orquestrador, ferramentas ou UI.
 * Todas as operações são SOMENTE LEITURA.
 */
export interface ImmobillisProvider {
  readonly nome: string
  buscarClientePorTelefone(telefone: string): Promise<Resultado<Cliente>>
  buscarClientePorDocumento(cpfCnpj: string): Promise<Resultado<Cliente>>
  listarBoletos(clienteId: string, filtro?: { status?: Boleto["status"][] }): Promise<Resultado<Boleto[]>>
  listarContratos(clienteId: string): Promise<Resultado<Contrato[]>>
  obterReajuste(contratoId: string): Promise<Resultado<Reajuste>>
  obterInformeRendimentos(clienteId: string, anoBase: number): Promise<Resultado<InformeRendimentos>>
}
