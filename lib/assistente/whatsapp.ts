import "server-only"
import { logger } from "@/lib/logger"
import { notifyGestorWhatsApp, sendPresence, sendWhatsAppText, wsupabase } from "@/lib/whatsapp/server"
import { criarAgenteDeps, criarChamadaIa, resolverClaude } from "./ia-claude"
import { obterProvider } from "./provider-factory"
import { repositorioSupabase } from "./repositorio-supabase"
import { janelaRajada, podeAtuar, tratarMensagemHumana, tratarMensagemRecebida, type DepsHandler } from "./handler"
import type { ConfigAssistente, RepositorioAssistente } from "./repositorio"

/** Memoriza a config por 20s: cada mensagem do WhatsApp passa por aqui e não precisa de uma ida ao banco. */
let cache: { em: number; config: ConfigAssistente } | null = null
const repoComCache: RepositorioAssistente = {
  ...repositorioSupabase,
  async obterConfig() {
    if (cache && Date.now() - cache.em < 20_000) return cache.config
    const config = await repositorioSupabase.obterConfig()
    cache = { em: Date.now(), config }
    return config
  },
  async salvarConfig(p) {
    cache = null
    return repositorioSupabase.salvarConfig(p)
  },
}

const deps = (): DepsHandler => ({
  repo: repoComCache,
  provider: obterProvider(),
  resolverIa: async (config) => {
    const r = await resolverClaude(config.aiAgentId)
    return r ? criarChamadaIa(r.cred) : null
  },
  resolverAgente: async (config) => {
    const r = await resolverClaude(config.aiAgentId)
    return r ? criarAgenteDeps(r) : null
  },
  enviarTexto: sendWhatsAppText,
  presenca: (i, t) => sendPresence(i, t),
  registrarNoInbox: async ({ instanceName, telefone, texto, keyId }) => {
    // Espelha a resposta no Inbox (como a IA Conversacional faz); o eco fromMe não duplica por mensagem_id.
    await wsupabase.from("whatsapp_mensagens").insert({
      instance_name: instanceName, telefone, nome_contato: null, corpo: texto, lead_id: null, de_mim: true, veio_de_anuncio: false, mensagem_id: keyId ?? null,
    })
  },
  notificarGestor: async (t) => { await notifyGestorWhatsApp(t, "numero") },
  aguardarRajada: async ({ telefone, instanceName, mensagemId, texto }) => {
    // Espera um instante e confere se chegou mensagem mais nova do mesmo contato. Se sim, devolve null (a execução
    // da mais nova responde). Senão, junta tudo que o cliente mandou desde a última resposta do assistente.
    await new Promise((r) => setTimeout(r, 2000))
    const { data: nova } = await wsupabase.from("whatsapp_mensagens").select("mensagem_id").eq("instance_name", instanceName).eq("telefone", telefone).eq("de_mim", false).order("criado_em", { ascending: false }).limit(1)
    const ultimaId = (nova as { mensagem_id: string | null }[] | null)?.[0]?.mensagem_id
    if (mensagemId && ultimaId && ultimaId !== mensagemId) return null
    const { data: minha } = await wsupabase.from("whatsapp_mensagens").select("criado_em").eq("instance_name", instanceName).eq("telefone", telefone).eq("de_mim", true).order("criado_em", { ascending: false }).limit(1)
    const desde = janelaRajada((minha as { criado_em: string }[] | null)?.[0]?.criado_em)
    const { data: rajada } = await wsupabase.from("whatsapp_mensagens").select("corpo").eq("instance_name", instanceName).eq("telefone", telefone).eq("de_mim", false).gt("criado_em", desde).order("criado_em", { ascending: true }).limit(8)
    const junto = ((rajada as { corpo: string | null }[] | null) ?? []).map((r) => (r.corpo ?? "").trim()).filter(Boolean).join("\n").slice(0, 1500)
    return junto || texto
  },
  log: (nivel, msg, extra) => (nivel === "erro" ? logger.error(msg, extra) : logger.info(msg, extra)),
})

/** Ponto de entrada do webhook do WhatsApp. true = o assistente assumiu (a IA de leads não deve responder). */
export async function handleAssistenteInbound(p: { telefone: string; texto: string; instanceName?: string; mensagemId?: string }, opcoes: { exigirTeste?: boolean } = {}): Promise<boolean> {
  return tratarMensagemRecebida({ telefone: p.telefone, texto: p.texto, instanceName: p.instanceName ?? "", mensagemId: p.mensagemId }, deps(), opcoes)
}

export async function handleAssistenteMensagemHumana(p: { telefone: string; texto: string; instanceName?: string }): Promise<void> {
  return tratarMensagemHumana({ telefone: p.telefone, texto: p.texto, instanceName: p.instanceName ?? "" }, deps())
}

/**
 * O assistente atenderia esta mensagem? Usado pelo webhook para decidir se vale transcrever um ÁUDIO antes
 * (a transcrição só roda quando alguém vai de fato ler o texto). Não envia nada.
 */
export async function assistenteAtende(p: { telefone: string; instanceName?: string }): Promise<boolean> {
  try {
    const config = await repoComCache.obterConfig()
    return podeAtuar(config, obterProvider(), p.telefone, p.instanceName ?? "").pode
  } catch {
    return false
  }
}
