import { classificarComIa } from "./classificador-ia"
import { humanizar } from "./humanizador"
import type { ChamadaIa } from "./ia"
import { processarMensagem, type Evento } from "./orquestrador"
import type { ImmobillisProvider } from "./provider"
import { normalizar } from "./intencoes"
import { statusAposTurno, type ConfigAssistente, type RepositorioAssistente } from "./repositorio"

/** Depois de encaminhada, o cliente que insiste não recebe o mesmo aviso de novo antes disso. */
export const SILENCIO_APOS_TRANSFERENCIA_MIN = 15

export type ResultadoAtendimento = {
  respondeu: boolean
  respostas: string[]
  eventos: Evento[]
  conversaId: string
  escalada?: Extract<Evento, { tipo: "escalada" }>
}

/**
 * Um turno completo do assistente: carrega a conversa, decide (orquestrador), humaniza (opcional),
 * persiste tudo. Não envia nada: quem chama (WhatsApp, simulador) decide como entregar.
 */
export async function atenderMensagem(p: {
  repo: RepositorioAssistente
  provider: ImmobillisProvider
  config: Pick<ConfigAssistente, "capacidades" | "usarIa">
  telefone: string
  instanceName: string
  texto: string
  agora?: Date
  ia?: ChamadaIa | null
}): Promise<ResultadoAtendimento> {
  const agora = p.agora ?? new Date()
  const { repo } = p
  const conv = (await repo.buscarConversaRecente(p.telefone, p.instanceName, agora)) ?? (await repo.criarConversa(p.telefone, p.instanceName, agora))

  const silencioso = async (): Promise<ResultadoAtendimento> => {
    await repo.salvarTurno(conv.id, { estado: conv.estado, status: conv.status, mensagens: [{ papel: "cliente", conteudo: p.texto }], eventos: [], renovar: false }, agora)
    return { respondeu: false, respostas: [], eventos: [], conversaId: conv.id }
  }

  // Humano assumiu: o assistente só registra.
  if (conv.status === "humano") return silencioso()
  // Já encaminhado há pouco: não repete o aviso a cada mensagem.
  if (conv.estado.etapa === "transferido" && agora.getTime() - new Date(conv.ultimaMsgEm).getTime() < SILENCIO_APOS_TRANSFERENCIA_MIN * 60_000) return silencioso()

  const saida = await processarMensagem(conv.estado, p.texto, {
    provider: p.provider,
    telefone: p.telefone,
    agora,
    capacidades: p.config.capacidades,
    classificadorReserva: p.ia ? (t) => classificarComIa(t, p.ia!) : undefined,
  })

  let respostas = saida.respostas
  const eventos = [...saida.eventos]
  if (p.ia && p.config.usarIa) {
    const h = await humanizar(respostas, p.ia)
    respostas = h.respostas
    if (h.usouIa) eventos.push({ tipo: "ia", funcao: "humanizador", ok: h.ok, tokens: h.tokens })
  }

  const intencao = [...eventos].reverse().find((e): e is Extract<Evento, { tipo: "intencao" }> => e.tipo === "intencao")?.intencao
  await repo.salvarTurno(
    conv.id,
    {
      estado: saida.estado,
      status: statusAposTurno(conv.status, saida.estado, eventos),
      intencao,
      mensagens: [{ papel: "cliente", conteudo: p.texto }, ...respostas.map((conteudo) => ({ papel: "assistente" as const, conteudo }))],
      eventos,
    },
    agora
  )
  return { respondeu: respostas.length > 0, respostas, eventos, conversaId: conv.id, escalada: eventos.find((e): e is Extract<Evento, { tipo: "escalada" }> => e.tipo === "escalada") }
}

/**
 * Chegou uma mensagem "minha" (fromMe) na instância. Se NÃO for eco do que o próprio assistente enviou,
 * é um humano atendendo: o assistente cala naquela conversa.
 */
export async function registrarMensagemHumana(p: { repo: RepositorioAssistente; telefone: string; instanceName: string; texto: string; agora?: Date }): Promise<boolean> {
  const agora = p.agora ?? new Date()
  const conv = await p.repo.buscarConversaRecente(p.telefone, p.instanceName, agora)
  if (!conv || conv.status === "humano") return false
  const alvo = normalizar(p.texto)
  if (!alvo) return false
  const enviadas = await p.repo.ultimasMensagensAssistente(conv.id, 10)
  if (enviadas.some((m) => normalizar(m) === alvo)) return false // eco do próprio envio
  await p.repo.marcarHumano(p.telefone, p.instanceName, agora)
  return true
}
