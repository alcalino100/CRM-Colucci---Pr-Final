// lib/relatorios/metricas/tempo.ts
// Bloco 5: Tempo de permanência de cada corretor no CRM (União de intervalos recortados no dia BRT)

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"
import { type PeriodoDiaBRT, formatarHoraMinutoBr } from "../periodo"

export interface IntervaloTempo {
  inicio: string | Date | number
  fim: string | Date | number
}

export interface CorretorTempoResumo {
  usuarioId: string
  nome: string
  role: string
  acessou: boolean
  tempoTotalFormatado: string // ex.: "3h12", "45m" ou "não acessou o CRM"
  duracaoSegundos: number // Duração exata desduplicada
  somaBrutaSegundos: number // Soma dos registros individuais para comparação/auditoria
  numeroSessoes: number
  primeiroAcesso: string // HH:mm no fuso BRT ou "--:--"
  ultimaAtividade: string // HH:mm no fuso BRT ou "--:--"
}

export interface MetricasTempoCRM {
  corretores: CorretorTempoResumo[]
  incluiuGestores: boolean
}

/**
 * Função pura que calcula a UNIÃO de intervalos recortados dentro de uma janela [inicioJanela, fimJanela).
 * Intervalos sobrepostos ou contíguos são mesclados, evitando dupla contagem de abas simultâneas.
 */
export function uniaoIntervalosSegundos(
  intervalos: IntervaloTempo[],
  janela?: { inicio: string | Date | number; fim: string | Date | number }
): number {
  if (!intervalos || intervalos.length === 0) return 0

  const janelaInicioMs = janela ? new Date(janela.inicio).getTime() : -Infinity
  const janelaFimMs = janela ? new Date(janela.fim).getTime() : Infinity

  // 1. Recortar e filtrar intervalos válidos
  const recortados: Array<{ start: number; end: number }> = []

  for (const item of intervalos) {
    const rawStart = new Date(item.inicio).getTime()
    const rawEnd = new Date(item.fim).getTime()

    if (isNaN(rawStart) || isNaN(rawEnd)) continue

    const start = Math.max(rawStart, janelaInicioMs)
    const end = Math.min(rawEnd, janelaFimMs)

    if (end > start) {
      recortados.push({ start, end })
    }
  }

  if (recortados.length === 0) return 0

  // 2. Ordenar por início ascendente
  recortados.sort((a, b) => a.start - b.start || a.end - b.end)

  // 3. Mesclar intervalos sobrepostos
  const merged: Array<{ start: number; end: number }> = []
  let current = recortados[0]

  for (let i = 1; i < recortados.length; i++) {
    const next = recortados[i]
    if (next.start <= current.end) {
      // Sobreposição ou adjacência: expande o fim
      current.end = Math.max(current.end, next.end)
    } else {
      merged.push(current)
      current = next
    }
  }
  merged.push(current)

  // 4. Somar milissegundos totais
  const totalMs = merged.reduce((sum, item) => sum + (item.end - item.start), 0)
  return Math.round(totalMs / 1000)
}

/**
 * Formata segundos em texto amigável: "3h12", "45m" ou "não acessou o CRM".
 */
export function formatarTempoSegundos(segundos: number): string {
  if (!segundos || segundos <= 0) return "não acessou o CRM"

  if (segundos < 60) return "1m" // Menos de 1 minuto arredonda para 1m

  const totalMinutos = Math.floor(segundos / 60)
  const horas = Math.floor(totalMinutos / 60)
  const minutos = totalMinutos % 60

  if (horas === 0) {
    return `${minutos}m`
  }

  return `${horas}h${String(minutos).padStart(2, "0")}`
}

/**
 * Coleta métricas de tempo no CRM de todos os corretores ativos (e opcionalmente gestores).
 */
