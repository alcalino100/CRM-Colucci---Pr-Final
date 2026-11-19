import { CAPACIDADES_PADRAO, type MapaCapacidades } from "./capacidades"
import { estadoInicial, type Estado, type Evento } from "./orquestrador"
import type { Departamento, Intencao } from "./types"

export type StatusConversa = "ativa" | "resolvida_ia" | "transferida" | "humano" | "encerrada"

export type ConfigAssistente = {
  ativo: boolean
  instancias: string[]
  numerosTeste: string[]
  capacidades: MapaCapacidades
  usarIa: boolean
  aiAgentId?: string
}

export const CONFIG_PADRAO: ConfigAssistente = { ativo: false, instancias: [], numerosTeste: [], capacidades: CAPACIDADES_PADRAO, usarIa: false }

export type Conversa = {
  id: string
  telefone: string
  instanceName: string
  estado: Estado
  status: StatusConversa
  intencaoAtual?: Intencao
  criadoEm: string
  ultimaMsgEm: string
}

export type MensagemRegistro = { papel: "cliente" | "assistente" | "sistema"; conteudo: string; criadoEm: string }
export type EventoRegistro = { tipo: Evento["tipo"]; dados: Evento; criadoEm: string }

export type AtendimentoResumo = {
  id: string
  protocolo?: string
  cliente: string
  perfil?: string
  telefoneMascarado: string
  intencao?: Intencao
  departamento?: Departamento
  status: StatusConversa
  duracaoSeg: number
  quando: string // ISO
  mensagens: number
}

export type Indicadores = {
  atendimentos: number
  resolvidosIaPct: number
  transferidos: number
  tempoMedioRespostaSeg: number | null
  minutosEconomizados: number
  satisfacao: number | null
  porIntencao: { intencao: Intencao; total: number }[]
}

/** Janela em que uma conversa continua "a mesma": depois disso, o cliente começa uma nova. */
export const TTL_CONVERSA_HORAS = 12
export const MIN_ECONOMIZADOS_POR_ATENDIMENTO = 4

export type SalvarTurno = {
  estado: Estado
  status: StatusConversa
  intencao?: Intencao
  mensagens: { papel: MensagemRegistro["papel"]; conteudo: string }[]
  eventos: Evento[]
  /** false = turno "em silêncio" (só registra): não renova o prazo da conversa nem a data da última atividade. */
  renovar?: boolean
}

export interface RepositorioAssistente {
  obterConfig(): Promise<ConfigAssistente>
  salvarConfig(parcial: Partial<ConfigAssistente>): Promise<ConfigAssistente>
  /** Conversa do mesmo telefone/instância ainda dentro do TTL (qualquer status), ou null. */
  buscarConversaRecente(telefone: string, instanceName: string, agora: Date): Promise<Conversa | null>
  criarConversa(telefone: string, instanceName: string, agora: Date): Promise<Conversa>
  salvarTurno(conversaId: string, turno: SalvarTurno, agora: Date): Promise<void>
  /** Últimas mensagens da conversa (ordem cronológica), para dar memória ao agente. */
  historico(conversaId: string, limite: number): Promise<{ papel: MensagemRegistro["papel"]; conteudo: string }[]>
  /** Últimas mensagens que o assistente enviou (para reconhecer o eco do próprio envio). */
  ultimasMensagensAssistente(conversaId: string, limite: number): Promise<string[]>
  /** Humano respondeu pelo WhatsApp: o assistente cala nessa conversa. */
  marcarHumano(telefone: string, instanceName: string, agora: Date): Promise<void>
  listarAtendimentos(opts: { limite: number; status?: StatusConversa }): Promise<AtendimentoResumo[]>
  calcularIndicadores(desde: Date): Promise<Indicadores>
}

export const dentroDoTtl = (ultimaMsgEm: string, agora: Date) => agora.getTime() - new Date(ultimaMsgEm).getTime() < TTL_CONVERSA_HORAS * 3_600_000

