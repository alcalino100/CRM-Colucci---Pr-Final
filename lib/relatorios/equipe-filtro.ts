// lib/relatorios/equipe-filtro.ts
// Filtro de corretores por destinatário: ex. gestor de Vendas só vê Vendas; gestor de Locação só vê Locação.

import { z } from "zod"
import type { RelatorioDiaDados } from "./montar"

export const MODOS_EQUIPE = ["todos", "vendas", "locacao", "selecionados"] as const
export type ModoEquipe = (typeof MODOS_EQUIPE)[number]

export const equipeFiltroSchema = z.object({
  modo: z.enum(MODOS_EQUIPE),
  ids: z.array(z.string()).optional(),
})
export type EquipeFiltro = z.infer<typeof equipeFiltroSchema>

/** "corretor" (genérico) atende Vendas + Locação: entra em Vendas, mas fica fora de Locação (mesma regra do Relatório de Locação). */
export const ROLES_VENDAS: readonly string[] = ["corretor", "corretor_vendas", "gestor_vendas"]
export const ROLES_LOCACAO: readonly string[] = ["corretor_locacao", "gestor_locacao"]

export interface UsuarioEquipe {
  id: string
  nome: string
  role: string
}

export function filtroAtivo(filtro: EquipeFiltro | null | undefined): filtro is EquipeFiltro {
  if (!filtro || filtro.modo === "todos") return false
  if (filtro.modo === "selecionados") return (filtro.ids?.length ?? 0) > 0
  return true
}

export function resumoEquipeFiltro(filtro: EquipeFiltro | null | undefined): string {
  if (!filtro || filtro.modo === "todos") return "Todos os corretores"
  if (filtro.modo === "vendas") return "Só equipe de Vendas"
  if (filtro.modo === "locacao") return "Só equipe de Locação"
  const n = filtro.ids?.length ?? 0
  return n === 1 ? "1 corretor escolhido" : `${n} corretores escolhidos`
}

/** IDs de usuários que o filtro deixa passar (null = sem filtro). */
export function idsPermitidos(filtro: EquipeFiltro | null | undefined, usuarios: UsuarioEquipe[]): Set<string> | null {
  if (!filtroAtivo(filtro)) return null
  if (filtro.modo === "selecionados") return new Set(filtro.ids ?? [])
  const roles = filtro.modo === "vendas" ? ROLES_VENDAS : ROLES_LOCACAO
  return new Set(usuarios.filter((u) => roles.includes(u.role)).map((u) => u.id))
}

/**
 * Recorta os dados do relatório para os corretores permitidos.
 * Totais de tráfego são recalculados a partir dos corretores que sobraram; "reengajados" é um número global
 * (não dá para atribuir a corretor), então fica oculto (null) em relatório filtrado.
 */
export function aplicarFiltroEquipe(
  dados: RelatorioDiaDados,
  filtro: EquipeFiltro | null | undefined,
  usuarios: UsuarioEquipe[]
): RelatorioDiaDados {
  const permitidos = idsPermitidos(filtro, usuarios)
  if (!permitidos) return dados

  const nomesPermitidos = new Set(usuarios.filter((u) => permitidos.has(u.id)).map((u) => u.nome))

  const porCorretor = dados.trafego.porCorretor.filter((c) => permitidos.has(c.corretorId))
  const corretoresSemLeads = dados.trafego.corretoresSemLeads.filter((n) => nomesPermitidos.has(n))

  return {
    ...dados,
    trafego: {
      ...dados.trafego,
      porCorretor,
      corretoresSemLeads,
      totalLeadsNovos: porCorretor.reduce((s, c) => s + c.totalLeads, 0),
      totalTelefonesUnicos: porCorretor.reduce((s, c) => s + c.telefonesUnicos, 0),
      reengajadosAnuncioAntigos: null,
    },
    ia: { ...dados.ia, porCorretor: dados.ia.porCorretor.filter((c) => permitidos.has(c.corretorId)) },
    arquivados: {
      ...dados.arquivados,
      porCorretor: dados.arquivados.porCorretor.filter((c: any) => nomesPermitidos.has(c.corretorNome ?? c.nome)),
    },
    tempo: { ...dados.tempo, corretores: dados.tempo.corretores.filter((c) => permitidos.has(c.usuarioId)) },
  }
}
