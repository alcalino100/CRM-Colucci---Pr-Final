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
  | { tipo: "ia"; funcao: "classificador" | "humanizador" | "agente"; ok: boolean; tokens?: number }

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

export const MENU =
  "Posso ajudar com:\n• Segunda via de boleto\n• Informe de rendimentos\n• Reajuste do aluguel\n• Dados do seu contrato\n• Manutenção, locação, vendas e dúvidas gerais\n\nÉ só me dizer o que precisa. Se preferir, chamo alguém da equipe."

const INTENCOES_COM_DADOS: Intencao[] = ["segunda_via_boleto", "informe_rendimentos", "reajuste", "contrato"]

const ultimos4 = (doc: string) => doc.replace(/\D/g, "").slice(-4)

function escalar(estado: Estado, ctx: Required<Pick<Contexto, "agora">> & Contexto, intencao: Intencao, motivo: string, intro?: string): Saida {
  const departamento = DEPARTAMENTO_POR_INTENCAO[intencao] ?? "administrativo"
  const protocolo = estado.protocolo ?? (ctx.gerarProtocolo ?? protocoloPadrao)(ctx.agora)
  const novo: Estado = { ...estado, etapa: "transferido", protocolo, departamento }
  return {
    estado: novo,
    respostas: [
      `${intro ? intro + " " : ""}Vou encaminhar você para a equipe de ${ROTULO_DEPARTAMENTO[departamento]}. Protocolo: ${protocolo}. Em breve alguém continua este atendimento por aqui.`,
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
        respostas: [`Obrigado, ${estado.cliente.nome.split(" ")[0]}! Identidade confirmada.`, ...saida.respostas],
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
      respostas: ["Esses dígitos não conferem. Envie os 4 últimos dígitos do CPF/CNPJ cadastrado."],
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
    const nome = estado.cliente ? `, ${estado.cliente.nome.split(" ")[0]}` : ""
    return { estado, respostas: [`Olá${nome}! Sou a assistente virtual da Colucci. ${MENU}`], eventos }
  }

  if (intencao === "desconhecida") {
    const n = estado.naoEntendidas + 1
    if (n >= MAX_NAO_ENTENDIDAS) {
      const s = escalar({ ...estado, naoEntendidas: n }, ctx, intencao, "nao_entendida")
      return { ...s, eventos: [...eventos, ...s.eventos] }
    }
    return { estado: { ...estado, naoEntendidas: n }, respostas: [`Não consegui entender bem. ${MENU}`], eventos }
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
      respostas: [`Para sua segurança, confirme os 4 últimos dígitos do CPF/CNPJ cadastrado, ${r.dados.nome.split(" ")[0]}.`],
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
        return { estado, respostas: ["Você não tem boletos em aberto no momento. 🎉"], eventos: [...ev, { tipo: "resolvido_automaticamente" }] }
      }
      const total = boletos.reduce((s, b) => s + b.valor, 0)
      return {
        estado,
        respostas: [`Encontrei ${boletos.length} boleto(s) em aberto (total ${brl(total)}):`, ...boletos.map(textoBoleto)],
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