export async function coletarMetricasTempo(
  supabase: SupabaseClient<Database>,
  periodo: PeriodoDiaBRT,
  opcoes: { incluirGestores?: boolean } = {}
): Promise<MetricasTempoCRM> {
  const { inicioIso, fimIso } = periodo
  const incluirGestores = Boolean(opcoes.incluirGestores)

  // 1. Roles elegíveis
  const rolesElegiveis = ["corretor", "corretor_vendas", "corretor_locacao"]
  if (incluirGestores) {
    rolesElegiveis.push("gestor", "gestor_master", "gestor_vendas", "gestor_locacao")
  }

  // 2. Buscar usuários ativos elegíveis
  const { data: usuariosData } = await supabase
    .from("usuarios")
    .select("id, nome, role, status")
    .eq("status", "ativo")
    .in("role", rolesElegiveis)
    .order("nome")

  const usuarios = usuariosData ?? []

  // 3. Buscar sessões no período [inicioIso, fimIso)
  // inicio_em < fimIso AND (fim_em > inicioIso OR (fim_em is null AND atualizado_em > inicioIso))
  const { data: sessoesData } = await supabase
    .from("crm_sessoes")
    .select("id, user_id, inicio_em, fim_em, duracao_seg, atualizado_em")
    .lt("inicio_em", fimIso)
    .gte("atualizado_em", inicioIso)
    .limit(10000)

  const sessoesPorUsuario = new Map<string, Array<{
    inicio_em: string
    fim_em: string | null
    atualizado_em: string
    duracao_seg: number
  }>>()

  for (const s of sessoesData ?? []) {
    const list = sessoesPorUsuario.get(s.user_id) || []
    list.push(s)
    sessoesPorUsuario.set(s.user_id, list)
  }

  // 4. Calcular métricas para cada usuário
  const corretores: CorretorTempoResumo[] = []

  for (const u of usuarios) {
    const sessoesDoUsuario = sessoesPorUsuario.get(u.id) || []

    const intervalos: IntervaloTempo[] = []
    let somaBrutaSegundos = 0
    let minInicioIso: string | null = null
    let maxFimIso: string | null = null

    for (const sessao of sessoesDoUsuario) {
      const fimEfetivo = sessao.fim_em || sessao.atualizado_em || sessao.inicio_em
      intervalos.push({
        inicio: sessao.inicio_em,
        fim: fimEfetivo,
      })
      somaBrutaSegundos += sessao.duracao_seg || 0

      // Limites visíveis no dia
      if (sessao.inicio_em >= inicioIso && sessao.inicio_em < fimIso) {
        if (!minInicioIso || sessao.inicio_em < minInicioIso) {
          minInicioIso = sessao.inicio_em
        }
      }

      if (fimEfetivo >= inicioIso && fimEfetivo <= fimIso) {
        if (!maxFimIso || fimEfetivo > maxFimIso) {
          maxFimIso = fimEfetivo
        }
      }
    }

    const duracaoSegundos = uniaoIntervalosSegundos(intervalos, {
      inicio: inicioIso,
      fim: fimIso,
    })

    const acessou = duracaoSegundos > 0 || sessoesDoUsuario.length > 0
    const tempoTotalFormatado = formatarTempoSegundos(duracaoSegundos)

    corretores.push({
      usuarioId: u.id,
      nome: u.nome,
      role: u.role,
      acessou,
      tempoTotalFormatado,
      duracaoSegundos,
      somaBrutaSegundos,
      numeroSessoes: sessoesDoUsuario.length,
      primeiroAcesso: minInicioIso ? formatarHoraMinutoBr(minInicioIso) : "--:--",
      ultimaAtividade: maxFimIso ? formatarHoraMinutoBr(maxFimIso) : "--:--",
    })
  }

  // Ordenar: primeiro quem acessou mais tempo, depois quem não acessou por nome alfabético
  corretores.sort((a, b) => {
    if (a.duracaoSegundos !== b.duracaoSegundos) {
      return b.duracaoSegundos - a.duracaoSegundos
    }
    return a.nome.localeCompare(b.nome)
  })

  return {
    corretores,
    incluiuGestores: incluirGestores,
  }
}
