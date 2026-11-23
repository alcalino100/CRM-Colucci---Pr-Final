import { buscarFaq } from "./faq"
import { executarFerramenta } from "./ferramentas"
import { brl, textoBoleto, textoContrato, textoInforme, textoReajuste } from "./formatadores"
import { CAPACIDADE_POR_INTENCAO, type MapaCapacidades } from "./capacidades"
import { classificarIntencao, DEPARTAMENTO_POR_INTENCAO, ROTULO_DEPARTAMENTO } from "./intencoes"
import type { ImmobillisProvider } from "./provider"
import type { Boleto, Cliente, Contrato, Departamento, InformeRendimentos, Intencao, Reajuste } from "./types"

/**
 * Orquestrador do Assistente Virtual: máquina de estados determinística.
 * A IA generativa (futuro) entra só para dar tom/naturalidade ao texto. Quem decide fluxo,
 * identidade, escalada e quais dados mostrar é este código, o que garante previsibilidade.
 */
export const MAX_TENTATIVAS_IDENTIDADE = 3
export const MAX_NAO_ENTENDIDAS = 2

export type Etapa = "inicio" | "aguardando_confirmacao" | "identificado" | "transferido"

export type Estado = {
  etapa: Etapa
  cliente?: Cliente
  tentativasIdentidade: number
  naoEntendidas: number
  intencaoPendente?: Intencao
  protocolo?: string
  departamento?: Departamento
}

export type Evento =
  | { tipo: "intencao"; intencao: Intencao }
  | { tipo: "ferramenta"; nome: string; ok: boolean }
  | { tipo: "identidade"; resultado: "confirmada" | "falhou" | "bloqueada" | "telefone_desconhecido" }
  | { tipo: "escalada"; departamento: Departamento; motivo: string; protocolo: string }
  | { tipo: "resolvido_automaticamente" }
  | { tipo: "ia"; funcao: "classificador" | "humanizador" | "agente"; ok: boolean; tokens?: number; erro?: string }

export type Contexto = {
  provider: ImmobillisProvider
  telefone: string
  agora?: Date
  gerarProtocolo?: (agora: Date) => string
  /** O que o gestor deixou ligado. Intenção desligada vai para a equipe. Ausente = tudo ligado. */
  capacidades?: Partial<MapaCapacidades>
  /** Só é chamado quando as regras não entendem a mensagem. Deve devolver null se não tiver certeza. */
  classificadorReserva?: (texto: string) => Promise<{ intencao: Intencao; tokens?: number } | null>
}

export type Saida = { estado: Estado; respostas: string[]; eventos: Evento[] }

export const estadoInicial = (): Estado => ({ etapa: "inicio", tentativasIdentidade: 0, naoEntendidas: 0 })

export function protocoloPadrao(agora: Date): string {
  const p = (n: number, l = 2) => String(n).padStart(l, "0")
  const rand = Math.floor(Math.random() * 10_000)
  return `COL-${agora.getFullYear()}${p(agora.getMonth() + 1)}${p(agora.getDate())}-${p(rand, 4)}`
}

/** Escolhe uma variação de forma estável (mesma entrada, mesma saída): o cliente não recebe sempre a mesma frase, e os testes não ficam instáveis. */
export const variar = <T,>(opcoes: T[], semente: number): T => opcoes[Math.abs(Math.floor(semente)) % opcoes.length]

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0]

