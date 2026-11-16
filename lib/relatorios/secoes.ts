// lib/relatorios/secoes.ts
// Blocos (seções) do relatório diário: catálogo, validação e regra de "quem recebe o quê".

import { z } from "zod"

export const CHAVES_SECOES = ["trafego", "automacao", "ia", "arquivados", "tempo", "locacao"] as const
export type ChaveSecao = (typeof CHAVES_SECOES)[number]
export type SecoesAtivasConfig = Record<ChaveSecao, boolean>

/**
 * Padrão da configuração geral. Locação começa DESLIGADA para não mudar o relatório de quem já recebe;
 * é ligada na configuração geral ou, por destinatário, no modal de destinatários.
 */
export const SECOES_PADRAO: SecoesAtivasConfig = {
  trafego: true,
  automacao: true,
  ia: true,
  arquivados: true,
  tempo: true,
  locacao: false,
}

export interface InfoSecao {
  key: ChaveSecao
  label: string
  desc: string
}

/** Catálogo único usado pela tela (configuração e modal) e pelas mensagens. */
export const CATALOGO_SECOES: readonly InfoSecao[] = [
  { key: "trafego", label: "1. Tráfego Pago por Corretor", desc: "Leads do tráfego pago, contatos únicos e corretores sem leads." },
  { key: "automacao", label: "2. Automação e Follow-up", desc: "Disparos, respostas recebidas, taxa e fila atual." },
  { key: "ia", label: "3. Respostas e Atendimento IA", desc: "IA assumiu, handoffs para humanos e visitas agendadas." },
  { key: "arquivados", label: "4. Arquivados e Reaparecidos", desc: "Eventos de auditoria, motivos e retorno de hibernação." },
  { key: "tempo", label: "5. Tempo da Equipe no CRM", desc: "União de intervalos recortados e sessões por corretor." },
  { key: "locacao", label: "6. Locação", desc: "Novos leads, negociações, locados, comissão, visitas de hoje, funil e temperatura." },
]

/** Validação (todas as chaves opcionais, para aceitar configurações antigas sem "locacao"). */
export const secoesSchema = z.object({
  trafego: z.boolean().optional(),
  automacao: z.boolean().optional(),
  ia: z.boolean().optional(),
  arquivados: z.boolean().optional(),
  tempo: z.boolean().optional(),
  locacao: z.boolean().optional(),
})

function todas(valor: boolean): SecoesAtivasConfig {
  return Object.fromEntries(CHAVES_SECOES.map((k) => [k, valor])) as SecoesAtivasConfig
}

/** Atalho do modal: só Locação (todas as outras explicitamente desligadas). */
export const SECOES_SOMENTE_LOCACAO: SecoesAtivasConfig = { ...todas(false), locacao: true }
/** Atalho do modal: todos os blocos. */
export const SECOES_TODAS: SecoesAtivasConfig = todas(true)

/** Configuração geral + ajustes do destinatário (null = segue a configuração geral). */
export function secoesEfetivas(
  geral: Partial<SecoesAtivasConfig> | null | undefined,
  destinatario: Partial<SecoesAtivasConfig> | null | undefined
): SecoesAtivasConfig {
  return { ...SECOES_PADRAO, ...(geral ?? {}), ...(destinatario ?? {}) }
}

/**
 * Blocos que precisam ter os dados coletados: a união do que cada destinatário vai receber.
 * Sem isso, um destinatário que liga "Locação" só para si receberia o bloco vazio, porque a coleta
 * olhava apenas a configuração geral.
 */
export function secoesNecessarias(
  geral: Partial<SecoesAtivasConfig> | null | undefined,
  destinatarios: Array<{ secoes?: Partial<SecoesAtivasConfig> | null }>
): SecoesAtivasConfig {
  if (destinatarios.length === 0) return secoesEfetivas(geral, null)
  const uniao = todas(false)
  for (const d of destinatarios) {
    const efetivas = secoesEfetivas(geral, d.secoes)
    for (const k of CHAVES_SECOES) if (efetivas[k]) uniao[k] = true
  }
  return uniao
}

/** Texto curto para a lista de destinatários (o modal grava todas as chaves, então só contam as marcadas). */
export function resumoSecoesDestinatario(secoes: Partial<SecoesAtivasConfig> | null | undefined): string {
  if (!secoes || Object.keys(secoes).length === 0) return "Padrão da configuração"
  const ligadas = CHAVES_SECOES.filter((k) => secoes[k] === true)
  if (ligadas.length === 1 && ligadas[0] === "locacao") return "Somente Locação"
  if (ligadas.length === CHAVES_SECOES.length) return "Todos os blocos"
  if (ligadas.length === 0) return "Nenhum bloco"
  return ligadas.length === 1 ? "1 bloco" : `${ligadas.length} blocos`
}
