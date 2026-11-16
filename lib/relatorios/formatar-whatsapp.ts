// lib/relatorios/formatar-whatsapp.ts
// Formatação determinística e escaneável para envio via WhatsApp

import type { RelatorioDiaDados } from "./montar"
import { formatarDataBr } from "./periodo"
import { ROLES_EQUIPE_LOCACAO, ehPerfilLocacao } from "./secoes"
import { hojeYmdBRT } from "./metricas/locacao"

/**
 * Converte o objeto consolidado de métricas em texto puro para WhatsApp.
 * Respeita as seções ativas, zeros explícitos e diretrizes de privacidade LGPD.
 */
export function formatarRelatorioWhatsApp(dados: RelatorioDiaDados): string {
  const { periodo, secoesAtivas, trafego, automacao, ia, arquivados, tempo, locacao } = dados
  const blocos: string[] = []

  // Quem recebe só Locação vê um relatório de Locação (sem numeração de blocos que não recebe)
  const somenteLocacao = ehPerfilLocacao(secoesAtivas)
  let blocoTempo: string | null = null
  let blocoLocacao: string | null = null

  // Cabeçalho Principal
  blocos.push(
    somenteLocacao
      ? `📊 *Relatório de Locação — ${periodo.dataFormatada}*`
      : `📊 *Relatório Diário do CRM — ${periodo.dataFormatada}*`
  )

  // -------------------------------------------------------------
  // Bloco 1: Tráfego Pago por Corretor
  // -------------------------------------------------------------
  if (secoesAtivas.trafego) {
    const linhas: string[] = [
      `🎯 *1. TRÁFEGO PAGO POR CORRETOR*`,
      `• Novos leads: ${trafego.totalLeadsNovos} (${trafego.totalTelefonesUnicos} contatos únicos)`,
    ]

    if (trafego.porCorretor.length > 0) {
      for (const c of trafego.porCorretor) {
        linhas.push(`  - ${c.corretorNome}: ${c.totalLeads} leads (${c.telefonesUnicos} únicos)`)
      }
    } else {
      linhas.push(`  - Nenhum novo lead registrado no dia`)
    }

    if (trafego.corretoresSemLeads.length > 0) {
      linhas.push(`• Sem leads no dia: ${trafego.corretoresSemLeads.join(", ")}`)
    } else if (trafego.porCorretor.length > 0) {
      linhas.push(`• Sem leads no dia: todos os corretores ativos receberam leads`)
    }

    linhas.push(`• Reengajados via anúncio (leads antigos): ${trafego.reengajadosAnuncioAntigos}`)
    blocos.push(linhas.join("\n"))
  }

  // -------------------------------------------------------------
  // Bloco 2: Automação e Régua de Follow-up
  // -------------------------------------------------------------
  if (secoesAtivas.automacao) {
    const linhas: string[] = [
      `⚡ *2. AUTOMAÇÃO E RÉGUA DE FOLLOW-UP*`,
      `• Disparos realizados: ${automacao.mensagensEnviadas} (para ${automacao.leadsDistintosReceberam} leads distintos)`,
      `• Respostas recebidas: ${automacao.leadsDistintosResponderam} (taxa de resposta: ${automacao.taxaResposta.toFixed(1)}%)`,
      `• Entraram na automação: ${automacao.entraramEmAutomacao}`,
      `• Concluíram a régua: ${automacao.concluiramRegua}`,
      `• Falhas de envio: ${automacao.falhasEnvio}`,
      `• Fila pendente agora: ${automacao.filaPendenteAgora} mensagens`,
    ]

    if (automacao.etapasRegua) {
      linhas.push(`• Por etapa: D+1: ${automacao.etapasRegua.d1} | D+2: ${automacao.etapasRegua.d2} | D+3: ${automacao.etapasRegua.d3}`)
    }

    blocos.push(linhas.join("\n"))
  }

  // -------------------------------------------------------------
  // Bloco 3: Respostas e Atendimento IA
  // -------------------------------------------------------------
  if (secoesAtivas.ia) {
    const linhas: string[] = [
      `🤖 *3. RESPOSTAS E ATENDIMENTO IA*`,
      `• Responderam e foram para IA: ${ia.responderamParaIA}`,
      `• IA assumiu atendimento: ${ia.iaAssumiuAtendimento}`,
      `• IA escalou para humano (handoff): ${ia.iaEscalouParaHumano}`,
      `• Visitas agendadas pela IA: ${ia.visitasAgendadasIA}`,
    ]

    if (ia.porCorretor.length > 0) {
      linhas.push(`• Atendimentos por corretor:`)
      for (const c of ia.porCorretor) {
        linhas.push(`  - ${c.corretorNome}: ${c.leadsAtendidosIA} atendidos${c.visitasAgendadasIA > 0 ? ` (${c.visitasAgendadasIA} visitas)` : ""}`)
      }
    }

    blocos.push(linhas.join("\n"))
  }

  // -------------------------------------------------------------
  // Bloco 4: Leads Arquivados e Reaparecidos
  // -------------------------------------------------------------
  if (secoesAtivas.arquivados) {
    const linhas: string[] = [
      `📦 *4. LEADS ARQUIVADOS E REAPARECIDOS*`,
      `• Arquivados no dia: ${arquivados.totalArquivados} (${arquivados.arquivadosManual} manuais, ${arquivados.arquivadosAutomatico} automáticos)`,
    ]

    if (arquivados.porMotivo.length > 0) {
      const motivosTexto = arquivados.porMotivo.map((m) => `${m.motivo}: ${m.contagem}`).join("; ")
      linhas.push(`  - Motivos: ${motivosTexto}`)
    }

    linhas.push(`• Reaparecidos no dia: ${arquivados.totalReaparecidos}${arquivados.reaparecidosRedistribuidos > 0 ? ` (${arquivados.reaparecidosRedistribuidos} redistribuídos)` : ""}`)
    if (arquivados.conflitosDuplicidade > 0) {
      linhas.push(`• Conflitos de duplicidade evitados: ${arquivados.conflitosDuplicidade}`)
    }
    linhas.push(`• Vão reaparecer hoje: ${arquivados.vaoReaparecerHoje}`)

    if (arquivados.porCorretor.length > 0) {
      linhas.push(`• Movimentação por corretor:`)
      for (const c of arquivados.porCorretor) {
        const partes: string[] = []
        if (c.arquivados > 0) partes.push(`${c.arquivados} arquivados`)
        if (c.reaparecidos > 0) partes.push(`${c.reaparecidos} reaparecidos`)
        linhas.push(`  - ${c.corretorNome}: ${partes.join(", ")}`)
      }
    }

    blocos.push(linhas.join("\n"))
  }

  // -------------------------------------------------------------
  // Bloco 5: Tempo dos Corretores no CRM
  // -------------------------------------------------------------
  if (secoesAtivas.tempo) {
    const titulo = somenteLocacao
      ? `⏱️ *TEMPO DA EQUIPE DE LOCAÇÃO NO CRM*`
      : tempo.incluiuGestores
        ? `⏱️ *5. TEMPO DA EQUIPE NO CRM*`
        : `⏱️ *5. TEMPO DOS CORRETORES NO CRM*`
    const linhas: string[] = [titulo]

    // Relatório de Locação: só a equipe de Locação (nada de corretores de vendas)
    const equipe = somenteLocacao ? tempo.corretores.filter((c) => ROLES_EQUIPE_LOCACAO.includes(c.role)) : tempo.corretores

    if (equipe.length > 0) {
      for (const c of equipe) {
        if (c.acessou && c.duracaoSegundos > 0) {
          const sessoesTxt = c.numeroSessoes === 1 ? "1 sessão" : `${c.numeroSessoes} sessões`
          const janelaTxt = c.primeiroAcesso !== "--:--" ? ` (${c.primeiroAcesso} às ${c.ultimaAtividade})` : ""
          linhas.push(`• ${c.nome}: ${c.tempoTotalFormatado} — ${sessoesTxt}${janelaTxt}`)
        } else {
          linhas.push(`• ${c.nome}: não acessou o CRM`)
        }
      }
    } else {
      linhas.push(somenteLocacao ? `• Nenhum usuário da equipe de Locação registrado` : `• Nenhum usuário ativo registrado`)
    }

    blocoTempo = linhas.join("\n")
  }

  // -------------------------------------------------------------
  // Bloco 6: Locação
  // -------------------------------------------------------------
  if (secoesAtivas.locacao && locacao) {
    const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    const linhas: string[] = [somenteLocacao ? `🏠 *LOCAÇÃO*` : `🏠 *6. LOCAÇÃO*`]

    linhas.push(`• Novos leads de locação: ${locacao.novosLeads}`)
    for (const c of locacao.novosPorCorretor) {
      linhas.push(`  - ${c.corretorNome}: ${c.total}`)
    }
    linhas.push(`• Entraram em negociação: ${locacao.negociacoesIniciadas}`)
    linhas.push(
      `• Locados no dia: ${locacao.locadosNoDia}${locacao.locadosNoDia > 0 && locacao.comissaoLocadosNoDia > 0 ? ` (comissão ${brl(locacao.comissaoLocadosNoDia)})` : ""}`
    )
    linhas.push(
      `• Contratos assinados: ${locacao.contratosAssinados}${locacao.contratosAssinados > 0 && locacao.valorAluguelContratos > 0 ? ` (aluguéis somam ${brl(locacao.valorAluguelContratos)})` : ""}`
    )
    linhas.push(`• Visitas registradas no dia: ${locacao.visitasRegistradasNoDia}`)

    const quando = locacao.diaVisitas && locacao.diaVisitas !== hojeYmdBRT() ? formatarDataBr(locacao.diaVisitas) : "hoje"
    linhas.push(`• Visitas agendadas para ${quando}: ${locacao.visitasAgendadasTotal}`)
    for (const v of locacao.visitasAgendadas) {
      linhas.push(`  - ${v.horario} — ${v.corretorNome}${v.leadNome ? ` com ${v.leadNome}` : ""}`)
    }
    if (locacao.visitasAgendadasTotal > locacao.visitasAgendadas.length) {
      linhas.push(`  - … e mais ${locacao.visitasAgendadasTotal - locacao.visitasAgendadas.length}`)
    }

    const f = locacao.funil
    linhas.push(
      `• Funil em aberto (${locacao.totalEmAberto}): Novo ${f.novo} | Em atendimento ${f.emAtendimento} | Procurando imóvel ${f.procurandoImovel} | Visita agendada ${f.visitaAgendada} | Negociando ${f.negociando}`
    )
    linhas.push(
      `• Temperatura (em aberto): 🔥 ${locacao.temperatura.quente} quentes | ${locacao.temperatura.morno} mornos | ${locacao.temperatura.frio} frios`
    )
    linhas.push(`• Acumulado: ${f.locado} locados | ${f.perdido} perdidos`)

    blocoLocacao = linhas.join("\n")
  }

  // Relatório de Locação mostra a Locação primeiro; no relatório completo, a ordem é 5 (Tempo) e 6 (Locação)
  const finais = somenteLocacao ? [blocoLocacao, blocoTempo] : [blocoTempo, blocoLocacao]
  for (const b of finais) if (b) blocos.push(b)

  // Rodapé
  blocos.push(`_CRM Colucci • Relatório Automático_`)

  return blocos.join("\n\n")
}
