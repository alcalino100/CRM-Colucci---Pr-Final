import "server-only"
import { logger } from "@/lib/logger"
import { notifyGestorWhatsApp, sendPresence, sendWhatsAppText, wsupabase } from "@/lib/whatsapp/server"
import { criarAgenteDeps, criarChamadaIa, resolverClaude } from "./ia-claude"
import { obterProvider } from "./provider-factory"
import { repositorioSupabase } from "./repositorio-supabase"
import { tratarMensagemHumana, tratarMensagemRecebida, type DepsHandler } from "./handler"
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
  log: (nivel, msg, extra) => (nivel === "erro" ? logger.error(msg, extra) : logger.info(msg, extra)),
})

/** Ponto de entrada do webhook do WhatsApp. true = o assistente assumiu (a IA de leads não deve responder). */
export async function handleAssistenteInbound(p: { telefone: string; texto: string; instanceName?: string }, opcoes: { exigirTeste?: boolean } = {}): Promise<boolean> {
  return tratarMensagemRecebida({ telefone: p.telefone, texto: p.texto, instanceName: p.instanceName ?? "" }, deps(), opcoes)
}

export async function handleAssistenteMensagemHumana(p: { telefone: string; texto: string; instanceName?: string }): Promise<void> {
  return tratarMensagemHumana({ telefone: p.telefone, texto: p.texto, instanceName: p.instanceName ?? "" }, deps())
}
