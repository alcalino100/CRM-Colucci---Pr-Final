import type { ChamadaIa } from "./ia"

/**
 * Humanizador: o orquestrador produz textos corretos e previsíveis; o Claude só deixa o tom mais
 * natural. Todo fato (valor, data, link, código, protocolo) é conferido contra o original. Qualquer
 * divergência, erro ou demora devolve o texto original — o cliente nunca recebe dado inventado.
 */

const RE_FATOS: RegExp[] = [
  /R\$\s?[\d.]+,\d{2}/g, // valores
  /\b\d{2}\/\d{2}\/\d{4}\b/g, // datas
  /\b\d{2}\/\d{4}\b/g, // competências
  /https?:\/\/\S+/g, // links
  /\bCOL-[A-Z0-9-]+\b/g, // protocolo
  /\b\d{5}\.\d{5}[\d. ]+\d\b/g, // linha digitável
  /\d+(?:[.,]\d+)?\s?%/g, // percentuais
  /\b\d{4,}\b/g, // números longos (anos, códigos)
  /\b\d+\s+dias\b/g,
]

export function extrairFatos(texto: string): string[] {
  const achados = new Set<string>()
  for (const re of RE_FATOS) for (const m of texto.match(re) ?? []) achados.add(m.replace(/\s+/g, " ").trim())
  return [...achados]
}

const compacta = (s: string) => s.replace(/\s+/g, " ")

/** O reescrito mantém TODOS os fatos do original e não introduz nenhum novo. */
export function preservaFatos(original: string, reescrito: string): boolean {
  const o = extrairFatos(original)
  const r = extrairFatos(reescrito)
  const rTexto = compacta(reescrito)
  const oTexto = compacta(original)
  return o.every((f) => rTexto.includes(f)) && r.every((f) => oTexto.includes(f))
}

/** Mensagens com link ou linha digitável (ex.: boleto) vão sempre literais: valor de copiar/colar, zero risco. */
export const ehBlocoLiteral = (t: string) => /https?:\/\//.test(t) || /\b\d{5}\.\d{5}/.test(t)

const SYSTEM = `Você é a voz da assistente virtual da Colucci Imóveis, no WhatsApp.
Reescreva cada mensagem do array "respostas" em português do Brasil, de forma acolhedora, clara e curta, como uma atendente atenciosa.
REGRAS OBRIGATÓRIAS:
- Preserve EXATAMENTE todos os valores, datas, percentuais, números, links, códigos e protocolos. Não arredonde, não converta, não reformate.
- Não acrescente informações, promessas, prazos ou ofertas que não estejam no texto.
- Não remova nenhuma informação do texto.
- No máximo 1 emoji por mensagem; mantenha os emojis que já existem se fizerem sentido.
- Mantenha as quebras de linha de listas e blocos de dados.
- Devolva o MESMO número de mensagens, na mesma ordem, chamando a ferramenta entregar_respostas.`

const TOOL = {
  name: "entregar_respostas",
  description: "Devolve as mensagens reescritas, na mesma ordem e quantidade.",
  input_schema: {
    type: "object",
    properties: { respostas: { type: "array", items: { type: "string" } } },
    required: ["respostas"],
  },
}

export type ResultadoHumanizacao = { respostas: string[]; usouIa: boolean; ok: boolean; tokens: number }

export async function humanizar(respostas: string[], ia: ChamadaIa): Promise<ResultadoHumanizacao> {
  const alvo = respostas.map((t, i) => ({ t, i })).filter(({ t }) => !ehBlocoLiteral(t) && t.trim().length > 0)
  if (!alvo.length) return { respostas, usouIa: false, ok: true, tokens: 0 }
  try {
    const r = await ia({
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify({ respostas: alvo.map((a) => a.t) }) }],
      tools: [TOOL],
      toolChoice: { type: "tool", name: "entregar_respostas" },
      maxTokens: 700,
      timeoutMs: 6000,
    })
    const saida = (r.chamadas.find((c) => c.name === "entregar_respostas")?.input as { respostas?: unknown } | undefined)?.respostas
    if (!Array.isArray(saida) || saida.length !== alvo.length) return { respostas, usouIa: true, ok: false, tokens: r.tokensTotal }
    const final = [...respostas]
    alvo.forEach(({ t, i }, k) => {
      const novo = typeof saida[k] === "string" ? (saida[k] as string).trim() : ""
      const tamanhoOk = novo.length > 0 && novo.length <= t.length * 1.6 + 120
      if (tamanhoOk && preservaFatos(t, novo)) final[i] = novo
    })
    return { respostas: final, usouIa: true, ok: true, tokens: r.tokensTotal }
  } catch {
    return { respostas, usouIa: true, ok: false, tokens: 0 }
  }
}
