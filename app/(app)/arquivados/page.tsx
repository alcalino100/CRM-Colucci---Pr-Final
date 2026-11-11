"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  Archive,
  ArchiveRestore,
  Calendar,
  CalendarDays,
  CheckSquare,
  Clock,
  Download,
  Filter,
  Phone,
  Mail,
  Search,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  AlertTriangle,
  ArrowUpDown,
  ExternalLink,
  ShieldAlert,
} from "lucide-react"
import { useLeads } from "@/lib/leads-store"
import { useAuth } from "@/lib/auth-context"
import { isGestorNivel, podeVendas } from "@/lib/roles"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Dialog,
  Input,
  Label,
  Select,
  Textarea,
  useToast,
} from "@/components/ui/primitives"
import { Button } from "@/components/ui/button"
import { PageHeading } from "@/components/ui/page-heading"
import {
  MOTIVOS_ARQUIVAMENTO,
  MOTIVO_ARQUIVAMENTO_LABEL,
  ORIGENS,
  type Lead,
  type MotivoArquivamento,
  type Origem,
} from "@/lib/mock-data"
import { STATUS_LABEL, STATUS_VARIANT } from "@/lib/labels"
import {
  getHojeBrasilia,
  adicionarDiasBrasilia,
  adicionarMesesBrasilia,
} from "@/components/arquivar-lead-dialog"
import { cn } from "@/lib/utils"

