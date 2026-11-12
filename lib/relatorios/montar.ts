// lib/relatorios/montar.ts
// Consolidação dos 5 blocos de métricas para o relatório diário

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"
import { type PeriodoDiaBRT, limitesDiaAnteriorBRT, limitesDiaBRT } from "./periodo"
import { coletarMetricasTrafego, type MetricasTrafegoPago } from "./metricas/trafego"
import { coletarMetricasAutomacao, type MetricasAutomacao } from "./metricas/automacao"
import { coletarMetricasIA, type MetricasIA } from "./metricas/ia"
import { coletarMetricasArquivados, type MetricasArquivados } from "./metricas/arquivados"
import { coletarMetricasTempo, type MetricasTempoCRM } from "./metricas/tempo"

export interface SecoesAtivasConfig {
  trafego: boolean
  automacao: boolean
  ia: boolean
  arquivados: boolean
  tempo: boolean
}

export const SECOES_PADRAO: SecoesAtivasConfig = {
  trafego: true,
  automacao: true,
  ia: true,
  arquivados: true,
  tempo: true,
}

export interface RelatorioDiaDados {
  periodo: PeriodoDiaBRT
  secoesAtivas: SecoesAtivasConfig
  opcoes: {
    incluirGestoresNoTempo: boolean
    listarNomesLeads: boolean
  }
  trafego: MetricasTrafegoPago
  automacao: MetricasAutomacao
  ia: MetricasIA
  arquivados: MetricasArquivados
  tempo: MetricasTempoCRM
  geradoEmIso: string
}

export async function consolidarRelatorioDia(
  supabase: SupabaseClient<Database>,
  periodoInput?: PeriodoDiaBRT | string,
  opcoesInput?: {
    secoes?: Partial<SecoesAtivasConfig>
    incluirGestoresNoTempo?: boolean
    listarNomesLeads?: boolean
  }
): Promise<RelatorioDiaDados> {
  let periodo: PeriodoDiaBRT
  if (!periodoInput) {
    periodo = limitesDiaAnteriorBRT()
  } else if (typeof periodoInput === "string") {
    periodo = limitesDiaBRT(periodoInput)
  } else {
    periodo = periodoInput
  }

  const secoesAtivas: SecoesAtivasConfig = {
    ...SECOES_PADRAO,
    ...(opcoesInput?.secoes ?? {}),
  }

  const opcoes = {
    incluirGestoresNoTempo: Boolean(opcoesInput?.incluirGestoresNoTempo),
    listarNomesLeads: Boolean(opcoesInput?.listarNomesLeads),
  }

  // Coleta paralela de todos os blocos com tolerância a falhas
  const [trafego, automacao, ia, arquivados, tempo] = await Promise.all([
    secoesAtivas.trafego
      ? coletarMetricasTrafego(supabase, periodo)
      : Promise.resolve({
          totalLeadsNovos: 0,
          totalTelefonesUnicos: 0,
          porCorretor: [],
          corretoresSemLeads: [],
          reengajadosAnuncioAntigos: 0,
        }),
    secoesAtivas.automacao
      ? coletarMetricasAutomacao(supabase, periodo)
      : Promise.resolve({
          mensagensEnviadas: 0,
          leadsDistintosReceberam: 0,
          leadsDistintosResponderam: 0,
          taxaResposta: 0,
          entraramEmAutomacao: 0,
          concluiramRegua: 0,
          falhasEnvio: 0,
          filaPendenteAgora: 0,
        }),
    secoesAtivas.ia
      ? coletarMetricasIA(supabase, periodo)
      : Promise.resolve({
          responderamParaIA: 0,
          iaAssumiuAtendimento: 0,
          iaEscalouParaHumano: 0,
          visitasAgendadasIA: 0,
          porCorretor: [],
        }),
    secoesAtivas.arquivados
      ? coletarMetricasArquivados(supabase, periodo)
      : Promise.resolve({
          totalArquivados: 0,
          arquivadosManual: 0,
          arquivadosAutomatico: 0,
          porMotivo: [],
          totalReaparecidos: 0,
          reaparecidosRedistribuidos: 0,
          conflitosDuplicidade: 0,
          porCorretor: [],
          vaoReaparecerHoje: 0,
        }),
    secoesAtivas.tempo
      ? coletarMetricasTempo(supabase, periodo, { incluirGestores: opcoes.incluirGestoresNoTempo })
      : Promise.resolve({
          corretores: [],
          incluiuGestores: opcoes.incluirGestoresNoTempo,
        }),
  ])

  return {
    periodo,
    secoesAtivas,
    opcoes,
    trafego,
    automacao,
    ia,
    arquivados,
    tempo,
    geradoEmIso: new Date().toISOString(),
  }
}
