// Auto-recuperação das instâncias WhatsApp.
//
// Antes: o CRM só AVISAVA quando uma instância "conectada" parava de receber mensagens, e a Jéssica ficou
// 4 dias sem leads. Agora, a cada 30 min:
//   1. confere o webhook de toda instância conectada e conserta se estiver ausente/errado;
//   2. nas que estão "conectadas porém mudas", reinicia a sessão (no máx. 1x a cada 6h por instância);
//   3. resgata da Evolution as mensagens do período perdido (cria os leads que faltaram, sem acionar a IA).

import { logger } from "@/lib/logger"
import { wsupabase } from "@/lib/whatsapp/server"
import { garantirWebhook, reiniciarInstancia, type ResultadoGarantirWebhook } from "@/lib/whatsapp/webhook-config"
import { resgatarMensagens, type ResultadoResgate } from "@/lib/whatsapp/resgate-mensagens"
import type { ProblemaInstancia } from "@/lib/whatsapp/saude-instancias"

export const TIPO_NOTIFICACAO_RECUPERACAO = "whatsapp_auto_recuperacao"
export const COOLDOWN_RESTART_HORAS = 6
export const MAX_RECUPERACOES_POR_EXECUCAO = 3
export const JANELA_RESGATE_PADRAO_HORAS = 72
export const ORCAMENTO_MS = 45_000

export interface AcaoRecuperacao {
  instanceName: string
  webhook: ResultadoGarantirWebhook["situacao"]
  reiniciada: boolean
  resgate: ResultadoResgate | null
}

export interface ResultadoRecuperacao {
  webhooksVerificados: number
  webhooksReparados: string[]
  webhooksComFalha: string[]
  acoes: AcaoRecuperacao[]
}

/** Início da janela de resgate: da última mensagem recebida (com folga de 1h) ou, sem dados, 72h atrás. */
export function inicioDoResgate(ultimaRecebida: string | null, agora: Date): Date {
  const padrao = new Date(agora.getTime() - JANELA_RESGATE_PADRAO_HORAS * 3600_000)
  if (!ultimaRecebida) return padrao
  const u = new Date(ultimaRecebida)
  if (Number.isNaN(u.getTime())) return padrao
  return new Date(u.getTime() - 3600_000)
}

async function reiniciadaRecentemente(instanceName: string, agora: Date): Promise<boolean> {
  const corte = new Date(agora.getTime() - COOLDOWN_RESTART_HORAS * 3600_000).toISOString()
  const { data } = await wsupabase
    .from("notificacoes")
    .select("id")
    .eq("tipo", TIPO_NOTIFICACAO_RECUPERACAO)
    .ilike("mensagem", `%(${instanceName})%`)
    .gte("timestamp", corte)
    .limit(1)
  return (data?.length ?? 0) > 0
}

export async function recuperarInstancias(params: {
  conectadas: { instanceName: string; ultimaRecebida: string | null }[]
  problemas: ProblemaInstancia[]
  agora?: Date
}): Promise<ResultadoRecuperacao> {
  const agora = params.agora ?? new Date()
  const inicio = Date.now()
  const out: ResultadoRecuperacao = { webhooksVerificados: 0, webhooksReparados: [], webhooksComFalha: [], acoes: [] }
  const mudas = new Set(params.problemas.filter((p) => p.tipo === "conectada_sem_mensagens").map((p) => p.instanceName))
  const ultimaPorInstancia = new Map(params.conectadas.map((c) => [c.instanceName, c.ultimaRecebida]))
  const webhookPor = new Map<string, ResultadoGarantirWebhook["situacao"]>()

  // 1) Webhook de toda instância conectada
  for (const c of params.conectadas) {
    if (Date.now() - inicio > ORCAMENTO_MS) break
    const r = await garantirWebhook(c.instanceName)
    out.webhooksVerificados++
    webhookPor.set(c.instanceName, r.situacao)
    if (r.situacao === "reparado") out.webhooksReparados.push(c.instanceName)
    if (r.situacao === "falhou") out.webhooksComFalha.push(c.instanceName)
  }

  // 2) Instâncias mudas (ou com webhook que acabou de ser consertado): reinicia e resgata
  const alvos = params.conectadas
    .map((c) => c.instanceName)
    .filter((n) => mudas.has(n) || webhookPor.get(n) === "reparado")
    .slice(0, MAX_RECUPERACOES_POR_EXECUCAO)

  for (const instanceName of alvos) {
    if (Date.now() - inicio > ORCAMENTO_MS) break
    if (await reiniciadaRecentemente(instanceName, agora)) continue

    // Reinicia só quando a sessão está muda e o webhook estava certo (se o webhook estava errado, o reparo já resolve).
    const precisaReiniciar = mudas.has(instanceName) && webhookPor.get(instanceName) !== "reparado"
    const reiniciada = precisaReiniciar ? await reiniciarInstancia(instanceName) : false
    const resgate = await resgatarMensagens(instanceName, inicioDoResgate(ultimaPorInstancia.get(instanceName) ?? null, agora))
    out.acoes.push({ instanceName, webhook: webhookPor.get(instanceName) ?? "indeterminado", reiniciada, resgate })

    try {
      const { data: insts } = await wsupabase.from("whatsapp_instancias").select("corretor_id").eq("instance_name", instanceName).limit(1)
      const corretorId = (insts?.[0]?.corretor_id as string | null | undefined) ?? null
      const mensagem =
        `🔧 Recuperação automática do WhatsApp (${instanceName}): ` +
        `webhook ${webhookPor.get(instanceName) === "reparado" ? "reconfigurado" : "ok"}` +
        `${reiniciada ? ", sessão reiniciada" : ""}. ` +
        `Mensagens resgatadas: ${resgate.processadas} (de ${resgate.encontradas} encontradas)` +
        `${resgate.erro ? ` — aviso: ${resgate.erro}` : ""}.`
      const notifs: Record<string, unknown>[] = [{ mensagem, tipo: TIPO_NOTIFICACAO_RECUPERACAO, modulo: "vendas", para_role: "gestor" }]
      if (corretorId) notifs.push({ mensagem, tipo: TIPO_NOTIFICACAO_RECUPERACAO, modulo: "vendas", para_usuario_id: corretorId })
      await wsupabase.from("notificacoes").insert(notifs)
    } catch (error) {
      logger.warn("Auto-recuperação: falha ao registrar notificação", { instanceName, error: error instanceof Error ? error.message : String(error) })
    }
    logger.info("Auto-recuperação de instância WhatsApp", {
      instanceName,
      reiniciada,
      processadas: resgate.processadas,
      encontradas: resgate.encontradas,
    })
  }
  return out
}
