// lib/relatorios/agendador.ts
// Motor de agendamento e decisão de disparo diário do relatório às 08:00 BRT

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"
import { logger } from "@/lib/logger"
import { type PeriodoDiaBRT, limitesDiaAnteriorBRT, TIMEZONE_BRT } from "./periodo"
import { consolidarRelatorioDia } from "./montar"
import { secoesNecessarias, type SecoesAtivasConfig } from "./secoes"
import { enviarRelatorioParaDestinatario, type DestinatarioRelatorio, type EnvioResultado } from "./enviar"

export interface ResultadoDisparoRelatorios {
  ok: boolean
  disparado: boolean
  motivo?: string
  erro?: string
  totalDestinatarios?: number
  enviados?: number
  falhas?: number
  pulados?: number
  detalhes?: EnvioResultado[]
}

/**
 * Retorna o dia da semana atual no fuso de Brasília (0=Domingo, 1=Segunda, ..., 6=Sábado).
 */
export function getDiaSemanaBRT(now = new Date()): number {
  const str = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE_BRT,
    weekday: "short",
  }).format(now)

  switch (str.toLowerCase()) {
    case "sun": return 0
    case "mon": return 1
    case "tue": return 2
    case "wed": return 3
    case "thu": return 4
    case "fri": return 5
    case "sat": return 6
    default: return 0
  }
}

/**
 * Retorna o horário atual HH:mm no fuso de Brasília.
 */
export function getHoraMinutoBRT(now = new Date()): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIMEZONE_BRT,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now)
}

// O CRM grava o status da instância como "conectado"; "open"/"connected" são os nomes da Evolution API.
export const STATUS_INSTANCIA_CONECTADA = ["conectado", "open", "connected"] as const

/**
 * Instância usada no envio: a escolhida na configuração; sem escolha, a primeira conectada.
 * (Antes o plano B só aceitava "open"/"connected", nunca achava nenhuma e o relatório não saía.)
 */
export async function resolverInstanciaEnvio(
  supabase: SupabaseClient<Database>,
  instanciaConfigurada: string | null | undefined
): Promise<string | null> {
  if (instanciaConfigurada) return instanciaConfigurada

  const { data: insts } = await supabase
    .from("whatsapp_instancias")
    .select("instance_name, status")
    .in("status", [...STATUS_INSTANCIA_CONECTADA])
    .order("criado_em", { ascending: true })
    .limit(1)

  return insts && insts.length > 0 ? insts[0].instance_name : null
}

/**
 * Executa o fluxo de disparo diário de relatórios no WhatsApp.
 */
export async function executarDisparoAutomaticoRelatorios(
  supabase: SupabaseClient<Database>,
  options: {
    forcarDisparo?: boolean
    periodoCustomizado?: PeriodoDiaBRT
  } = {}
): Promise<ResultadoDisparoRelatorios> {
  const forcar = Boolean(options.forcarDisparo)
  const periodo = options.periodoCustomizado ?? limitesDiaAnteriorBRT()

  // 1. Carregar configuração geral
  const { data: configData, error: configError } = await supabase
    .from("relatorio_config")
    .select("*")
    .eq("id", "main")
    .maybeSingle()

  if (configError) {
    logger.error("Erro ao ler relatorio_config", { error: configError.message })
    return { ok: false, disparado: false, erro: configError.message }
  }

  const config = configData ?? {
    ativo: true,
    hora_envio: "08:00",
    dias_semana: [0, 1, 2, 3, 4, 5, 6],
    instance_name: null,
    secoes: { trafego: true, automacao: true, ia: true, arquivados: true, tempo: true },
    incluir_gestores_no_tempo: false,
    listar_nomes_leads: false,
    limite_tentativa: "12:00",
  }

  if (!config.ativo && !forcar) {
    return { ok: true, disparado: false, motivo: "Relatórios automáticos desativados na configuração" }
  }

  // 2. Verificar dia da semana (se não forçado)
  const diaSemanaHoje = getDiaSemanaBRT()
  const diasPermitidos = Array.isArray(config.dias_semana) ? config.dias_semana : [0, 1, 2, 3, 4, 5, 6]
  if (!diasPermitidos.includes(diaSemanaHoje) && !forcar) {
    return {
      ok: true,
      disparado: false,
      motivo: `Dia da semana (${diaSemanaHoje}) não está configurado para envio de relatórios`,
    }
  }

  // 3. Resolver instância de envio
  const instanceName = await resolverInstanciaEnvio(supabase, config.instance_name)

  if (!instanceName) {
    const msg = "Nenhuma instância WhatsApp conectada para disparo do relatório diário"
    logger.error(msg)
    return { ok: false, disparado: false, erro: msg }
  }

  // 4. Buscar destinatários ativos
  const { data: destinatariosData, error: destError } = await supabase
    .from("relatorio_destinatarios")
    .select("id, nome, tipo, destino, ativo, secoes")
    .eq("ativo", true)

  if (destError) {
    logger.error("Erro ao buscar relatorio_destinatarios", { error: destError.message })
    return { ok: false, disparado: false, erro: destError.message }
  }

  const destinatarios = (destinatariosData ?? []) as DestinatarioRelatorio[]
  if (destinatarios.length === 0) {
    return { ok: true, disparado: false, motivo: "Nenhum destinatário ativo configurado" }
  }

  // 5. Consolidar os dados do período
  const dadosConsolidados = await consolidarRelatorioDia(supabase, periodo, {
    // Coleta os blocos que ALGUM destinatário recebe (não só os da configuração geral)
    secoes: secoesNecessarias(
      config.secoes as Partial<SecoesAtivasConfig> | null,
      destinatarios as Array<{ secoes?: Partial<SecoesAtivasConfig> | null }>
    ),
    incluirGestoresNoTempo: Boolean(config.incluir_gestores_no_tempo),
    listarNomesLeads: Boolean(config.listar_nomes_leads),
  })

  // 6. Realizar envio para cada destinatário
  const detalhes: EnvioResultado[] = []
  let enviados = 0
  let falhas = 0
  let pulados = 0

  for (const dest of destinatarios) {
    const res = await enviarRelatorioParaDestinatario(supabase, {
      destinatario: dest,
      instanceName,
      origem: forcar ? "teste" : "automatico",
      dadosConsolidados,
      secoesGerais: config.secoes as Partial<SecoesAtivasConfig> | null,
    })

    detalhes.push(res)
    if (res.status === "enviado") enviados++
    else if (res.status === "pulado") pulados++
    else falhas++
  }

  logger.info("Ciclo de envio de relatórios diários concluído", {
    dataReferencia: periodo.ymd,
    total: destinatarios.length,
    enviados,
    pulados,
    falhas,
  })

  return {
    ok: falhas === 0,
    disparado: true,
    totalDestinatarios: destinatarios.length,
    enviados,
    falhas,
    pulados,
    detalhes,
  }
}
