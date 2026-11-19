import type { Boleto, Contrato, InformeRendimentos, Reajuste } from "./types"

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

export function dataBR(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-")
  return y && m && d ? `${d}/${m}/${y}` : iso
}

export function competenciaBR(c: string): string {
  const [y, m] = c.split("-")
  return y && m ? `${m}/${y}` : c
}

export function diasAte(iso: string, agora: Date): number {
  const alvo = new Date(`${iso.slice(0, 10)}T00:00:00`)
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000)
}

export function textoBoleto(b: Boleto): string {
  const linhas = [
    `${b.status === "vencido" ? "⚠️ Boleto VENCIDO" : "📄 Boleto"} — competência ${competenciaBR(b.competencia)}`,
    `Vencimento: ${dataBR(b.vencimento)}`,
    `Valor: ${brl(b.valor)}`,
  ]
  if (b.linhaDigitavel) linhas.push(`Linha digitável:\n${b.linhaDigitavel}`)
  if (b.pdfUrl) linhas.push(`PDF: ${b.pdfUrl}`)
  if (b.status === "vencido") linhas.push("Obs.: boleto vencido pode ter acréscimos. Se precisar do valor atualizado, posso chamar a equipe.")
  return linhas.join("\n")
}

export function textoContrato(c: Contrato, agora: Date): string {
  const dias = diasAte(c.fim, agora)
  const linhas = [
    `📑 ${c.imovelEndereco}`,
    `Vigência: ${dataBR(c.inicio)} a ${dataBR(c.fim)}`,
    `Aluguel: ${brl(c.valorAluguel)} (reajuste ${c.indiceReajuste})`,
  ]
  if (c.status === "encerrado") linhas.push("Situação: encerrado")
  else if (dias < 0) linhas.push("Situação: prazo de vigência encerrado")
  else if (dias <= 90) linhas.push(`Faltam ${dias} dias para o vencimento. Nossa equipe entra em contato sobre a renovação.`)
  return linhas.join("\n")
}

export function textoReajuste(r: Reajuste, enderecoContrato: string): string {
  const linhas = [`📈 ${enderecoContrato}`, `Índice: ${r.indice}`, `Próximo reajuste: ${dataBR(r.dataProximo)}`, `Aluguel atual: ${brl(r.valorAtual)}`]
  if (r.percentualEstimado !== undefined && r.valorEstimado !== undefined) {
    linhas.push(`Estimativa: ${r.percentualEstimado.toLocaleString("pt-BR")}% → ${brl(r.valorEstimado)} (valor definitivo depende do índice oficial)`)
  } else {
    linhas.push("O percentual será definido quando o índice oficial for divulgado.")
  }
  return linhas.join("\n")
}

export function textoInforme(i: InformeRendimentos): string {
  return `🧾 Informe de rendimentos ${i.anoBase}\n${i.pdfUrl}`
}
