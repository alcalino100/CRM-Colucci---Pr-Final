// Resgate de mensagens perdidas.
//
// Quando uma instância fica "conectada" mas muda (webhook perdido, sessão travada), as mensagens do
// período NÃO chegam ao CRM e os leads de anúncio somem. Este módulo busca na própria Evolution o que
// foi recebido no intervalo e reprocessa pelo MESMO caminho do webhook (idempotente por mensagem_id,
// então rodar de novo não duplica). No resgate a IA NÃO responde (semIA): são conversas antigas.

import { evolutionConfig } from "@/lib/whatsapp/server"
import { handleMessageUpsert } from "@/lib/whatsapp-webhook/inbound-handler"
import { logger } from "@/lib/logger"

export const RESGATE_MAX_PAGINAS = 20
export const RESGATE_TAMANHO_PAGINA = 100
export const RESGATE_MAX_DIAS = 7

export interface ResultadoResgate {
  instanceName: string
  desde: string
  paginasLidas: number
  encontradas: number
  processadas: number
  ignoradas: number
  erros: number
  truncado: boolean
  erro?: string
}

/** Extrai a lista de mensagens de formatos variados de resposta da Evolution (v2.x). */
export function extrairRegistros(json: unknown): { registros: Record<string, unknown>[]; totalPaginas: number } {
  const j = json as any
  const bloco = j?.messages ?? j
  const lista: unknown = Array.isArray(bloco) ? bloco : bloco?.records ?? bloco?.messages ?? []
  const registros = Array.isArray(lista) ? (lista as Record<string, unknown>[]) : []
  const totalPaginas = Number(bloco?.pages ?? j?.pages ?? 1) || 1
  return { registros, totalPaginas }
}

/** Mensagem recebida de contato individual (ignora enviadas por nós, grupos e transmissões). */
export function deveReprocessar(registro: Record<string, unknown>): boolean {
  const key = (registro?.key ?? {}) as Record<string, unknown>
  if (key.fromMe === true) return false
  const jid = String(key.remoteJid ?? registro?.remoteJid ?? "")
  if (!jid || jid.includes("@g.us") || jid.includes("broadcast") || jid.includes("status@")) return false
  return true
}

export function limitarDesde(desde: Date, agora = new Date()): Date {
  const minimo = new Date(agora.getTime() - RESGATE_MAX_DIAS * 86400_000)
  return desde < minimo ? minimo : desde
}

async function buscarPagina(instanceName: string, desdeSeg: number, pagina: number): Promise<{ registros: Record<string, unknown>[]; totalPaginas: number } | null> {
  const cfg = evolutionConfig()
  if (!cfg.ok) return null
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 20000)
  try {
    const res = await fetch(`${cfg.url}/chat/findMessages/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.key },
      body: JSON.stringify({
        where: { key: { fromMe: false }, messageTimestamp: { gte: desdeSeg } },
        page: pagina,
        offset: RESGATE_TAMANHO_PAGINA,
      }),
      signal: ac.signal,
    })
    if (!res.ok) return null
    return extrairRegistros(await res.json().catch(() => null))
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function resgatarMensagens(instanceName: string, desde: Date): Promise<ResultadoResgate> {
  const inicio = limitarDesde(desde)
  const desdeSeg = Math.floor(inicio.getTime() / 1000)
  const resultado: ResultadoResgate = {
    instanceName,
    desde: inicio.toISOString(),
    paginasLidas: 0,
    encontradas: 0,
    processadas: 0,
    ignoradas: 0,
    erros: 0,
    truncado: false,
  }

  if (!evolutionConfig().ok) return { ...resultado, erro: "Evolution não configurada" }

  let totalPaginas = 1
  for (let pagina = 1; pagina <= Math.min(totalPaginas, RESGATE_MAX_PAGINAS); pagina++) {
    const lote = await buscarPagina(instanceName, desdeSeg, pagina)
    if (!lote) {
      return { ...resultado, erro: pagina === 1 ? "Evolution não respondeu à busca de mensagens" : "busca interrompida" }
    }
    totalPaginas = lote.totalPaginas
    resultado.paginasLidas++
    // Mais antigas primeiro: o lead nasce na primeira mensagem do contato.
    const ordenados = [...lote.registros].sort((a, b) => Number(a.messageTimestamp ?? 0) - Number(b.messageTimestamp ?? 0))
    for (const registro of ordenados) {
      resultado.encontradas++
      if (!deveReprocessar(registro)) {
        resultado.ignoradas++
        continue
      }
      try {
        await handleMessageUpsert({ event: "messages.upsert", instance: instanceName, data: registro }, { semIA: true })
        resultado.processadas++
      } catch (error) {
        resultado.erros++
        logger.error("Resgate: falha ao reprocessar mensagem", { instanceName, error: error instanceof Error ? error.message : String(error) })
      }
    }
  }
  if (totalPaginas > RESGATE_MAX_PAGINAS) resultado.truncado = true
  return resultado
}
