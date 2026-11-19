import type { Departamento, Intencao } from "./types"

/** Dados de DEMONSTRAÇÃO para as telas de monitoramento. Serão trocados por dados reais (tabela de atendimentos). */
export type StatusAtendimento = "resolvido_ia" | "transferido" | "aguardando_cliente"

export type AtendimentoDemo = {
  protocolo: string
  cliente: string
  perfil: string
  intencao: Intencao
  departamento?: Departamento
  status: StatusAtendimento
  duracaoSeg: number
  quando: string
}

export const ATENDIMENTOS_DEMO: AtendimentoDemo[] = [
  { protocolo: "COL-20261119-0412", cliente: "Mariana Souza", perfil: "Inquilino", intencao: "segunda_via_boleto", status: "resolvido_ia", duracaoSeg: 42, quando: "há 6 min" },
  { protocolo: "COL-20261119-0411", cliente: "Roberto Almeida", perfil: "Proprietário", intencao: "informe_rendimentos", status: "resolvido_ia", duracaoSeg: 35, quando: "há 18 min" },
  { protocolo: "COL-20261119-0410", cliente: "Fernanda Lima", perfil: "Inquilino", intencao: "manutencao", departamento: "manutencao", status: "transferido", duracaoSeg: 88, quando: "há 25 min" },
  { protocolo: "COL-20261119-0409", cliente: "Carlos Mendes", perfil: "Inquilino", intencao: "reajuste", status: "resolvido_ia", duracaoSeg: 51, quando: "há 41 min" },
  { protocolo: "COL-20261119-0408", cliente: "Número não cadastrado", perfil: "—", intencao: "locacao", departamento: "locacao", status: "transferido", duracaoSeg: 64, quando: "há 1 h" },
  { protocolo: "COL-20261119-0407", cliente: "Patrícia Ramos", perfil: "Proprietário", intencao: "falar_com_humano", departamento: "administrativo", status: "transferido", duracaoSeg: 12, quando: "há 1 h" },
  { protocolo: "COL-20261119-0406", cliente: "João Pereira", perfil: "Inquilino", intencao: "contrato", status: "aguardando_cliente", duracaoSeg: 20, quando: "há 2 h" },
  { protocolo: "COL-20261119-0405", cliente: "Luciana Prado", perfil: "Inquilino", intencao: "segunda_via_boleto", status: "resolvido_ia", duracaoSeg: 38, quando: "há 3 h" },
]

export const INDICADORES_DEMO = {
  atendimentos24h: 128,
  resolvidosIaPct: 71,
  transferidos: 37,
  tempoMedioRespostaSeg: 4,
  minutosEconomizados: 1240,
  satisfacao: 4.6,
  porIntencao: [
    { intencao: "segunda_via_boleto" as Intencao, total: 52 },
    { intencao: "informe_rendimentos" as Intencao, total: 21 },
    { intencao: "reajuste" as Intencao, total: 17 },
    { intencao: "contrato" as Intencao, total: 14 },
    { intencao: "manutencao" as Intencao, total: 12 },
    { intencao: "faq" as Intencao, total: 12 },
  ],
}
