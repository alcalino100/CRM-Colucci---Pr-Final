// lib/relatorios/metricas/locacao.ts
// Bloco 6: Locação (leads, negociações, locados, comissão, visitas e funil)

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"
import { type PeriodoDiaBRT, TIMEZONE_BRT } from "../periodo"

export interface LocacaoCorretorResumo {
  corretorNome: string
  total: number
}

export interface LocacaoVisitaAgendada {
  horario: string
  corretorNome: string
  leadNome: string | null // só preenchido quando "Listar nomes dos leads" está ligado (LGPD)
}

export interface LocacaoFunil {
  novo: number
  emAtendimento: number
  procurandoImovel: number
  visitaAgendada: number
  negociando: number
  locado: number
  perdido: number
}

export interface MetricasLocacao {
  novosLeads: number
  novosPorCorretor: LocacaoCorretorResumo[]
  negociacoesIniciadas: number
  locadosNoDia: number
  comissaoLocadosNoDia: number
  contratosAssinados: number
  valorAluguelContratos: number
  visitasRegistradasNoDia: number
  /** Dia das visitas listadas abaixo (YYYY-MM-DD): o dia seguinte ao período do relatório. */
  diaVisitas: string
  visitasAgendadasTotal: number
  visitasAgendadas: LocacaoVisitaAgendada[]
  funil: LocacaoFunil
  /** Leads em aberto (fora de locado/perdido), por temperatura. */
  temperatura: { quente: number; morno: number; frio: number }
  totalEmAberto: number
}

export const METRICAS_LOCACAO_VAZIAS: MetricasLocacao = {
  novosLeads: 0,
  novosPorCorretor: [],
  negociacoesIniciadas: 0,
  locadosNoDia: 0,
  comissaoLocadosNoDia: 0,
  contratosAssinados: 0,
  valorAluguelContratos: 0,
  visitasRegistradasNoDia: 0,
  diaVisitas: "",
  visitasAgendadasTotal: 0,
  visitasAgendadas: [],
  funil: { novo: 0, emAtendimento: 0, procurandoImovel: 0, visitaAgendada: 0, negociando: 0, locado: 0, perdido: 0 },
  temperatura: { quente: 0, morno: 0, frio: 0 },
  totalEmAberto: 0,
}

/** Dia seguinte a um YYYY-MM-DD (calendário, sem fuso). */
export function diaSeguinteYmd(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** "Procurando imovel" / "procurando_imovel" / "Em atendimento" → "procurando_imovel" / "em_atendimento". */
export function normalizarStatusLocacao(status: string | null | undefined): string {
  return (status ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s_-]+/g, "_")
}

export function contarFunil(
  leads: Array<{ status: string | null; temperatura: string | null }>
): Pick<MetricasLocacao, "funil" | "temperatura" | "totalEmAberto"> {
  const funil: LocacaoFunil = { ...METRICAS_LOCACAO_VAZIAS.funil }
  const temperatura = { quente: 0, morno: 0, frio: 0 }
  let totalEmAberto = 0

  for (const l of leads) {
    switch (normalizarStatusLocacao(l.status)) {
      case "novo": funil.novo++; break
      case "em_atendimento": funil.emAtendimento++; break
      case "procurando_imovel": funil.procurandoImovel++; break
      case "visita_agendada": funil.visitaAgendada++; break
      case "negociando": funil.negociando++; break
      case "locado": funil.locado++; continue
      case "perdido": funil.perdido++; continue
      default: break
    }
    totalEmAberto++
    const t = normalizarStatusLocacao(l.temperatura)
    if (t === "quente" || t === "morno" || t === "frio") temperatura[t]++
  }

  return { funil, temperatura, totalEmAberto }
}

async function contar(
  consulta: PromiseLike<{ count: number | null; error: unknown }>
): Promise<number> {
  const { count, error } = await consulta
  return error ? 0 : count ?? 0
}

/**
 * Coleta as métricas de locação do dia do relatório (janela [inicioIso, fimIso) em Brasília) e o retrato
 * atual do funil. Falha em uma consulta zera só aquele número, como nos demais blocos.
 */
