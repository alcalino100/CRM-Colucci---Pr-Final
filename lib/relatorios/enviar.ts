// lib/relatorios/enviar.ts
// Lógica de envio e gravação de histórico de relatórios com idempotência

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"
import { sendWhatsAppText } from "@/lib/whatsapp/server"
import { logger } from "@/lib/logger"
import { consolidarRelatorioDia, type RelatorioDiaDados, type SecoesAtivasConfig } from "./montar"
import { formatarRelatorioWhatsApp } from "./formatar-whatsapp"
import type { PeriodoDiaBRT } from "./periodo"

export interface DestinatarioRelatorio {
  id: string
  nome: string
  tipo: "numero" | "grupo"
  destino: string // Telefone com DDI 55 ou JID @g.us
  ativo: boolean
  secoes?: Partial<SecoesAtivasConfig> | null
}

export interface EnvioResultado {
  ok: boolean
  status: "enviado" | "falhou" | "pulado"
  erro?: string
  destinatarioNome: string
  destino: string
  envioId?: string
}

/**
 * Envia o relatório diário para um destinatário específico e registra no banco.
 */
export async function enviarRelatorioParaDestinatario(
  supabase: SupabaseClient<Database>,
  params: {
    destinatario: DestinatarioRelatorio
    instanceName: string
    origem: "automatico" | "teste" | "reenvio"
    dadosConsolidados?: RelatorioDiaDados
    periodo?: PeriodoDiaBRT
    configSecoes?: SecoesAtivasConfig
    incluirGestoresNoTempo?: boolean
    listarNomesLeads?: boolean
  }
): Promise<EnvioResultado> {
  const { destinatario, instanceName, origem } = params

  // 1. Obter dados consolidados (se não passados prontos)
  let dados = params.dadosConsolidados
  if (!dados) {
    dados = await consolidarRelatorioDia(supabase, params.periodo, {
      secoes: destinatario.secoes ?? params.configSecoes,
      incluirGestoresNoTempo: params.incluirGestoresNoTempo,
      listarNomesLeads: params.listarNomesLeads,
    })
  } else if (destinatario.secoes) {
    // Se o destinatário possui overrides de seções, reconfigurar para ele
    dados = {
      ...dados,
      secoesAtivas: {
        ...dados.secoesAtivas,
        ...destinatario.secoes,
      },
    }
  }

  const dataReferencia = dados.periodo.ymd

  // 2. Verificação de IDEMPOTÊNCIA para envios automáticos
  if (origem === "automatico") {
    const { data: jaEnviado } = await supabase
      .from("relatorio_envios")
      .select("id")
      .eq("data_referencia", dataReferencia)
      .eq("destinatario_id", destinatario.id)
      .eq("origem", "automatico")
      .eq("status", "enviado")
      .maybeSingle()

    if (jaEnviado) {
      logger.info("Envio de relatório automático pulado por idempotência (já enviado)", {
        destinatarioId: destinatario.id,
        dataReferencia,
      })
      return {
        ok: true,
        status: "pulado",
        destinatarioNome: destinatario.nome,
        destino: destinatario.destino,
      }
    }
  }

  // 3. Formatar mensagem WhatsApp
  const texto = formatarRelatorioWhatsApp(dados)

  const secoesEnviadas: string[] = Object.entries(dados.secoesAtivas)
    .filter(([_, ativo]) => Boolean(ativo))
    .map(([chave]) => chave)

  // 4. Snapshot estruturado das métricas numéricas
  const metricasSnapshot = {
    trafego: {
      novosLeads: dados.trafego.totalLeadsNovos,
      telefonesUnicos: dados.trafego.totalTelefonesUnicos,
      reengajados: dados.trafego.reengajadosAnuncioAntigos,
    },
    automacao: {
      mensagensEnviadas: dados.automacao.mensagensEnviadas,
      respostasRecebidas: dados.automacao.leadsDistintosResponderam,
      taxaResposta: dados.automacao.taxaResposta,
      filaPendente: dados.automacao.filaPendenteAgora,
    },
    ia: {
      atendimentosIA: dados.ia.responderamParaIA,
      iaAssumiu: dados.ia.iaAssumiuAtendimento,
      visitasAgendadas: dados.ia.visitasAgendadasIA,
    },
    arquivados: {
      arquivados: dados.arquivados.totalArquivados,
      reaparecidos: dados.arquivados.totalReaparecidos,
      vaoReaparecerHoje: dados.arquivados.vaoReaparecerHoje,
    },
    tempo: {
      totalCorretores: dados.tempo.corretores.length,
      ativosNoCrm: dados.tempo.corretores.filter((c) => c.acessou).length,
    },
  }

  // 5. Enviar via Evolution API
  let status: "enviado" | "falhou" = "enviado"
  let erroMsg: string | null = null

  try {
    const envioWhats = await sendWhatsAppText(instanceName, destinatario.destino, texto)
    if (!envioWhats.ok) {
      status = "falhou"
      erroMsg = envioWhats.erro || "Falha desconhecida no envio da mensagem"
      logger.error("Erro ao enviar relatório no WhatsApp", {
        destinatarioId: destinatario.id,
        instanceName,
        erro: erroMsg,
      })
    } else {
      logger.info("Relatório WhatsApp enviado com sucesso", {
        destinatarioId: destinatario.id,
        dataReferencia,
        origem,
      })
    }
  } catch (err) {
    status = "falhou"
    erroMsg = err instanceof Error ? err.message : String(err)
    logger.error("Exceção ao disparar relatório no WhatsApp", {
      destinatarioId: destinatario.id,
      erro: erroMsg,
    })
  }

  // 6. Gravar histórico e snapshot no banco
  let envioId: string | undefined
  try {
    const { data: insertData, error: insertError } = await supabase
      .from("relatorio_envios")
      .insert({
        data_referencia: dataReferencia,
        destinatario_id: destinatario.id,
        instance_name: instanceName,
        origem,
        status,
        erro: erroMsg,
        texto,
        secoes_enviadas: secoesEnviadas,
        metricas: metricasSnapshot,
        enviado_em: new Date().toISOString(),
      })
      .select("id")
      .maybeSingle()

    if (insertError) {
      logger.error("Erro ao registrar auditoria de relatorio_envios", { error: insertError.message })
    } else if (insertData) {
      envioId = (insertData as { id: string }).id
    }
  } catch (e) {
    logger.error("Exceção ao gravar auditoria do envio de relatório", { error: String(e) })
  }

  return {
    ok: status === "enviado",
    status,
    erro: erroMsg || undefined,
    destinatarioNome: destinatario.nome,
    destino: destinatario.destino,
    envioId,
  }
}
