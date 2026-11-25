import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL } from "@/lib/supabase/config"
import { SUPABASE_SERVER_KEY } from "@/lib/supabase/server-key"
import { analisarInstagram, variacaoPct } from "@/lib/instagram/analise"
import { demografiaSeguidores, insightsDaConta, listarContasInstagram, postsComMetricas, serieDiaria, storiesAtivos } from "@/lib/instagram/client"
import { executeMcpTool } from "./mcp-server"
import { classificarCampanhas, limitesDoMes, mesAnterior, periodoAnterior, type CampanhaAuditada } from "./analise-campanhas"
import { gerarAnaliseIA } from "./analise-ia"
import { resolverTokenMeta } from "./token"

const db = () => createClient(SUPABASE_URL, SUPABASE_SERVER_KEY) as unknown as { from: (t: string) => any }

const dias = (since: string, until: string) => Math.round((Date.parse(`${until}T12:00:00Z`) - Date.parse(`${since}T12:00:00Z`)) / 864e5) + 1

/** Auditoria Meta × CRM de um período. Recusa dados simulados (nunca apresentar demonstração como real). */
export async function auditarPeriodo(since: string, until: string) {
  const r = await executeMcpTool("crm_reconciliation_audit", { since, until })
  if (!r || r.fonte === "simulado") throw new Error("A conta da Meta não respondeu com dados reais (token ausente, expirado ou sem acesso à conta de anúncios).")
  return r as { periodo: { since: string; until: string }; resumoExecutivo: Record<string, any>; campanhas: CampanhaAuditada[]; topCorretores: unknown[] }
}

const totaisDe = (r: Awaited<ReturnType<typeof auditarPeriodo>>) => {
  const t = r.resumoExecutivo
  return { gastoTotalMeta: Number(t.gastoTotalMeta ?? 0), leadsReaisNoCrm: Number(t.leadsReaisNoCrm ?? 0), leadsReportadosMeta: Number(t.leadsReportadosMeta ?? 0), visitas: Number(t.visitasAgendadasRealizadas ?? 0), fechamentos: Number(t.fechamentosConcluidos ?? 0), vgv: Number(t.vgvTotalFechado ?? 0), comissao: Number(t.comissaoTotalGerada ?? 0), cplReal: Number(t.cplReal ?? 0), cacReal: Number(t.cacReal ?? 0) }
}

export async function montarAnaliseCampanhas(since: string, until: string) {
  const ant = periodoAnterior(since, until)
  const [atual, anterior] = await Promise.all([auditarPeriodo(since, until), auditarPeriodo(ant.since, ant.until).catch(() => null)])
  const t = totaisDe(atual)
  const tAnt = anterior ? totaisDe(anterior) : null
  const campanhas = classificarCampanhas(atual.campanhas, { gastoTotalMeta: t.gastoTotalMeta, leadsReaisNoCrm: t.leadsReaisNoCrm })
  const comparativo = tAnt
    ? { gasto: variacaoPct(t.gastoTotalMeta, tAnt.gastoTotalMeta), leads: variacaoPct(t.leadsReaisNoCrm, tAnt.leadsReaisNoCrm), cplReal: variacaoPct(t.cplReal, tAnt.cplReal), fechamentos: variacaoPct(t.fechamentos, tAnt.fechamentos), vgv: variacaoPct(t.vgv, tAnt.vgv) }
    : null
  return { periodo: { since, until }, periodoAnterior: ant, totais: t, totaisAnterior: tAnt, comparativo, campanhas }
}