export default function ArquivadosPage() {
  const { user } = useAuth()
  const { leads, corretores, userName, desarquivarLead, updateLeadsBulk, deleteLead, arquivarLeadComData } = useLeads()
  const toast = useToast()

  // Permissões
  const isGestor = Boolean(user && isGestorNivel(user.role))
  const canAccess = Boolean(user && podeVendas(user.role))

  // Filtros
  const [busca, setBusca] = useState("")
  const [filtroCorretor, setFiltroCorretor] = useState(isGestor ? "todos" : user?.id || "todos")
  const [filtroMotivo, setFiltroMotivo] = useState<string>("todos")
  const [filtroReaparece, setFiltroReaparece] = useState<string>("todos")
  const [dataInicioCustom, setDataInicioCustom] = useState("")
  const [dataFimCustom, setDataFimCustom] = useState("")
  const [filtroOrigem, setFiltroOrigem] = useState<string>("todas")

  // Seleção múltipla
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Modais de ação em lote ou individual
  const [modalDataOpen, setModalDataOpen] = useState(false)
  const [novaDataReaparecimento, setNovaDataReaparecimento] = useState(() => adicionarMesesBrasilia(3))
  const [modalCorretorOpen, setModalCorretorOpen] = useState(false)
  const [novoCorretorId, setNovoCorretorId] = useState("")
  const [modalExcluirOpen, setModalExcluirOpen] = useState(false)
  const [motivoExclusao, setMotivoExclusao] = useState("")
  const [submittingAction, setSubmittingAction] = useState(false)

  const hoje = useMemo(() => getHojeBrasilia(), [])
  const daqui30dias = useMemo(() => adicionarDiasBrasilia(30), [])

  // Filtragem inicial: apenas leads que estão atualmente arquivados
  // E corretores comuns só podem ver seus próprios leads arquivados
  const arquivadosBase = useMemo(() => {
    return leads.filter((l) => {
      if (!l.arquivadoEm) return false
      if (!isGestor && l.corretorId !== user?.id) return false
      return true
    })
  }, [leads, isGestor, user?.id])

  // KPIs calculados sobre o universo acessível
  const kpis = useMemo(() => {
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
    const taxaConversao = todosReativados.length > 0
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
  }, [arquivadosBase, leads, hoje, daqui30dias])

  // Aplicação dos filtros do usuário
  const arquivadosFiltrados = useMemo(() => {
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
        if (!l.dataReaparecimento || l.dataReaparecimento < hoje || l.dataReaparecimento > daqui30dias) return false
      } else if (filtroReaparece === "este_mes") {
        const mesAtual = hoje.slice(0, 7)
        if (!l.dataReaparecimento || !l.dataReaparecimento.startsWith(mesAtual)) return false
      } else if (filtroReaparece === "proximos_6m") {
        const limite6m = adicionarMesesBrasilia(6)
        if (!l.dataReaparecimento || l.dataReaparecimento < hoje || l.dataReaparecimento > limite6m) return false
      } else if (filtroReaparece === "custom") {
        if (dataInicioCustom && (!l.dataReaparecimento || l.dataReaparecimento < dataInicioCustom)) return false
        if (dataFimCustom && (!l.dataReaparecimento || l.dataReaparecimento > dataFimCustom)) return false
      }

      // Busca textual
      if (q) {
        const matchNome = l.nome.toLowerCase().includes(q)
        const matchTel = l.telefone?.toLowerCase().includes(q)
        const matchEmail = l.email?.toLowerCase().includes(q)
        const matchObs = l.observacaoArquivamento?.toLowerCase().includes(q) || l.observacoes?.toLowerCase().includes(q)
        if (!matchNome && !matchTel && !matchEmail && !matchObs) return false
      }

      return true
    })
  }, [
    arquivadosBase,
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
  ])

  // Selecionar todos os visíveis
  const allSelected = arquivadosFiltrados.length > 0 && arquivadosFiltrados.every((l) => selectedIds.has(l.id))
  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(arquivadosFiltrados.map((l) => l.id)))
    }
  }

  function toggleSelectLead(id: string) {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  // Ação: Desarquivar selecionados
  async function handleDesarquivarSelecionados() {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    if (!confirm(`Deseja realmente desarquivar ${ids.length} lead(s)? Eles voltarão ao funil ativo imediatamente.`)) {
      return
    }

    setSubmittingAction(true)
    let okCount = 0
    for (const id of ids) {
      const res = await desarquivarLead(id)
      if (res.ok) okCount++
    }
    setSubmittingAction(false)
    setSelectedIds(new Set())
    toast(`${okCount} lead(s) desarquivado(s) com sucesso.`)
  }

  // Ação: Alterar data de reaparecimento em lote
  async function handleSalvarNovaData() {
    if (selectedIds.size === 0 || !novaDataReaparecimento) return
    if (novaDataReaparecimento <= hoje) {
      toast("A nova data de reaparecimento deve ser no futuro.", "error")
      return
    }

    setSubmittingAction(true)
    const res = await updateLeadsBulk(Array.from(selectedIds), {
      dataReaparecimento: novaDataReaparecimento,
    })
    setSubmittingAction(false)

    if (res.ok) {
      toast(`Data de reaparecimento atualizada para ${selectedIds.size} lead(s).`)
      setModalDataOpen(false)
      setSelectedIds(new Set())
    } else {
      toast(res.error || "Erro ao atualizar data em lote.", "error")
    }
  }

  // Ação: Trocar responsável em lote (apenas gestor)
  async function handleSalvarNovoCorretor() {
    if (selectedIds.size === 0 || !novoCorretorId) return

    setSubmittingAction(true)
    const res = await updateLeadsBulk(Array.from(selectedIds), {
      corretorId: novoCorretorId,
    })
    setSubmittingAction(false)

    if (res.ok) {
      toast(`Responsável atualizado para ${selectedIds.size} lead(s).`)
      setModalCorretorOpen(false)
      setSelectedIds(new Set())
    } else {
      toast(res.error || "Erro ao atualizar corretor.", "error")
    }
  }

  // Ação: Excluir em lote (apenas gestor)
  async function handleExcluirSelecionados() {
    if (selectedIds.size === 0 || !motivoExclusao.trim()) return

    setSubmittingAction(true)
    let count = 0
    for (const id of Array.from(selectedIds)) {
      const ok = await deleteLead(id, motivoExclusao)
      if (ok) count++
    }
    setSubmittingAction(false)

    toast(`${count} lead(s) excluído(s).`)
    setModalExcluirOpen(false)
    setMotivoExclusao("")
    setSelectedIds(new Set())
  }

  // Desarquivar individual
  async function handleDesarquivarIndividual(lead: Lead) {
    const res = await desarquivarLead(lead.id)
    if (res.ok) {
      toast(`Lead "${lead.nome}" desarquivado com sucesso.`)
    } else {
      toast(res.error || "Erro ao desarquivar lead.", "error")
    }
  }

  // Exportar CSV
  function handleExportarCsv() {
    if (arquivadosFiltrados.length === 0) {
      toast("Nenhum lead arquivado para exportar.", "error")
      return
    }

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

    const linhas = arquivadosFiltrados.map((l) => [
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

    const csvContent = "\uFEFF" + [cabecalho.join(";"), ...linhas.map((row) => row.join(";"))].join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `leads-arquivados-${hoje}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast("Planilha CSV gerada com sucesso!")
  }

  const fmtDataBr = (d?: string | null) => {
    if (!d) return "—"
    const raw = d.split("T")[0]
    const p = raw.split("-")
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : raw
  }

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertTriangle className="size-10 text-amber-500 mb-2" />
        <h2 className="text-lg font-semibold">Acesso Restrito</h2>
        <p className="text-sm text-muted-foreground">Você não possui permissão para visualizar esta área.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeading
          title="Leads Arquivados"
          subtitle="Hibernação programada: leads fora do funil ativo com data definida para reaparecimento."
        />
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={handleExportarCsv}>
            <Download className="size-4" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Indicadores / KPIs para Gestores */}
      {isGestor && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Total Arquivados
              </CardTitle>
              <Archive className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpis.total}</div>
              <p className="text-xs text-muted-foreground mt-1">Leads em hibernação na equipe</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Reaparecem em 30d
              </CardTitle>
              <Clock className="size-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{kpis.reaparece30d}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {kpis.vencidos > 0 ? (
                  <span className="text-red-600 font-medium">{kpis.vencidos} já com prazo vencido</span>
                ) : (
                  "Prontos para reativação diária"
                )}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Taxa de Vendas Reativadas
              </CardTitle>
              <Sparkles className="size-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{kpis.taxaConversao}%</div>
              <p className="text-xs text-muted-foreground mt-1">
                {kpis.reativadosVenda} de {kpis.totalReativados} reativados viraram fechamento
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Motivo Principal
              </CardTitle>
              <CalendarDays className="size-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-base font-bold truncate">
                {kpis.motivosOrdenados[0]
                  ? (MOTIVO_ARQUIVAMENTO_LABEL[kpis.motivosOrdenados[0][0] as MotivoArquivamento] || kpis.motivosOrdenados[0][0])
                  : "Nenhum"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {kpis.motivosOrdenados[0] ? `${kpis.motivosOrdenados[0][1]} lead(s) com este motivo` : "Sem dados"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Barra de Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {/* Busca textual */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, fone, obs..."
                className="pl-9"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                aria-label="Buscar lead arquivado"
              />
            </div>

            {/* Corretor (apenas gestor pode escolher outros) */}
            {isGestor ? (
              <Select
                value={filtroCorretor}
                onChange={(e) => setFiltroCorretor(e.target.value)}
                aria-label="Filtrar por corretor"
              >
                <option value="todos">Todos os corretores</option>
                {corretores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            ) : (
              <div className="flex h-10 items-center rounded-lg border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                <span className="truncate">Meus leads arquivados</span>
              </div>
            )}

            {/* Motivo */}
            <Select
              value={filtroMotivo}
              onChange={(e) => setFiltroMotivo(e.target.value)}
              aria-label="Filtrar por motivo"
            >
              <option value="todos">Todos os motivos</option>
              {MOTIVOS_ARQUIVAMENTO.map((m) => (
                <option key={m} value={m}>
                  {MOTIVO_ARQUIVAMENTO_LABEL[m]}
                </option>
              ))}
            </Select>

            {/* Reaparecimento */}
            <Select
              value={filtroReaparece}
              onChange={(e) => setFiltroReaparece(e.target.value)}
              aria-label="Filtrar por data de reaparecimento"
            >
              <option value="todos">Todo o cronograma</option>
              <option value="vencidos">Vencidos (hoje ou antes)</option>
              <option value="proximos_30d">Próximos 30 dias</option>
              <option value="este_mes">Este mês</option>
              <option value="proximos_6m">Próximos 6 meses</option>
              <option value="custom">Personalizado...</option>
            </Select>

            {/* Origem */}
            <Select
              value={filtroOrigem}
              onChange={(e) => setFiltroOrigem(e.target.value)}
              aria-label="Filtrar por origem"
            >
              <option value="todas">Todas as origens</option>
              {ORIGENS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          </div>

          {/* Filtro de datas personalizado */}
          {filtroReaparece === "custom" && (
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3 text-sm">
              <span className="text-muted-foreground">Período de reaparecimento:</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">De:</span>
                <Input
                  type="date"
                  className="w-auto h-8 text-xs"
                  value={dataInicioCustom}
                  onChange={(e) => setDataInicioCustom(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Até:</span>
                <Input
                  type="date"
                  className="w-auto h-8 text-xs"
                  value={dataFimCustom}
                  onChange={(e) => setDataFimCustom(e.target.value)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Barra de Ações em Lote */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <CheckSquare className="size-4 text-primary" />
            <span>{selectedIds.size} lead(s) selecionado(s)</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-emerald-600/30 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
              onClick={handleDesarquivarSelecionados}
              disabled={submittingAction}
            >
              <ArchiveRestore className="size-3.5" />
              Desarquivar agora
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setModalDataOpen(true)}
              disabled={submittingAction}
            >
              <Calendar className="size-3.5" />
              Alterar data
            </Button>

            {isGestor && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setModalCorretorOpen(true)}
                disabled={submittingAction}
              >
                <UserCheck className="size-3.5" />
                Trocar corretor
              </Button>
            )}

            {isGestor && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={() => setModalExcluirOpen(true)}
                disabled={submittingAction}
              >
                <Trash2 className="size-3.5" />
                Excluir
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
              disabled={submittingAction}
            >
              Limpar seleção
            </Button>
          </div>
        </div>
      )}

      {/* Tabela de Leads Arquivados */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground uppercase">
              <tr>
                <th className="w-10 px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-border"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label="Selecionar todos os leads arquivados visíveis"
                  />
                </th>
                <th className="px-4 py-3">Lead</th>
                <th className="px-4 py-3">Contato</th>
                <th className="px-4 py-3">Responsável</th>
                <th className="px-4 py-3">Motivo & Observação</th>
                <th className="px-4 py-3">Arquivado Em</th>
                <th className="px-4 py-3">Reaparecimento</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {arquivadosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Archive className="size-8 text-muted-foreground/60" />
                      <p className="font-medium text-foreground">Nenhum lead arquivado encontrado</p>
                      <p className="text-xs text-muted-foreground">
                        {arquivadosBase.length === 0
                          ? "Quando você arquivar leads com data de reaparecimento no funil, eles aparecerão aqui."
                          : "Tente ajustar os filtros ou a busca textual."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                arquivadosFiltrados.map((lead) => {
                  const isSelected = selectedIds.has(lead.id)
                  const isVencido = Boolean(lead.dataReaparecimento && lead.dataReaparecimento <= hoje)
                  const isReincidente = (lead.reativacoesCount || 0) > 0

                  return (
                    <tr
                      key={lead.id}
                      className={cn(
                        "transition-colors hover:bg-muted/40",
                        isSelected && "bg-primary/5"
                      )}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          className="size-4 rounded border-border"
                          checked={isSelected}
                          onChange={() => toggleSelectLead(lead.id)}
                          aria-label={`Selecionar lead ${lead.nome}`}
                        />
                      </td>

                      {/* Nome e tags */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <Link
                            href={`/painel-corretor/${lead.id}`}
                            className="font-semibold text-foreground hover:underline flex items-center gap-1.5"
                          >
                            <span>{lead.nome}</span>
                            <ExternalLink className="size-3 text-muted-foreground" />
                          </Link>

                          <div className="flex flex-wrap items-center gap-1">
                            <Badge variant="gray" className="text-[10px]">
                              {lead.origem}
                            </Badge>
                            {lead.statusAnterior && (
                              <Badge variant="slate" className="text-[10px]">
                                Volta como: {(STATUS_LABEL as Record<string, string>)[lead.statusAnterior] || lead.statusAnterior}
                              </Badge>
                            )}
                            {isReincidente && (
                              <Badge variant="amber" className="text-[10px] font-bold">
                                {lead.reativacoesCount}x reativado
                              </Badge>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Contato e LGPD */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1 text-xs">
                          {lead.telefone && (
                            <span className="flex items-center gap-1 font-mono text-foreground">
                              <Phone className="size-3 text-muted-foreground" />
                              {lead.telefone}
                            </span>
                          )}
                          {lead.email && (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Mail className="size-3" />
                              {lead.email}
                            </span>
                          )}
                          {lead.consentimentoContato === false && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-500/15 rounded px-1.5 py-0.5 border border-amber-500/30 dark:text-amber-300 dark:bg-amber-950/40">
                              <ShieldAlert className="size-2.5" />
                              Confirmar consentimento
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Responsável */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-xs font-medium">
                          <Users className="size-3.5 text-muted-foreground" />
                          <span>{userName(lead.corretorId) || lead.corretorId || "Não atribuído"}</span>
                        </div>
                      </td>

                      {/* Motivo & Observação */}
                      <td className="px-4 py-3 max-w-xs">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-foreground text-xs">
                            {MOTIVO_ARQUIVAMENTO_LABEL[lead.motivoArquivamento as MotivoArquivamento] ||
                              lead.motivoArquivamento ||
                              "Outro"}
                          </span>
                          {(lead.observacaoArquivamento || lead.observacoes) && (
                            <p className="text-xs text-muted-foreground truncate" title={lead.observacaoArquivamento || lead.observacoes}>
                              {lead.observacaoArquivamento || lead.observacoes}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Data de Arquivamento */}
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {fmtDataBr(lead.arquivadoEm)}
                      </td>

                      {/* Data Prevista de Reaparecimento */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span
                            className={cn(
                              "text-xs font-semibold",
                              isVencido ? "text-destructive font-bold" : "text-amber-600 dark:text-amber-400"
                            )}
                          >
                            {fmtDataBr(lead.dataReaparecimento)}
                          </span>
                          {isVencido && (
                            <span className="text-[10px] font-bold text-red-600">
                              Vencido (reativar)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Ações Rápidas */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                            title="Desarquivar agora"
                            onClick={() => handleDesarquivarIndividual(lead)}
                          >
                            <ArchiveRestore className="size-4" />
                            <span className="sr-only">Desarquivar</span>
                          </Button>

                          <Link href={`/painel-corretor/${lead.id}`}>
                            <Button variant="ghost" size="sm" className="h-8 px-2" title="Ver ficha completa">
                              <ExternalLink className="size-4" />
                              <span className="sr-only">Ver ficha</span>
                            </Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal de Alteração de Data em Lote */}
      <Dialog
        open={modalDataOpen}
        onClose={() => setModalDataOpen(false)}
        title="Alterar Data de Reaparecimento"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Defina uma nova data de hibernação programada para os{" "}
            <strong>{selectedIds.size}</strong> lead(s) selecionado(s).
          </p>

          <div className="flex flex-wrap gap-1.5">
            {[
              { id: "30d", label: "+30 dias", calc: () => adicionarDiasBrasilia(30) },
              { id: "90d", label: "+90 dias", calc: () => adicionarDiasBrasilia(90) },
              { id: "6m", label: "+6 meses", calc: () => adicionarMesesBrasilia(6) },
              { id: "1a", label: "+1 ano", calc: () => adicionarMesesBrasilia(12) },
            ].map((at) => (
              <Button
                key={at.id}
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => setNovaDataReaparecimento(at.calc())}
              >
                {at.label}
              </Button>
            ))}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="nova-data">Nova data de reaparecimento</Label>
            <Input
              id="nova-data"
              type="date"
              min={adicionarDiasBrasilia(1)}
              max={adicionarMesesBrasilia(24)}
              value={novaDataReaparecimento}
              onChange={(e) => setNovaDataReaparecimento(e.target.value)}
            />
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalDataOpen(false)}
              disabled={submittingAction}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSalvarNovaData}
              disabled={submittingAction || !novaDataReaparecimento}
            >
              {submittingAction ? "Salvando..." : "Atualizar data"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Modal de Troca de Corretor Responsável em Lote */}
      <Dialog
        open={modalCorretorOpen}
        onClose={() => setModalCorretorOpen(false)}
        title="Trocar Corretor Responsável"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Selecione o novo corretor responsável para os{" "}
            <strong>{selectedIds.size}</strong> lead(s) arquivado(s).
          </p>

          <div className="grid gap-1.5">
            <Label htmlFor="novo-corretor">Novo corretor</Label>
            <Select
              id="novo-corretor"
              value={novoCorretorId}
              onChange={(e) => setNovoCorretorId(e.target.value)}
            >
              <option value="">Selecione um corretor...</option>
              {corretores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} ({c.email})
                </option>
              ))}
            </Select>
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalCorretorOpen(false)}
              disabled={submittingAction}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSalvarNovoCorretor}
              disabled={submittingAction || !novoCorretorId}
            >
              {submittingAction ? "Salvando..." : "Confirmar troca"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Modal de Exclusão em Lote */}
      <Dialog
        open={modalExcluirOpen}
        onClose={() => setModalExcluirOpen(false)}
        title="Excluir Leads Arquivados"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
            <AlertTriangle className="size-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Ação irreversível</p>
              <p className="text-xs">
                Esta ação excluirá permanentemente os <strong>{selectedIds.size}</strong> lead(s) selecionados e registrará um log de auditoria com a justificativa.
              </p>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="motivo-exclusao">Motivo da exclusão (obrigatório)</Label>
            <Textarea
              id="motivo-exclusao"
              rows={3}
              value={motivoExclusao}
              onChange={(e) => setMotivoExclusao(e.target.value)}
              placeholder="Explique o motivo para o registro nos logs de auditoria..."
            />
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalExcluirOpen(false)}
              disabled={submittingAction}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleExcluirSelecionados}
              disabled={submittingAction || !motivoExclusao.trim()}
            >
              {submittingAction ? "Excluindo..." : "Excluir definitivamente"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