/** Fluxo de regras (quando o Claude não responde): conversa natural, sem menu e sem lista. */
export const TEXTO = {
  saudacao: (nome: string | undefined, sem: number) =>
    variar(
      [
        `Oi${nome ? `, ${nome}` : ""}, tudo bem? Como posso te ajudar hoje?`,
        `Olá${nome ? `, ${nome}` : ""}, tudo bem por aí? Me conta o que você precisa.`,
        `Oi${nome ? `, ${nome}` : ""}! Tudo certo? Em que posso te ajudar?`,
      ],
      sem
    ),
  naoEntendi: (sem: number) =>
    variar(
      [
        "Desculpa, não consegui entender direito. Você precisa de boleto, informe de rendimentos, reajuste ou dados do contrato? Se for outro assunto, me conta que eu chamo alguém da equipe.",
        "Hmm, acho que não entendi bem. É sobre boleto, contrato, reajuste ou informe de rendimentos? Se for outra coisa, pode me contar com suas palavras.",
      ],
      sem
    ),
  pedirDigitos: (nome: string) => `Claro, já te ajudo com isso. Só para confirmar que é você mesmo, ${nome}, pode me mandar os 4 últimos dígitos do CPF ou CNPJ cadastrado?`,
  digitosErrados: "Hmm, esses números não bateram com o cadastro. Pode conferir e me mandar de novo os 4 últimos dígitos do CPF ou CNPJ?",
  identidadeOk: (nome: string, sem: number) => variar([`Perfeito, ${nome}, tudo certo.`, `Obrigado, ${nome}, já confirmei aqui.`, `Pronto, ${nome}, confirmado.`], sem),
  encaminhar: (setor: string, protocolo: string) => `Vou passar o seu atendimento para a equipe de ${setor}, que continua com você por aqui. Seu protocolo é ${protocolo}.`,
  semBoletos: "Boa notícia: você não tem nenhum boleto em aberto no momento. 🎉",
  boletos: (n: number, total: string) => `Encontrei ${n} boleto${n > 1 ? "s" : ""} em aberto, somando ${total}. Segue:`,
}

const INTENCOES_COM_DADOS: Intencao[] = ["segunda_via_boleto", "informe_rendimentos", "reajuste", "contrato"]

const ultimos4 = (doc: string) => doc.replace(/\D/g, "").slice(-4)

function escalar(estado: Estado, ctx: Required<Pick<Contexto, "agora">> & Contexto, intencao: Intencao, motivo: string, intro?: string): Saida {
  const departamento = DEPARTAMENTO_POR_INTENCAO[intencao] ?? "administrativo"
  const protocolo = estado.protocolo ?? (ctx.gerarProtocolo ?? protocoloPadrao)(ctx.agora)
  const novo: Estado = { ...estado, etapa: "transferido", protocolo, departamento }
  return {
    estado: novo,
    respostas: [
      `${intro ? intro + " " : ""}${TEXTO.encaminhar(ROTULO_DEPARTAMENTO[departamento], protocolo)}`,
    ],
    eventos: [{ tipo: "escalada", departamento, motivo, protocolo }],
  }
}