export async function coletarMetricasLocacao(
  supabase: SupabaseClient<Database>,
  periodo: PeriodoDiaBRT,
  opcoes: { listarNomesLeads?: boolean } = {}
): Promise<MetricasLocacao> {
  const { inicioIso, fimIso } = periodo
  const diaVisitas = diaSeguinteYmd(periodo.ymd)

  const [
    novosRes,
    negociacoesIniciadas,
    locadosRes,
    contratosRes,
    visitasRegistradasNoDia,
    visitasAgendadasRes,
    abertosRes,
  ] = await Promise.all([
    supabase.from("locacao_leads").select("id, corretor_id").gte("criado_em", inicioIso).lt("criado_em", fimIso).limit(5000),
    contar(supabase.from("locacao_leads").select("id", { count: "exact", head: true }).gte("negociando_em", inicioIso).lt("negociando_em", fimIso)),
    supabase.from("locacao_leads").select("id, valor_comissao").gte("locado_em", inicioIso).lt("locado_em", fimIso).limit(2000),
    supabase.from("locacao_contratos").select("id, valor_aluguel").gte("assinado_em", inicioIso).lt("assinado_em", fimIso).limit(2000),
    contar(supabase.from("locacao_visitas").select("id", { count: "exact", head: true }).gte("criado_em", inicioIso).lt("criado_em", fimIso)),
    supabase.from("locacao_visitas").select("lead_id, corretor_id, horario").eq("data", diaVisitas).order("horario", { ascending: true }).limit(200),
    // Retrato atual do funil (exclui arquivados), paginado para nunca truncar
    (async () => {
      const PAGE = 1000
      const todos: Array<{ status: string | null; temperatura: string | null }> = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("locacao_leads")
          .select("status, temperatura")
          .is("arquivado_em", null)
          .range(from, from + PAGE - 1)
        if (error || !data) break
        todos.push(...data)
        if (data.length < PAGE) break
      }
      return todos
    })(),
  ])

  const novos = novosRes.error ? [] : novosRes.data ?? []
  const locados = locadosRes.error ? [] : locadosRes.data ?? []
  const contratos = contratosRes.error ? [] : contratosRes.data ?? []
  const visitasAgendadasRaw = visitasAgendadasRes.error ? [] : visitasAgendadasRes.data ?? []

  // Nomes dos corretores (novos leads + visitas)
  const idsCorretores = Array.from(
    new Set([...novos.map((n) => n.corretor_id), ...visitasAgendadasRaw.map((v) => v.corretor_id)].filter(Boolean))
  ) as string[]
  const nomes = new Map<string, string>()
  if (idsCorretores.length > 0) {
    const { data: usuarios } = await supabase.from("usuarios").select("id, nome").in("id", idsCorretores)
    for (const u of usuarios ?? []) nomes.set(u.id, u.nome)
  }
  const nomeCorretor = (id: string | null) => (id ? nomes.get(id) ?? "Sem nome" : "Sem corretor")

  const porCorretorMapa = new Map<string, number>()
  for (const n of novos) {
    const nome = nomeCorretor(n.corretor_id)
    porCorretorMapa.set(nome, (porCorretorMapa.get(nome) ?? 0) + 1)
  }
  const novosPorCorretor = Array.from(porCorretorMapa, ([corretorNome, total]) => ({ corretorNome, total })).sort(
    (a, b) => b.total - a.total || a.corretorNome.localeCompare(b.corretorNome, "pt-BR")
  )

  // Nomes dos leads das visitas: só com a opção de LGPD ligada
  const nomesLeads = new Map<string, string>()
  if (opcoes.listarNomesLeads) {
    const idsLeads = Array.from(new Set(visitasAgendadasRaw.map((v) => v.lead_id).filter(Boolean))) as string[]
    if (idsLeads.length > 0) {
      const { data } = await supabase.from("locacao_leads").select("id, nome").in("id", idsLeads)
      for (const l of data ?? []) nomesLeads.set(l.id, l.nome)
    }
  }

  const { funil, temperatura, totalEmAberto } = contarFunil(abertosRes)

  return {
    novosLeads: novos.length,
    novosPorCorretor,
    negociacoesIniciadas,
    locadosNoDia: locados.length,
    comissaoLocadosNoDia: locados.reduce((soma, l) => soma + Number(l.valor_comissao ?? 0), 0),
    contratosAssinados: contratos.length,
    valorAluguelContratos: contratos.reduce((soma, c) => soma + Number(c.valor_aluguel ?? 0), 0),
    visitasRegistradasNoDia,
    diaVisitas,
    visitasAgendadasTotal: visitasAgendadasRaw.length,
    visitasAgendadas: visitasAgendadasRaw.slice(0, 15).map((v) => ({
      horario: v.horario ?? "--:--",
      corretorNome: nomeCorretor(v.corretor_id),
      leadNome: opcoes.listarNomesLeads && v.lead_id ? nomesLeads.get(v.lead_id) ?? null : null,
    })),
    funil,
    temperatura,
    totalEmAberto,
  }
}

/** Data de "hoje" em Brasília (YYYY-MM-DD). */
export function hojeYmdBRT(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE_BRT, year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
}
