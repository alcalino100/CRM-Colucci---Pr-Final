import { erroR, okR } from "./types"
import type { Boleto, Cliente, Contrato, InformeRendimentos, Reajuste } from "./types"
import type { ImmobillisProvider } from "./provider"

export const apenasDigitos = (s: string) => String(s ?? "").replace(/\D/g, "")

export const MOCK_CLIENTES: Cliente[] = [
  { id: "c1", nome: "Mariana Souza", cpfCnpj: "12345678901", telefone: "5511999990001", perfil: "inquilino" },
  { id: "c2", nome: "Roberto Almeida", cpfCnpj: "98765432100", telefone: "5511999990002", perfil: "proprietario" },
  { id: "c3", nome: "Fernanda Lima", cpfCnpj: "11122233344", telefone: "5511999990003", perfil: "inquilino" },
]

export const MOCK_CONTRATOS: Contrato[] = [
  { id: "k1", clienteId: "c1", imovelEndereco: "Rua das Flores, 120 - Apto 42", inicio: "2025-03-01", fim: "2028-02-28", valorAluguel: 2800, indiceReajuste: "IGP-M", status: "vigente" },
  { id: "k2", clienteId: "c2", imovelEndereco: "Av. Brasil, 900 - Sala 3", inicio: "2024-08-01", fim: "2027-07-31", valorAluguel: 5200, indiceReajuste: "IPCA", status: "vigente" },
  { id: "k3", clienteId: "c3", imovelEndereco: "Rua do Sol, 55", inicio: "2023-12-01", fim: "2026-11-30", valorAluguel: 1950, indiceReajuste: "IGP-M", status: "em_renovacao" },
]

export const MOCK_BOLETOS: Boleto[] = [
  { id: "b1", contratoId: "k1", competencia: "2026-11", vencimento: "2026-11-10", valor: 2800, status: "aberto", linhaDigitavel: "23793.38128 60000.000003 00000.000408 1 98760000280000", pdfUrl: "https://exemplo.invalid/boleto/b1.pdf" },
  { id: "b2", contratoId: "k1", competencia: "2026-10", vencimento: "2026-10-10", valor: 2800, status: "pago", pagoEm: "2026-10-09" },
  { id: "b3", contratoId: "k3", competencia: "2026-11", vencimento: "2026-11-05", valor: 1950, status: "vencido", linhaDigitavel: "23793.38128 60000.000003 00000.000509 2 98760000195000", pdfUrl: "https://exemplo.invalid/boleto/b3.pdf" },
  { id: "b4", contratoId: "k2", competencia: "2026-11", vencimento: "2026-11-15", valor: 5200, status: "aberto", linhaDigitavel: "23793.38128 60000.000003 00000.000610 3 98760000520000", pdfUrl: "https://exemplo.invalid/boleto/b4.pdf" },
]

const MOCK_REAJUSTES: Record<string, Reajuste> = {
  k1: { contratoId: "k1", indice: "IGP-M", dataProximo: "2027-03-01", percentualEstimado: 4.2, valorAtual: 2800, valorEstimado: 2917.6 },
  k2: { contratoId: "k2", indice: "IPCA", dataProximo: "2027-08-01", percentualEstimado: 4.5, valorAtual: 5200, valorEstimado: 5434 },
  k3: { contratoId: "k3", indice: "IGP-M", dataProximo: "2026-12-01", valorAtual: 1950 },
}

/** Provedor simulado: dados fictícios, sem rede. Usado em desenvolvimento, testes e demonstração. */
export function criarMockProvider(opts: { indisponivel?: boolean } = {}): ImmobillisProvider {
  const fora = () => erroR("indisponivel", "Sistema temporariamente indisponível.")
  return {
    nome: "simulado",
    async buscarClientePorTelefone(tel) {
      if (opts.indisponivel) return fora()
      const c = MOCK_CLIENTES.find((x) => apenasDigitos(x.telefone).endsWith(apenasDigitos(tel).slice(-11)))
      return c ? okR(c) : erroR("nao_encontrado", "Cliente não encontrado.")
    },
    async buscarClientePorDocumento(doc) {
      if (opts.indisponivel) return fora()
      const c = MOCK_CLIENTES.find((x) => x.cpfCnpj === apenasDigitos(doc))
      return c ? okR(c) : erroR("nao_encontrado", "Cliente não encontrado.")
    },
    async listarBoletos(clienteId, filtro) {
      if (opts.indisponivel) return fora()
      const contratos = new Set(MOCK_CONTRATOS.filter((k) => k.clienteId === clienteId).map((k) => k.id))
      let lista = MOCK_BOLETOS.filter((b) => contratos.has(b.contratoId))
      if (filtro?.status?.length) lista = lista.filter((b) => filtro.status!.includes(b.status))
      return okR(lista)
    },
    async listarContratos(clienteId) {
      if (opts.indisponivel) return fora()
      return okR(MOCK_CONTRATOS.filter((k) => k.clienteId === clienteId))
    },
    async obterReajuste(contratoId) {
      if (opts.indisponivel) return fora()
      const r = MOCK_REAJUSTES[contratoId]
      return r ? okR(r) : erroR("nao_encontrado", "Reajuste não encontrado.")
    },
    async obterInformeRendimentos(clienteId, anoBase): Promise<ReturnType<typeof okR<InformeRendimentos>> | ReturnType<typeof erroR>> {
      if (opts.indisponivel) return fora()
      const c = MOCK_CLIENTES.find((x) => x.id === clienteId)
      if (!c || c.perfil !== "proprietario") return erroR("nao_encontrado", "Informe não disponível.")
      return okR({ clienteId, anoBase, pdfUrl: `https://exemplo.invalid/informe/${clienteId}-${anoBase}.pdf`, totalRendimentos: 62400 })
    },
  }
}