export async function processarMensagem(estadoAtual: Estado, texto: string, ctxEntrada: Contexto): Promise<Saida> {
  const ctx = { ...ctxEntrada, agora: ctxEntrada.agora ?? new Date() }
  const estado = estadoAtual

  if (estado.etapa === "transferido") {
    return { estado, respostas: [`Seu atendimento já foi encaminhado à equipe (protocolo ${estado.protocolo}). Em breve alguém responde por aqui.`], eventos: [] }
  }

  // --- Confirmação de identidade (últimos 4 dígitos do CPF/CNPJ) ---
  if (estado.etapa === "aguardando_confirmacao" && estado.cliente) {
    const digitos = texto.replace(/\D/g, "")
    if (digitos.length >= 4 && digitos.slice(-4) === ultimos4(estado.cliente.cpfCnpj)) {
      const base: Estado = { ...estado, etapa: "identificado", tentativasIdentidade: 0 }
      const saida = await atender(base, estado.intencaoPendente ?? "desconhecida", texto, ctx)
      return {
        ...saida,
        respostas: [TEXTO.identidadeOk(primeiroNome(estado.cliente.nome), ctx.agora.getTime()), ...saida.respostas],
        eventos: [{ tipo: "identidade", resultado: "confirmada" }, ...saida.eventos],
      }
    }
    const tentativas = estado.tentativasIdentidade + 1
    if (tentativas >= MAX_TENTATIVAS_IDENTIDADE) {
      const s = escalar({ ...estado, tentativasIdentidade: tentativas }, ctx, "desconhecida", "identidade_nao_confirmada", "Não consegui confirmar sua identidade por aqui.")
      return { ...s, eventos: [{ tipo: "identidade", resultado: "bloqueada" }, ...s.eventos] }
    }
    return {
      estado: { ...estado, tentativasIdentidade: tentativas },
      respostas: [TEXTO.digitosErrados],
      eventos: [{ tipo: "identidade", resultado: "falhou" }],
    }
  }

  let intencao = classificarIntencao(texto)
  const eventos: Evento[] = []
  if (intencao === "desconhecida" && ctx.classificadorReserva) {
    const r = await ctx.classificadorReserva(texto).catch(() => null)
    if (r) {
      intencao = r.intencao
      eventos.push({ tipo: "ia", funcao: "classificador", ok: true, tokens: r.tokens })
    } else {
      eventos.push({ tipo: "ia", funcao: "classificador", ok: false })
    }
  }
  eventos.push({ tipo: "intencao", intencao })

  if (intencao === "falar_com_humano") {
    const s = escalar(estado, ctx, intencao, "pedido_do_cliente")
    return { ...s, eventos: [...eventos, ...s.eventos] }
  }

  if (intencao === "saudacao") {
    return { estado, respostas: [TEXTO.saudacao(estado.cliente ? primeiroNome(estado.cliente.nome) : undefined, ctx.agora.getTime())], eventos }
  }

  if (intencao === "desconhecida") {
    const n = estado.naoEntendidas + 1
    if (n >= MAX_NAO_ENTENDIDAS) {
      const s = escalar({ ...estado, naoEntendidas: n }, ctx, intencao, "nao_entendida")
      return { ...s, eventos: [...eventos, ...s.eventos] }
    }
    return { estado: { ...estado, naoEntendidas: n }, respostas: [TEXTO.naoEntendi(ctx.agora.getTime())], eventos }
  }

  const saida = await atender({ ...estado, naoEntendidas: 0 }, intencao, texto, ctx)
  return { ...saida, eventos: [...eventos, ...saida.eventos] }
}

type CtxCompleto = Contexto & { agora: Date }

