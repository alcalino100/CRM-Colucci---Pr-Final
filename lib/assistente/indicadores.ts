import { MIN_ECONOMIZADOS_POR_ATENDIMENTO, type AtendimentoResumo, type Conversa, type Indicadores, type MensagemRegistro } from "./repositorio"
import { mascararTelefone } from "./persistencia"

export function montarResumo(c: Conversa, msgs: MensagemRegistro[]): AtendimentoResumo {
  const duracaoSeg = Math.max(0, Math.round((new Date(c.ultimaMsgEm).getTime() - new Date(c.criadoEm).getTime()) / 1000))
  return {
    id: c.id,
    protocolo: c.estado.protocolo,
    cliente: c.estado.cliente?.nome ?? "Não identificado",
    perfil: c.estado.cliente?.perfil,
    telefoneMascarado: mascararTelefone(c.telefone),
    intencao: c.intencaoAtual,
    departamento: c.estado.departamento,
    status: c.status,
    duracaoSeg,
    quando: c.ultimaMsgEm,
    mensagens: msgs.length,
  }
}

/** Tempo médio entre a mensagem do cliente e a resposta seguinte do assistente. */
export function tempoMedioRespostaSeg(msgs: MensagemRegistro[]): number | null {
  const ord = [...msgs].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))
  const gaps: number[] = []
  let pendente: number | null = null
  for (const m of ord) {
    const t = new Date(m.criadoEm).getTime()
    if (m.papel === "cliente" && pendente === null) pendente = t
    else if (m.papel === "assistente" && pendente !== null) { gaps.push((t - pendente) / 1000); pendente = null }
  }
  return gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null
}

export type EventoIa = { funcao: string; ok: boolean; erro?: string }

export function resumirIa(eventos: EventoIa[]): Indicadores["ia"] {
  const ag = eventos.filter((e) => e.funcao === "agente")
  const falhas = ag.filter((e) => !e.ok)
  return { tentativas: ag.length, ok: ag.length - falhas.length, falhas: falhas.length, ultimoErro: [...falhas].reverse().find((e) => e.erro)?.erro ?? null }
}

export function calcularIndicadores(conversas: Conversa[], mensagensPorConversa: Map<string, MensagemRegistro[]>, eventosIa: EventoIa[] = []): Indicadores {
  const total = conversas.length
  const resolvidos = conversas.filter((c) => c.status === "resolvida_ia").length
  const transferidos = conversas.filter((c) => c.status === "transferida" || c.status === "humano").length
  const contagem = new Map<string, number>()
  for (const c of conversas) if (c.intencaoAtual) contagem.set(c.intencaoAtual, (contagem.get(c.intencaoAtual) ?? 0) + 1)
  const porConversa = conversas.map((c) => tempoMedioRespostaSeg(mensagensPorConversa.get(c.id) ?? [])).filter((x): x is number => x !== null)
  return {
    atendimentos: total,
    resolvidosIaPct: total ? Math.round((resolvidos / total) * 100) : 0,
    transferidos,
    tempoMedioRespostaSeg: porConversa.length ? Math.round(porConversa.reduce((a, b) => a + b, 0) / porConversa.length) : null,
    minutosEconomizados: resolvidos * MIN_ECONOMIZADOS_POR_ATENDIMENTO,
    satisfacao: null, // ainda não coletamos pesquisa de satisfação pelo assistente
    ia: resumirIa(eventosIa),
    porIntencao: [...contagem].map(([intencao, n]) => ({ intencao: intencao as Indicadores["porIntencao"][number]["intencao"], total: n })).sort((a, b) => b.total - a.total),
  }
}

export const indicadoresVazios = (): Indicadores => ({ atendimentos: 0, resolvidosIaPct: 0, transferidos: 0, tempoMedioRespostaSeg: null, minutosEconomizados: 0, satisfacao: null, porIntencao: [], ia: { tentativas: 0, ok: 0, falhas: 0, ultimoErro: null } })
