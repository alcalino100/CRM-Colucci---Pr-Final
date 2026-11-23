import { atenderComAgente, type AgenteDeps } from "./agente"
import { classificarComIa } from "./classificador-ia"
import { humanizar } from "./humanizador"
import type { ChamadaIa } from "./ia"
import { processarMensagem, type Evento } from "./orquestrador"
import type { ImmobillisProvider } from "./provider"
import { normalizar } from "./intencoes"
import { statusAposTurno, type ConfigAssistente, type RepositorioAssistente } from "./repositorio"

/** Depois de encaminhada, o cliente que insiste não recebe o mesmo aviso de novo antes disso. */
export const SILENCIO_APOS_TRANSFERENCIA_MIN = 15

/** Trava anti-loop (ex.: outro robô respondendo ao assistente): passou disso, o assistente cala e chama a equipe. */
export const LIMITE_RESPOSTAS = 12
export const JANELA_LIMITE_MIN = 10

export const MSG_SO_TEXTO = "Recebi seu arquivo, mas por enquanto só consigo ler mensagens de texto. Pode escrever o que você precisa? 😊"

/** O webhook grava "[mídia]" quando chega áudio/imagem sem texto (ver processarCorpoMidia). */
export const ehSoMidia = (texto: string) => texto.split("\n").map((l) => l.trim()).filter(Boolean).every((l) => /^\[(m[ií]dia|[aá]udio|imagem|v[ií]deo|documento|figurinha|sticker)\]$/i.test(l))

export type ResultadoAtendimento = {
  respondeu: boolean
  respostas: string[]
  eventos: Evento[]
  conversaId: string
  escalada?: Extract<Evento, { tipo: "escalada" }>
  /** true quando a trava anti-loop disparou neste turno (o chamador deve avisar o gestor). */
  limitado?: boolean
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
  /** Relógio injetável (testes). Usado para o horário REAL da resposta, que alimenta o tempo médio de resposta. */
  relogio?: () => Date
  /** Modo agente (Claude conduz a conversa). Se falhar ou não passar na conferência, cai para o fluxo por regras. */
  agente?: AgenteDeps | null
  gerarProtocolo?: (agora: Date) => string
}): Promise<ResultadoAtendimento> {
  const agora = p.agora ?? new Date()
  const relogio = p.relogio ?? (() => new Date())
  const { repo } = p
  const conv = (await repo.buscarConversaRecente(p.telefone, p.instanceName, agora)) ?? (await repo.criarConversa(p.telefone, p.instanceName, agora))

  const silencioso = async (): Promise<ResultadoAtendimento> => {
    await repo.salvarTurno(conv.id, { estado: conv.estado, status: conv.status, mensagens: [{ papel: "cliente", conteudo: p.texto }], eventos: [], renovar: false }, agora)
    return { respondeu: false, respostas: [], eventos: [], conversaId: conv.id }
  }

  // Humano assumiu: o assistente só registra.
  if (conv.status === "humano") return silencioso()

  // Trava anti-loop: respostas demais em pouco tempo = algo errado (ex.: robô conversando com robô).
  const recentes = await repo.contarRespostasAssistente(conv.id, new Date(agora.getTime() - JANELA_LIMITE_MIN * 60_000)).catch(() => 0)
  if (recentes >= LIMITE_RESPOSTAS) {
    await repo.salvarTurno(conv.id, { estado: conv.estado, status: "humano", mensagens: [{ papel: "cliente", conteudo: p.texto }, { papel: "sistema", conteudo: `Limite de ${LIMITE_RESPOSTAS} respostas em ${JANELA_LIMITE_MIN} min atingido: conversa entregue à equipe.` }], eventos: [], renovar: false }, agora)
    return { respondeu: false, respostas: [], eventos: [], conversaId: conv.id, limitado: true }
  }

  // Áudio/imagem sem texto: o assistente só lê texto. Pede para escrever, sem contar como "não entendi".
  if (ehSoMidia(p.texto)) {
    const fim = relogio()
    await repo.salvarTurno(conv.id, { estado: conv.estado, status: conv.status, mensagens: [{ papel: "cliente", conteudo: p.texto, em: agora }, { papel: "assistente", conteudo: MSG_SO_TEXTO, em: fim }], eventos: [] }, agora)
    return { respondeu: true, respostas: [MSG_SO_TEXTO], eventos: [], conversaId: conv.id }
  }
  // Já encaminhado há pouco: não repete o aviso a cada mensagem.
  if (conv.estado.etapa === "transferido" && agora.getTime() - new Date(conv.ultimaMsgEm).getTime() < SILENCIO_APOS_TRANSFERENCIA_MIN * 60_000) return silencioso()

  // 1) MODO AGENTE: o Claude responde, com ferramentas e conferência de fatos.
  let saidaAgente: Awaited<ReturnType<typeof atenderComAgente>> = null
  let erroAgente: string | undefined
  const tentouAgente = !!p.agente && p.config.usarIa
  if (tentouAgente) {
    const historico = await repo.historico(conv.id, 20).catch(() => [])
    saidaAgente = await atenderComAgente({ agente: p.agente!, provider: p.provider, estado: conv.estado, historico, texto: p.texto, telefone: p.telefone, agora, capacidades: p.config.capacidades, gerarProtocolo: p.gerarProtocolo, registrarErro: (m) => { erroAgente = m } })
  }

  // 2) Rede de segurança: fluxo por regras (determinístico). Também é o caminho quando não há IA.
  const saida = saidaAgente ?? (await processarMensagem(conv.estado, p.texto, {
    provider: p.provider,
    telefone: p.telefone,
    agora,
    capacidades: p.config.capacidades,
    gerarProtocolo: p.gerarProtocolo,
    classificadorReserva: p.ia ? (t) => classificarComIa(t, p.ia!) : undefined,
  }))

  let respostas = saida.respostas
  const eventos = [...saida.eventos]
  if (tentouAgente && !saidaAgente) eventos.push({ tipo: "ia", funcao: "agente", ok: false, erro: erroAgente ?? "sem motivo registrado" })
  // Só humaniza quando NÃO houve tentativa do agente: se o Claude acabou de falhar, uma 2ª chamada falharia igual e
  // só atrasaria a resposta ao cliente.
  if (!saidaAgente && !tentouAgente && p.ia && p.config.usarIa) {
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
      // Cliente no horário em que chegou; assistente no horário REAL em que terminou de responder.
      mensagens: [{ papel: "cliente", conteudo: p.texto, em: agora }, ...respostas.map((conteudo, i) => ({ papel: "assistente" as const, conteudo, em: new Date(relogio().getTime() + i) }))],
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
