// lib/relatorios/formatar-whatsapp.ts
// Formatação determinística e escaneável para envio via WhatsApp

import type { RelatorioDiaDados } from "./montar"

/**
 * Converte o objeto consolidado de métricas em texto puro para WhatsApp.
 * Respeita as seções ativas, zeros explícitos e diretrizes de privacidade LGPD.
 */
export function formatarRelatorioWhatsApp(dados: RelatorioDiaDados): string {
  const { periodo, secoesAtivas, trafego, automacao, ia, arquivados, tempo } = dados
  const blocos: string[] = []

  // Cabeçalho Principal
  blocos.push(`📊 *Relatório Diário do CRM — ${periodo.dataFormatada}*`)

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
    const titulo = tempo.incluiuGestores ? `⏱️ *5. TEMPO DA EQUIPE NO CRM*` : `⏱️ *5. TEMPO DOS CORRETORES NO CRM*`
    const linhas: string[] = [titulo]

    if (tempo.corretores.length > 0) {
      for (const c of tempo.corretores) {
        if (c.acessou && c.duracaoSegundos > 0) {
          const sessoesTxt = c.numeroSessoes === 1 ? "1 sessão" : `${c.numeroSessoes} sessões`
          const janelaTxt = c.primeiroAcesso !== "--:--" ? ` (${c.primeiroAcesso} às ${c.ultimaAtividade})` : ""
          linhas.push(`• ${c.nome}: ${c.tempoTotalFormatado} — ${sessoesTxt}${janelaTxt}`)
        } else {
          linhas.push(`• ${c.nome}: não acessou o CRM`)
        }
      }
    } else {
      linhas.push(`• Nenhum usuário ativo registrado`)
    }

    blocos.push(linhas.join("\n"))
  }

  // Rodapé
  blocos.push(`_CRM Colucci • Relatório Automático_`)

  return blocos.join("\n\n")
}
