import type { Departamento, Intencao } from "./types"

export function normalizar(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

// Ordem importa: a primeira regra que casar vence.
const REGRAS: { intencao: Intencao; re: RegExp }[] = [
  { intencao: "falar_com_humano", re: /\b(humano|atendente|pessoa de verdade|falar com (alguem|uma pessoa|o gerente|o corretor)|reclamacao|reclamar|ouvidoria|cancelar)\b/ },
  { intencao: "segunda_via_boleto", re: /(boleto|segunda via|2[ªa]? via|2 via|codigo de barras|linha digitavel|fatura|pagar (o )?aluguel)/ },
  { intencao: "informe_rendimentos", re: /(informe|rendimentos|imposto de renda|irpf|dirf|declaracao)/ },
  { intencao: "reajuste", re: /(reajust|igp-?m|ipca|aumento d[oe] aluguel|valor novo do aluguel)/ },
  { intencao: "manutencao", re: /(vazamento|goteira|infiltra|conserto|manutencao|torneira|encanamento|eletric|curto|quebrou|reparo|mofo|vistoria)/ },
  { intencao: "captacao", re: /(vender meu|anunciar meu|colocar meu imovel|quero alugar meu|disponibilizar meu|captar|avaliar meu imovel|avaliacao do meu imovel)/ },
  { intencao: "contrato", re: /(contrato|renovacao|renovar|rescisao|rescindir|distrato|vencimento do contrato|fim do contrato)/ },
  { intencao: "financeiro_outros", re: /(cobranca|pagamento|iptu|condominio|multa|atraso|extrato|repasse|comprovante|nota fiscal|debito)/ },
  { intencao: "vendas", re: /(comprar|compra de imovel|quero comprar|imoveis a venda|financiamento|financiar)/ },
  { intencao: "locacao", re: /(alugar|locacao|quero um imovel|procuro (um )?(apartamento|casa|imovel)|imoveis para alugar|visita)/ },
  { intencao: "faq", re: /(como funciona|horario|prazo|quais documentos|documentos necessarios|duvida|quanto tempo|onde fica|endereco da)/ },
]

export function classificarIntencao(texto: string): Intencao {
  const t = normalizar(texto)
  if (!t) return "desconhecida"
  for (const r of REGRAS) if (r.re.test(t)) return r.intencao
  if (t.length <= 25 && /^(oi|ola|oie|bom dia|boa tarde|boa noite|menu|ajuda|opa|e ai|hello|inicio)\b/.test(t)) return "saudacao"
  return "desconhecida"
}

export const DEPARTAMENTO_POR_INTENCAO: Partial<Record<Intencao, Departamento>> = {
  financeiro_outros: "financeiro",
  segunda_via_boleto: "financeiro",
  informe_rendimentos: "financeiro",
  manutencao: "manutencao",
  locacao: "locacao",
  vendas: "vendas",
  captacao: "captacao",
  contrato: "administrativo",
  reajuste: "administrativo",
  falar_com_humano: "administrativo",
  desconhecida: "administrativo",
  faq: "administrativo",
}

export const ROTULO_INTENCAO: Record<Intencao, string> = {
  segunda_via_boleto: "Segunda via de boleto",
  informe_rendimentos: "Informe de rendimentos",
  reajuste: "Reajuste",
  contrato: "Contrato",
  manutencao: "Manutenção",
  financeiro_outros: "Financeiro",
  locacao: "Locação",
  vendas: "Vendas",
  captacao: "Captação",
  faq: "Pergunta frequente",
  falar_com_humano: "Pediu atendente",
  saudacao: "Saudação",
  desconhecida: "Não entendida",
}

export const ROTULO_DEPARTAMENTO: Record<Departamento, string> = {
  financeiro: "Financeiro",
  manutencao: "Manutenção",
  locacao: "Locação",
  vendas: "Vendas",
  administrativo: "Administrativo",
  captacao: "Captação",
}
