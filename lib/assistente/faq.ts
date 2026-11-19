import { normalizar } from "./intencoes"

export type ItemFaq = { id: string; palavras: string[]; pergunta: string; resposta: string }

/**
 * Base de conhecimento estática (perguntas frequentes e processos).
 * Conteúdo de exemplo, deve ser revisado pela Colucci. No futuro pode migrar para
 * o RAG existente (lib/ai/ragSearch.ts) sem mudar a assinatura de `buscarFaq`.
 */
export const FAQ_PADRAO: ItemFaq[] = [
  { id: "horario", palavras: ["horario", "funciona", "aberto", "atendimento"], pergunta: "Qual o horário de atendimento?", resposta: "Nossa equipe atende em horário comercial. Fora dele, eu continuo disponível 24h para boletos, contratos, reajustes e informe de rendimentos." },
  { id: "documentos", palavras: ["documentos", "documento", "cadastro", "ficha"], pergunta: "Quais documentos preciso para alugar?", resposta: "Em geral: documento com foto (RG/CNH), CPF, comprovante de renda e comprovante de residência. A equipe de Locação confirma a lista exata para o seu caso." },
  { id: "renovacao", palavras: ["renovacao", "renovar", "vence"], pergunta: "Como funciona a renovação do contrato?", resposta: "Entramos em contato antes do vencimento para apresentar as opções de renovação. Se quiser antecipar, posso encaminhar você à equipe." },
  { id: "rescisao", palavras: ["rescisao", "rescindir", "multa", "distrato"], pergunta: "Como funciona a rescisão?", resposta: "A rescisão segue as condições do seu contrato. A equipe calcula multa e valor proporcional do aluguel e emite o termo. Posso abrir um atendimento para você." },
  { id: "reajuste", palavras: ["reajuste", "indice", "igpm", "ipca"], pergunta: "Como é feito o reajuste?", resposta: "O reajuste ocorre a cada 12 meses pelo índice previsto no contrato. Posso consultar a data e a estimativa do seu contrato, se você quiser." },
]

export function buscarFaq(texto: string, base: ItemFaq[] = FAQ_PADRAO): ItemFaq | null {
  const t = normalizar(texto)
  let melhor: { item: ItemFaq; pontos: number } | null = null
  for (const item of base) {
    const pontos = item.palavras.filter((p) => t.includes(p)).length
    if (pontos > 0 && (!melhor || pontos > melhor.pontos)) melhor = { item, pontos }
  }
  return melhor?.item ?? null
}
