import type { Intencao } from "./types"

/** O que o gestor pode ligar/desligar no assistente. Intenção desligada = cliente vai para a equipe. */
export const CAPACIDADES = [
  { id: "boleto", rotulo: "Segunda via de boleto", desc: "Envia linha digitável e PDF dos boletos em aberto." },
  { id: "informe", rotulo: "Informe de rendimentos", desc: "Entrega o informe do ano-base (proprietários)." },
  { id: "reajuste", rotulo: "Reajustes", desc: "Informa índice, data e estimativa do reajuste." },
  { id: "contrato", rotulo: "Consulta de contratos", desc: "Vigência, valor e aviso de renovação." },
  { id: "faq", rotulo: "Perguntas frequentes", desc: "Responde dúvidas comuns sem exigir identificação." },
] as const

export type Capacidade = (typeof CAPACIDADES)[number]["id"]
export type MapaCapacidades = Record<Capacidade, boolean>

export const CAPACIDADES_PADRAO: MapaCapacidades = { boleto: true, informe: true, reajuste: true, contrato: true, faq: true }

export const CAPACIDADE_POR_INTENCAO: Partial<Record<Intencao, Capacidade>> = {
  segunda_via_boleto: "boleto",
  informe_rendimentos: "informe",
  reajuste: "reajuste",
  contrato: "contrato",
  faq: "faq",
}

export function normalizarCapacidades(bruto: unknown): MapaCapacidades {
  const o = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>
  const out = { ...CAPACIDADES_PADRAO }
  for (const c of CAPACIDADES) if (typeof o[c.id] === "boolean") out[c.id] = o[c.id] as boolean
  return out
}
