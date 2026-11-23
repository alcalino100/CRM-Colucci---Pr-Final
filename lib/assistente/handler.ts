import { normalizePhone } from "@/lib/labels"
import { atenderMensagem, registrarMensagemHumana } from "./atendimento"
import type { AgenteDeps } from "./agente"
import type { ChamadaIa } from "./ia"
import type { Evento } from "./orquestrador"
import type { ImmobillisProvider } from "./provider"
import type { ConfigAssistente, RepositorioAssistente } from "./repositorio"

/** Tudo que o handler precisa do mundo externo, injetável: assim as travas de segurança são testáveis sem rede. */
export type DepsHandler = {
  repo: RepositorioAssistente
  provider: ImmobillisProvider
  resolverIa: (config: ConfigAssistente) => Promise<ChamadaIa | null>
  /** Agente (Claude conduzindo a conversa). Opcional: sem ele, o assistente usa o fluxo por regras. */
  resolverAgente?: (config: ConfigAssistente) => Promise<AgenteDeps | null>
  enviarTexto: (instanceName: string, telefone: string, texto: string) => Promise<{ ok: boolean; erro?: string; keyId?: string }>
  presenca?: (instanceName: string, telefone: string) => Promise<void>
  registrarNoInbox?: (p: { instanceName: string; telefone: string; texto: string; keyId?: string }) => Promise<void>
  notificarGestor?: (texto: string) => Promise<void>
  log: (nivel: "info" | "erro", msg: string, extra?: Record<string, unknown>) => void
  dormir?: (ms: number) => Promise<void>
  agora?: () => Date
  /**
   * Agrupa mensagens seguidas ("oi" + "preciso do boleto" em 2s): espera um instante e devolve o texto junto,
   * ou null se chegou mensagem mais nova (aquela execução responde por todas). Sem isso, duas execuções
   * simultâneas criariam conversas duplicadas e respostas embaralhadas.
   */
  aguardarRajada?: (p: { telefone: string; instanceName: string; mensagemId?: string; texto: string }) => Promise<string | null>
}

/**
 * Avisos que o PRÓPRIO sistema manda para números da equipe (resumos, vendas, alertas, notificações do assistente).
 * O assistente nunca responde a eles: evita conversa entre robôs.
 */
export const ehMensagemAutomatica = (texto: string) =>
  /^\s*(?:[^\p{L}\p{N}\s]{1,6}\s*)?(?:RESUMO DE ALERTAS|VENDA FECHADA|LEAD EM NEGOCIA[ÇC][ÃA]O|Assistente Virtual|Resumo do dia)/iu.test(texto)

/** Quanto uma pessoa levaria para digitar: ~35 ms por caractere, entre 0,9 s e 4 s. Mensagens saindo todas de uma vez denunciam o robô. */
export const atrasoDigitacao = (texto: string) => Math.min(4000, Math.max(900, 500 + texto.length * 35))

const mesmoTelefone = (a: string, b: string) => !!a && !!b && normalizePhone(a) === normalizePhone(b)

/** Pode o assistente atuar neste telefone/instância? Trava única, usada para mensagens do cliente e do humano. */
export function podeAtuar(config: ConfigAssistente, provider: ImmobillisProvider, telefone: string, instanceName: string): { pode: boolean; motivo?: string } {
  if (!config.ativo) return { pode: false, motivo: "desligado" }
  const ehTeste = config.numerosTeste.some((n) => mesmoTelefone(n, telefone))
  const vinculada = !!instanceName && config.instancias.includes(instanceName)
  if (!ehTeste && !vinculada) return { pode: false, motivo: "fora_do_escopo" }
  // Número de teste só vale nas instâncias escolhidas (se houver). Antes valia em QUALQUER instância e o assistente
  // respondeu até aos avisos automáticos que o sistema manda para o celular do gestor por outra instância.
  if (ehTeste && !vinculada && config.instancias.length > 0) return { pode: false, motivo: "teste_fora_das_instancias" }
  // Provedor simulado = dado fictício. NUNCA para cliente real: só número de teste.
  if (provider.nome === "simulado" && !ehTeste) return { pode: false, motivo: "provedor_simulado_so_teste" }
  return { pode: true }
}

/**
 * Mensagem recebida de um cliente. Devolve true se o assistente "assumiu" a conversa
 * (o fluxo de leads/IA Conversacional NÃO deve responder), false para seguir o fluxo normal.
 */