async function atender(estado: Estado, intencao: Intencao, texto: string, ctx: CtxCompleto): Promise<Saida> {
  const cap = CAPACIDADE_POR_INTENCAO[intencao]
  if (cap && ctx.capacidades?.[cap] === false) return escalar(estado, ctx, intencao, "capacidade_desativada")

  // FAQ: não exige identidade.
  if (intencao === "faq") {
    const item = buscarFaq(texto)
    if (item) return { estado, respostas: [item.resposta], eventos: [{ tipo: "resolvido_automaticamente" }] }
    return escalar(estado, ctx, intencao, "faq_sem_resposta")
  }

  // Assuntos humanos: abre protocolo e encaminha.
  if (!INTENCOES_COM_DADOS.includes(intencao)) {
    return escalar(estado, ctx, intencao, "departamento")
  }

  // Dados do cliente: exige identidade.
  if (estado.etapa !== "identificado" || !estado.cliente) {
    const r = await ctx.provider.buscarClientePorTelefone(ctx.telefone)
    if (!r.ok) {
      if (r.codigo === "indisponivel") return escalar(estado, ctx, intencao, "sistema_indisponivel", "Estou com instabilidade para consultar o sistema agora.")
      const s = escalar(estado, ctx, intencao, "telefone_nao_cadastrado", "Não localizei este número no nosso cadastro.")
      return { ...s, eventos: [{ tipo: "identidade", resultado: "telefone_desconhecido" }, ...s.eventos] }
    }
    return {
      estado: { ...estado, etapa: "aguardando_confirmacao", cliente: r.dados, intencaoPendente: intencao },
      respostas: [TEXTO.pedirDigitos(primeiroNome(r.dados.nome))],
      eventos: [],
    }
  }

  const fctx = { provider: ctx.provider, clienteId: estado.cliente.id }
  const falhaSistema = (nome: string): Saida => {
    const s = escalar(estado, ctx, intencao, "sistema_indisponivel", "Tive um problema para consultar essa informação agora.")
    return { ...s, eventos: [{ tipo: "ferramenta", nome, ok: false }, ...s.eventos] }
  }

  switch (intencao) {
    case "segunda_via_boleto": {
      const r = await executarFerramenta("buscar_boletos", fctx, {})
      if (!r.ok) return falhaSistema("buscar_boletos")
      const boletos = r.dados as Boleto[]
      const ev: Evento[] = [{ tipo: "ferramenta", nome: "buscar_boletos", ok: true }]
      if (boletos.length === 0) {
        return { estado, respostas: [TEXTO.semBoletos], eventos: [...ev, { tipo: "resolvido_automaticamente" }] }
      }
      const total = boletos.reduce((s, b) => s + b.valor, 0)
      return {
        estado,
        respostas: [TEXTO.boletos(boletos.length, brl(total)), ...boletos.map(textoBoleto)],
        eventos: [...ev, { tipo: "resolvido_automaticamente" }],
      }
    }
    case "contrato": {
      const r = await executarFerramenta("listar_contratos", fctx, {})
      if (!r.ok) return falhaSistema("listar_contratos")
      const contratos = r.dados as Contrato[]
      const ev: Evento[] = [{ tipo: "ferramenta", nome: "listar_contratos", ok: true }]
      if (contratos.length === 0) return escalar(estado, ctx, intencao, "sem_contrato", "Não encontrei contratos no seu cadastro.")
      return { estado, respostas: contratos.map((c) => textoContrato(c, ctx.agora)), eventos: [...ev, { tipo: "resolvido_automaticamente" }] }
    }
    case "reajuste": {
      const lc = await executarFerramenta("listar_contratos", fctx, {})
      if (!lc.ok) return falhaSistema("listar_contratos")
      const contratos = (lc.dados as Contrato[]).filter((c) => c.status !== "encerrado")
      const respostas: string[] = []
      for (const c of contratos) {
        const r = await executarFerramenta("consultar_reajuste", fctx, { contratoId: c.id })
        if (r.ok) respostas.push(textoReajuste(r.dados as Reajuste, c.imovelEndereco))
      }
      const ev: Evento[] = [{ tipo: "ferramenta", nome: "consultar_reajuste", ok: respostas.length > 0 }]
      if (respostas.length === 0) return escalar(estado, ctx, intencao, "reajuste_indisponivel", "Não consegui consultar o reajuste agora.")
      return { estado, respostas, eventos: [...ev, { tipo: "resolvido_automaticamente" }] }
    }
    case "informe_rendimentos": {
      const m = texto.match(/\b(20\d{2})\b/)
      const anoBase = m ? Number(m[1]) : ctx.agora.getFullYear() - 1
      const r = await executarFerramenta("obter_informe_rendimentos", fctx, { anoBase })
      if (!r.ok) {
        if (r.codigo === "nao_encontrado") {
          const s = escalar(estado, ctx, intencao, "informe_indisponivel", `Não localizei o informe de ${anoBase} para o seu cadastro.`)
          return { ...s, eventos: [{ tipo: "ferramenta", nome: "obter_informe_rendimentos", ok: false }, ...s.eventos] }
        }
        return falhaSistema("obter_informe_rendimentos")
      }
      return {
        estado,
        respostas: [textoInforme(r.dados as InformeRendimentos)],
        eventos: [{ tipo: "ferramenta", nome: "obter_informe_rendimentos", ok: true }, { tipo: "resolvido_automaticamente" }],
      }
    }
    default:
      return escalar(estado, ctx, intencao, "departamento")
  }
}
