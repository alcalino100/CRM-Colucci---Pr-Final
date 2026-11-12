import {
  MOTIVO_ARQUIVAMENTO_LABEL,
  type Lead,
  type MotivoArquivamento,
} from "@/lib/mock-data"
import { adicionarMesesBrasilia } from "@/components/arquivar-lead-dialog"

export interface KpisArquivados {
  total: number
  reaparece30d: number
  vencidos: number
  taxaConversao: number
  totalReativados: number
  reativadosVenda: number
  motivosOrdenados: [string, number][]
}

export function calcularKpisArquivados(
  arquivadosBase: Lead[],
  leads: Lead[],
  hoje: string,
  daqui30dias: string
): KpisArquivados {
  const total = arquivadosBase.length
  const reaparece30d = arquivadosBase.filter(
    (l) => l.dataReaparecimento && l.dataReaparecimento >= hoje && l.dataReaparecimento <= daqui30dias
  ).length
  const vencidos = arquivadosBase.filter(
    (l) => l.dataReaparecimento && l.dataReaparecimento < hoje
  ).length

  // Leads que foram reativados no passado
  const todosReativados = leads.filter((l) => Boolean(l.reativadoEm))
  const reativadosVenda = todosReativados.filter((l) => l.status === "fechado").length
  const taxaConversao =
    todosReativados.length > 0
      ? Math.round((reativadosVenda / todosReativados.length) * 100)
      : 0

  // Motivos mais frequentes
  const contagemMotivos: Record<string, number> = {}
  arquivadosBase.forEach((l) => {
    const m = l.motivoArquivamento || "Outro"
    contagemMotivos[m] = (contagemMotivos[m] || 0) + 1
  })
  const motivosOrdenados = Object.entries(contagemMotivos).sort((a, b) => b[1] - a[1])

  return {
    total,
    reaparece30d,
    vencidos,
    taxaConversao,
    totalReativados: todosReativados.length,
    reativadosVenda,
    motivosOrdenados,
  }
}

export interface FiltrosArquivadosParams {
  busca: string
  isGestor: boolean
  filtroCorretor: string
  filtroMotivo: string
  filtroOrigem: string
  filtroReaparece: string
  hoje: string
  daqui30dias: string
  dataInicioCustom: string
  dataFimCustom: string
}

export function filtrarLeadsArquivados(
  arquivadosBase: Lead[],
  params: FiltrosArquivadosParams
): Lead[] {
  const {
    busca,
    isGestor,
    filtroCorretor,
    filtroMotivo,
    filtroOrigem,
    filtroReaparece,
    hoje,
    daqui30dias,
    dataInicioCustom,
    dataFimCustom,
  } = params

  const q = busca.trim().toLowerCase()

  return arquivadosBase.filter((l) => {
    // Filtro corretor (somente gestor pode ver outros)
    if (isGestor && filtroCorretor !== "todos" && l.corretorId !== filtroCorretor) {
      return false
    }

    // Filtro motivo
    if (filtroMotivo !== "todos" && l.motivoArquivamento !== filtroMotivo) {
      return false
    }

    // Filtro origem
    if (filtroOrigem !== "todas" && l.origem !== filtroOrigem) {
      return false
    }

    // Filtro data de reaparecimento
    if (filtroReaparece === "vencidos") {
      if (!l.dataReaparecimento || l.dataReaparecimento >= hoje) return false
    } else if (filtroReaparece === "proximos_30d") {
      if (!l.dataReaparecimento || l.dataReaparecimento < hoje || l.dataReaparecimento > daqui30dias)
        return false
    } else if (filtroReaparece === "este_mes") {
      const mesAtual = hoje.slice(0, 7)
      if (!l.dataReaparecimento || !l.dataReaparecimento.startsWith(mesAtual)) return false
    } else if (filtroReaparece === "proximos_6m") {
      const limite6m = adicionarMesesBrasilia(6)
      if (!l.dataReaparecimento || l.dataReaparecimento < hoje || l.dataReaparecimento > limite6m)
        return false
    } else if (filtroReaparece === "custom") {
      if (dataInicioCustom && (!l.dataReaparecimento || l.dataReaparecimento < dataInicioCustom))
        return false
      if (dataFimCustom && (!l.dataReaparecimento || l.dataReaparecimento > dataFimCustom))
        return false
    }

    // Busca textual
    if (q) {
      const matchNome = l.nome.toLowerCase().includes(q)
      const matchTel = l.telefone?.toLowerCase().includes(q)
      const matchEmail = l.email?.toLowerCase().includes(q)
      const matchObs =
        l.observacaoArquivamento?.toLowerCase().includes(q) || l.observacoes?.toLowerCase().includes(q)
      if (!matchNome && !matchTel && !matchEmail && !matchObs) return false
    }

    return true
  })
}

export function gerarConteudoCsvArquivados(
  leads: Lead[],
  userName: (id: string) => string
): string {
  const cabecalho = [
    "Nome",
    "Telefone",
    "E-mail",
    "Corretor",
    "Origem",
    "Motivo Arquivamento",
    "Data Arquivamento",
    "Previsao Reaparecimento",
    "Status Anterior",
    "Reativacoes",
    "Observacao",
  ]

  const linhas = leads.map((l) => [
    `"${(l.nome || "").replace(/"/g, '""')}"`,
    `"${(l.telefone || "").replace(/"/g, '""')}"`,
    `"${(l.email || "").replace(/"/g, '""')}"`,
    `"${(userName(l.corretorId) || l.corretorId || "").replace(/"/g, '""')}"`,
    `"${(l.origem || "").replace(/"/g, '""')}"`,
    `"${(MOTIVO_ARQUIVAMENTO_LABEL[l.motivoArquivamento as MotivoArquivamento] || l.motivoArquivamento || "").replace(/"/g, '""')}"`,
    `"${l.arquivadoEm ? l.arquivadoEm.slice(0, 10) : ""}"`,
    `"${l.dataReaparecimento || ""}"`,
    `"${l.statusAnterior || ""}"`,
    `"${l.reativacoesCount || 0}"`,
    `"${(l.observacaoArquivamento || l.observacoes || "").replace(/"/g, '""')}"`,
  ])

  return "\uFEFF" + [cabecalho.join(";"), ...linhas.map((row) => row.join(";"))].join("\n")
}

export function fmtDataBr(d?: string | null): string {
  if (!d) return "—"
  const raw = d.split("T")[0]
  const p = raw.split("-")
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : raw
}