export async function tratarMensagemRecebida(
  p: { telefone: string; texto: string; instanceName: string; mensagemId?: string },
  d: DepsHandler,
  opcoes: { exigirTeste?: boolean } = {}
): Promise<boolean> {
  let texto = p.texto.trim()
  if (!texto) return false
  if (ehMensagemAutomatica(texto)) return false
  let config: ConfigAssistente
  try {
    config = await d.repo.obterConfig()
  } catch {
    return false // tabelas ainda não existem / banco fora: segue o fluxo normal, sem risco
  }
  if (!podeAtuar(config, d.provider, p.telefone, p.instanceName).pode) return false
  // Número interno da empresa (bloqueado no webhook): só atende se for número de TESTE do assistente.
  if (opcoes.exigirTeste && !config.numerosTeste.some((n) => mesmoTelefone(n, p.telefone))) return false

  const dormir = d.dormir ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)))
  const agora = d.agora ? d.agora() : new Date()
  try {
    if (d.aguardarRajada) {
      const junto = await d.aguardarRajada({ telefone: p.telefone, instanceName: p.instanceName, mensagemId: p.mensagemId, texto })
      if (junto === null) return true // outra execução (da mensagem mais nova) responde por todas
      texto = junto.trim() || texto
    }
    const ia = await d.resolverIa(config).catch(() => null)
    const agente = d.resolverAgente ? await d.resolverAgente(config).catch(() => null) : null
    if (d.presenca) await d.presenca(p.instanceName, p.telefone).catch(() => {})
    const r = await atenderMensagem({ repo: d.repo, provider: d.provider, config, telefone: p.telefone, instanceName: p.instanceName, texto, agora, ia, agente })
    for (let i = 0; i < r.respostas.length; i++) {
      // "digitando..." e uma pausa proporcional ao tamanho, antes de cada mensagem
      if (d.presenca) await d.presenca(p.instanceName, p.telefone).catch(() => {})
      await dormir(atrasoDigitacao(r.respostas[i]))
      const env = await d.enviarTexto(p.instanceName, p.telefone, r.respostas[i])
      if (!env.ok) d.log("erro", "assistente: falha ao enviar resposta", { erro: env.erro, instanceName: p.instanceName })
      else if (d.registrarNoInbox) await d.registrarNoInbox({ instanceName: p.instanceName, telefone: p.telefone, texto: r.respostas[i], keyId: env.keyId }).catch(() => {})
    }
    // Claude falhou/foi barrado: deixa o MOTIVO nos logs (antes sumia em silêncio e ninguém via que a IA não estava rodando).
    const falhaIa = r.eventos.find((e) => e.tipo === "ia" && !e.ok && e.erro)
    if (falhaIa && falhaIa.tipo === "ia") d.log("erro", `assistente: IA (${falhaIa.funcao}) não respondeu`, { motivo: falhaIa.erro, instanceName: p.instanceName })
    if (r.limitado && d.notificarGestor) {
      await d.notificarGestor(`⚠️ Assistente Virtual: muitas respostas em pouco tempo para ${p.telefone}. Pausei o assistente nessa conversa; veja se não há outro robô respondendo.`).catch(() => {})
    }
    if (r.escalada && d.notificarGestor) {
      const e = r.escalada
      await d
        .notificarGestor(`🔔 Assistente Virtual encaminhou um atendimento\nDepartamento: ${e.departamento}\nMotivo: ${e.motivo.replace(/_/g, " ")}\nProtocolo: ${e.protocolo}\nTelefone: ${p.telefone}`)
        .catch(() => {})
    }
    return true
  } catch (e) {
    d.log("erro", "assistente: erro ao atender", { erro: e instanceof Error ? e.message : String(e) })
    if (d.notificarGestor) await d.notificarGestor(`⚠️ Assistente Virtual falhou ao atender ${p.telefone}. Verifique e responda manualmente.`).catch(() => {})
    return true // conversa é do assistente: não deixa a IA de leads responder por cima
  }
}

/** Mensagem enviada por uma pessoa da equipe na instância: se não for eco do assistente, ele para de responder. */
export async function tratarMensagemHumana(p: { telefone: string; texto: string; instanceName: string }, d: DepsHandler): Promise<void> {
  try {
    const config = await d.repo.obterConfig()
    if (!config.ativo) return
    const agora = d.agora ? d.agora() : new Date()
    const marcou = await registrarMensagemHumana({ repo: d.repo, telefone: p.telefone, instanceName: p.instanceName, texto: p.texto, agora })
    if (marcou) d.log("info", "assistente: humano assumiu a conversa", { instanceName: p.instanceName })
  } catch {
    /* best-effort */
  }
}

export type { Evento }