export async function montarAnaliseInstagram(contaId: string | null, since: string, until: string, opcoes: { completo?: boolean } = {}) {
  const token = await resolverTokenMeta()
  if (!token) throw new Error("Meta não conectada.")
  const contas = await listarContasInstagram(token)
  if (!contas.ok) throw new Error(contas.erro)
  const conta = contas.contas.find((c) => c.igId === contaId) ?? contas.contas[0]
  if (!conta) throw new Error("Nenhuma conta do Instagram profissional ligada às Páginas deste token.")
  const n = dias(since, until)
  const ant = periodoAnterior(since, until)
  const janela = (a: string, b: string) => postsComMetricas(token, conta.igId, `${a}T00:00:00-0300`, `${b}T23:59:59-0300`)
  const [posts, insights] = await Promise.all([janela(since, until), insightsDaConta(token, conta.igId, since, until)])
  if (!posts.ok) throw new Error(posts.erro)
  const base = { conta, periodo: { since, until, dias: n }, analise: analisarInstagram(posts.posts, n), insights, posts: posts.posts.length, lista: posts.posts }
  if (!opcoes.completo) return { ...base, anterior: null, comparativo: null, serie: [], demografia: null, stories: [] }

  // Extras da tela: período anterior (para variação), série diária, perfil do público e stories ativos.
  const [postsAnt, insightsAnt, serie, demografia, stories] = await Promise.all([
    janela(ant.since, ant.until).catch(() => null),
    insightsDaConta(token, conta.igId, ant.since, ant.until).catch(() => null),
    serieDiaria(token, conta.igId, since, until).catch(() => []),
    demografiaSeguidores(token, conta.igId).catch(() => null),
    storiesAtivos(token, conta.igId).catch(() => []),
  ])
  const resumoAnt = postsAnt && postsAnt.ok ? analisarInstagram(postsAnt.posts, n).resumo : null
  const r = base.analise.resumo
  const comparativo = resumoAnt ? {
    posts: variacaoPct(r.totalPosts, resumoAnt.totalPosts),
    alcancePosts: variacaoPct(r.alcanceTotal, resumoAnt.alcanceTotal),
    interacoes: variacaoPct(r.interacoesTotal, resumoAnt.interacoesTotal),
    engajamento: variacaoPct(r.taxaEngajamentoMedia, resumoAnt.taxaEngajamentoMedia),
    salvamentos: variacaoPct(r.salvamentos + r.compartilhamentos, resumoAnt.salvamentos + resumoAnt.compartilhamentos),
    alcance: insightsAnt ? variacaoPct(insights.alcance ?? 0, insightsAnt.alcance ?? 0) : null,
    visualizacoes: insightsAnt ? variacaoPct(insights.visualizacoes ?? 0, insightsAnt.visualizacoes ?? 0) : null,
    visitasPerfil: insightsAnt ? variacaoPct(insights.visitasPerfil ?? 0, insightsAnt.visitasPerfil ?? 0) : null,
    novosSeguidores: insightsAnt ? variacaoPct(insights.novosSeguidores ?? 0, insightsAnt.novosSeguidores ?? 0) : null,
  } : null
  return { ...base, anterior: resumoAnt ? { periodo: ant, resumo: resumoAnt } : null, comparativo, serie, demografia, stories }
}

export type TipoRelatorio = "instagram" | "campanhas"

/** Gera (ou regenera) o relatório mensal, com comparação com o mês anterior e análise da IA, e guarda no histórico. */
export async function gerarRelatorioMensal(tipo: TipoRelatorio, mes: string, geradoPor: string) {
  const { since, until } = limitesDoMes(mes)
  const ant = limitesDoMes(mesAnterior(mes))
  let dados: Record<string, unknown>
  if (tipo === "campanhas") {
    dados = await montarAnaliseCampanhas(since, until)
  } else {
    const { lista: _lista, serie: _serie, stories: _stories, demografia: _demo, ...atual } = await montarAnaliseInstagram(null, since, until)
    const anterior = await montarAnaliseInstagram(atual.conta.igId, ant.since, ant.until).catch(() => null)
    const comp = anterior ? {
      posts: variacaoPct(atual.analise.resumo.totalPosts, anterior.analise.resumo.totalPosts),
      alcance: variacaoPct(atual.analise.resumo.alcanceTotal, anterior.analise.resumo.alcanceTotal),
      interacoes: variacaoPct(atual.analise.resumo.interacoesTotal, anterior.analise.resumo.interacoesTotal),
      engajamento: variacaoPct(atual.analise.resumo.taxaEngajamentoMedia, anterior.analise.resumo.taxaEngajamentoMedia),
      seguidoresGanhos: atual.insights.novosSeguidores,
    } : null
    dados = { ...atual, anterior: anterior ? { periodo: anterior.periodo, resumo: anterior.analise.resumo } : null, comparativo: comp }
  }
  const ia = await gerarAnaliseIA(tipo, dados)
  const linha = { tipo, mes, dados, analise: ia.ok ? ia.texto : null, gerado_em: new Date().toISOString(), gerado_por: geradoPor }
  const { error } = await db().from("meta_relatorios").upsert(linha, { onConflict: "tipo,mes" })
  if (error) throw new Error(`Não foi possível salvar o relatório (a migration meta_relatorios foi aplicada?): ${error.message}`)
  return { ...linha, aviso: ia.ok ? undefined : `Relatório salvo sem análise da IA: ${ia.erro}` }
}
