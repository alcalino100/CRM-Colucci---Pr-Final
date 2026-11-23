import type { AtendimentoResumo, Indicadores } from "./repositorio"

/**
 * Dados de DEMONSTRAÇÃO. As telas mostram isso só enquanto a migration do assistente não foi aplicada
 * (a API avisa com `fonte: "demonstracao"`). Datas são geradas em relação a "agora".
 */
export function atendimentosDemo(agora = new Date()): AtendimentoResumo[] {
  const h = (min: number) => new Date(agora.getTime() - min * 60_000).toISOString()
  return [
    { id: "d1", protocolo: "COL-20261119-0412", cliente: "Mariana Souza", perfil: "inquilino", telefoneMascarado: "+55 11 9****-0001", intencao: "segunda_via_boleto", status: "resolvida_ia", duracaoSeg: 42, quando: h(6), mensagens: 6 },
    { id: "d2", protocolo: "COL-20261119-0411", cliente: "Roberto Almeida", perfil: "proprietario", telefoneMascarado: "+55 11 9****-0002", intencao: "informe_rendimentos", status: "resolvida_ia", duracaoSeg: 35, quando: h(18), mensagens: 5 },
    { id: "d3", protocolo: "COL-20261119-0410", cliente: "Fernanda Lima", perfil: "inquilino", telefoneMascarado: "+55 11 9****-0003", intencao: "manutencao", departamento: "manutencao", status: "transferida", duracaoSeg: 88, quando: h(25), mensagens: 4 },
    { id: "d4", cliente: "Não identificado", telefoneMascarado: "+55 11 9****-4410", intencao: "locacao", departamento: "locacao", status: "transferida", duracaoSeg: 64, quando: h(60), mensagens: 3 },
    { id: "d5", protocolo: "COL-20261119-0407", cliente: "Patrícia Ramos", perfil: "proprietario", telefoneMascarado: "+55 11 9****-7788", intencao: "falar_com_humano", departamento: "administrativo", status: "humano", duracaoSeg: 12, quando: h(65), mensagens: 3 },
    { id: "d6", cliente: "João Pereira", perfil: "inquilino", telefoneMascarado: "+55 11 9****-1212", intencao: "contrato", status: "ativa", duracaoSeg: 20, quando: h(120), mensagens: 2 },
  ]
}

export const indicadoresDemo = (): Indicadores => ({
  atendimentos: 128,
  resolvidosIaPct: 71,
  transferidos: 37,
  tempoMedioRespostaSeg: 4,
  minutosEconomizados: 1240,
  satisfacao: 4.6,
  ia: { tentativas: 96, ok: 91, falhas: 5, ultimoErro: null as string | null },
  porIntencao: [
    { intencao: "segunda_via_boleto", total: 52 },
    { intencao: "informe_rendimentos", total: 21 },
    { intencao: "reajuste", total: 17 },
    { intencao: "contrato", total: 14 },
    { intencao: "manutencao", total: 12 },
    { intencao: "faq", total: 12 },
  ],
})
