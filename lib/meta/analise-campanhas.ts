/** Análise de campanhas (regras puras sobre os números reconciliados Meta × CRM). */
export type CampanhaAuditada = {
  campaignId: string
  campaignName: string
  status?: string
  spend: number
  metaResults: number
  crmLeads: number
  visitas: number
  fechamentos: number
  vgvFechado: number
  comissaoFechada: number
  roasComissao: string | number
  statusSaude?: string
  diagnostico?: string
}

export type TotaisAuditoria = {
  gastoTotalMeta: number
  leadsReportadosMeta: number
  leadsReaisNoCrm: number
  visitasAgendadasRealizadas: number
  fechamentosConcluidos: number
  vgvTotalFechado: number
  comissaoTotalGerada: number
  cplReal: number
  cplMeta: number
  cacReal: number
}

export type Acao = "escalar" | "manter" | "otimizar" | "pausar" | "sem_dados"
export type CampanhaClassificada = CampanhaAuditada & { cplReal: number | null; roas: number; acao: Acao; motivo: string }

const num = (v: unknown) => { const n = parseFloat(String(v ?? 0)); return Number.isFinite(n) ? n : 0 }
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

/**
 * Regras (ordem importa):
 *  - fechou venda com retorno >= 3x o gasto → escalar;
 *  - gastou e não gerou nenhum lead no CRM → pausar/revisar (acima de um piso para não julgar cedo);
 *  - custo por lead real muito acima da média da conta → otimizar;
 *  - muitos leads sem visita → otimizar a qualificação;
 *  - sem gasto relevante → sem dados.
 */
export function classificarCampanha(c: CampanhaAuditada, cplMedioConta: number, pisoGasto = 100): CampanhaClassificada {
  const roas = num(c.roasComissao)
  const cplReal = c.crmLeads > 0 ? c.spend / c.crmLeads : null
  const base = { ...c, cplReal, roas }
  if (c.spend < pisoGasto) return { ...base, acao: "sem_dados", motivo: `Gasto de ${brl(c.spend)} ainda é pequeno para uma conclusão segura.` }
  if (c.fechamentos > 0 && roas >= 3) return { ...base, acao: "escalar", motivo: `${c.fechamentos} fechamento(s) e retorno de ${roas.toFixed(1)}x sobre o investimento: candidata a mais verba.` }
  if (c.crmLeads === 0) return { ...base, acao: "pausar", motivo: `Gastou ${brl(c.spend)} e não gerou nenhum lead no CRM${c.metaResults ? ` (a Meta reporta ${c.metaResults} resultado(s): verifique a integração/atribuição)` : ""}.` }
  if (cplMedioConta > 0 && cplReal !== null && cplReal > cplMedioConta * 1.5) return { ...base, acao: "otimizar", motivo: `Custo por lead real de ${brl(cplReal)} está ${Math.round((cplReal / cplMedioConta - 1) * 100)}% acima da média da conta (${brl(cplMedioConta)}).` }
  if (c.crmLeads >= 10 && c.visitas === 0) return { ...base, acao: "otimizar", motivo: `${c.crmLeads} leads e nenhuma visita: revisar público/mensagem para atrair leads mais qualificados.` }
  return { ...base, acao: "manter", motivo: cplReal !== null ? `Custo por lead real de ${brl(cplReal)}, dentro do esperado.` : "Sem alertas." }
}

export function classificarCampanhas(campanhas: CampanhaAuditada[], totais: Pick<TotaisAuditoria, "gastoTotalMeta" | "leadsReaisNoCrm">): CampanhaClassificada[] {
  const cplMedio = totais.leadsReaisNoCrm > 0 ? totais.gastoTotalMeta / totais.leadsReaisNoCrm : 0
  const peso: Record<Acao, number> = { pausar: 0, otimizar: 1, escalar: 2, manter: 3, sem_dados: 4 }
  return campanhas.map((c) => classificarCampanha(c, cplMedio)).sort((a, b) => peso[a.acao] - peso[b.acao] || b.spend - a.spend)
}

export const ROTULO_ACAO: Record<Acao, string> = { escalar: "Escalar", manter: "Manter", otimizar: "Otimizar", pausar: "Pausar/revisar", sem_dados: "Poucos dados" }

/** Período anterior de mesma duração, terminando no dia anterior ao início (datas YYYY-MM-DD). */
export function periodoAnterior(since: string, until: string): { since: string; until: string } {
  const d = (s: string) => new Date(`${s}T12:00:00Z`)
  const dias = Math.round((d(until).getTime() - d(since).getTime()) / 864e5) + 1
  const fim = new Date(d(since).getTime() - 864e5)
  const ini = new Date(fim.getTime() - (dias - 1) * 864e5)
  return { since: ini.toISOString().slice(0, 10), until: fim.toISOString().slice(0, 10) }
}

/** Primeiro e último dia de um mês 'YYYY-MM'. */
export function limitesDoMes(mes: string): { since: string; until: string } {
  const [a, m] = mes.split("-").map(Number)
  return { since: `${mes}-01`, until: new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10) }
}

export function mesAnterior(mes: string): string {
  const [a, m] = mes.split("-").map(Number)
  const d = new Date(Date.UTC(a, m - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}