/** Status da conversa depois de um turno, a partir dos eventos. Transferida > resolvida > ativa. */
export function statusAposTurno(atual: StatusConversa, estado: Estado, eventos: Evento[]): StatusConversa {
  if (atual === "humano") return "humano"
  if (estado.etapa === "transferido") return "transferida"
  if (eventos.some((e) => e.tipo === "resolvido_automaticamente")) return "resolvida_ia"
  return atual === "resolvida_ia" ? "resolvida_ia" : "ativa"
}

/** Implementação em memória: usada nos testes e como referência do contrato. */
export class RepositorioMemoria implements RepositorioAssistente {
  config: ConfigAssistente = { ...CONFIG_PADRAO }
  conversas: (Conversa & { atualizadoEm: string })[] = []
  mensagens = new Map<string, MensagemRegistro[]>()
  eventos = new Map<string, EventoRegistro[]>()
  private seq = 0

  async obterConfig() { return this.config }
  async salvarConfig(p: Partial<ConfigAssistente>) { this.config = { ...this.config, ...p }; return this.config }

  async buscarConversaRecente(telefone: string, instanceName: string, agora: Date) {
    const c = this.conversas.filter((x) => x.telefone === telefone && x.instanceName === instanceName).sort((a, b) => b.ultimaMsgEm.localeCompare(a.ultimaMsgEm))[0]
    return c && dentroDoTtl(c.ultimaMsgEm, agora) ? c : null
  }

  async criarConversa(telefone: string, instanceName: string, agora: Date) {
    const c = { id: `conv_${++this.seq}`, telefone, instanceName, estado: estadoInicial(), status: "ativa" as StatusConversa, criadoEm: agora.toISOString(), ultimaMsgEm: agora.toISOString(), atualizadoEm: agora.toISOString() }
    this.conversas.push(c)
    return c
  }

  async salvarTurno(id: string, t: SalvarTurno, agora: Date) {
    const c = this.conversas.find((x) => x.id === id)
    if (!c) return
    Object.assign(c, { estado: t.estado, status: t.status, intencaoAtual: t.intencao ?? c.intencaoAtual, atualizadoEm: agora.toISOString(), ...(t.renovar === false ? {} : { ultimaMsgEm: agora.toISOString() }) })
    const iso = agora.toISOString()
    this.mensagens.set(id, [...(this.mensagens.get(id) ?? []), ...t.mensagens.map((m) => ({ ...m, criadoEm: iso }))])
    this.eventos.set(id, [...(this.eventos.get(id) ?? []), ...t.eventos.map((e) => ({ tipo: e.tipo, dados: e, criadoEm: iso }))])
  }

  async historico(id: string, limite: number) {
    return (this.mensagens.get(id) ?? []).slice(-limite).map(({ papel, conteudo }) => ({ papel, conteudo }))
  }

  async ultimasMensagensAssistente(id: string, limite: number) {
    return (this.mensagens.get(id) ?? []).filter((m) => m.papel === "assistente").slice(-limite).map((m) => m.conteudo)
  }

  async marcarHumano(telefone: string, instanceName: string, agora: Date) {
    for (const c of this.conversas) if (c.telefone === telefone && c.instanceName === instanceName && dentroDoTtl(c.ultimaMsgEm, agora)) c.status = "humano"
  }

  async listarAtendimentos({ limite, status }: { limite: number; status?: StatusConversa }) {
    const { montarResumo } = await import("./indicadores")
    return [...this.conversas].sort((a, b) => b.ultimaMsgEm.localeCompare(a.ultimaMsgEm)).filter((c) => !status || c.status === status).slice(0, limite).map((c) => montarResumo(c, this.mensagens.get(c.id) ?? []))
  }

  async calcularIndicadores(desde: Date) {
    const { calcularIndicadores } = await import("./indicadores")
    const cs = this.conversas.filter((c) => new Date(c.criadoEm) >= desde)
    const ids = new Set(cs.map((c) => c.id))
    const msgs = new Map([...this.mensagens].filter(([k]) => ids.has(k)))
    return calcularIndicadores(cs, msgs)
  }
}
