"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, Download } from "lucide-react"
import { useLeads } from "@/lib/leads-store"
import { useAuth } from "@/lib/auth-context"
import { isGestorNivel, podeVendas } from "@/lib/roles"
import { useToast } from "@/components/ui/primitives"
import { Button } from "@/components/ui/button"
import { PageHeading } from "@/components/ui/page-heading"
import type { Lead } from "@/lib/mock-data"
import {
  getHojeBrasilia,
  adicionarDiasBrasilia,
  adicionarMesesBrasilia,
} from "@/components/arquivar-lead-dialog"
import {
  calcularKpisArquivados,
  filtrarLeadsArquivados,
  gerarConteudoCsvArquivados,
} from "@/lib/arquivados-utils"
import { ArquivadosKpiCards } from "@/components/arquivados/ArquivadosKpiCards"
import { ArquivadosFilterBar } from "@/components/arquivados/ArquivadosFilterBar"
import { ArquivadosBatchActions } from "@/components/arquivados/ArquivadosBatchActions"
import { ArquivadosTable } from "@/components/arquivados/ArquivadosTable"
import {
  ModalAlterarData,
  ModalTrocarCorretor,
  ModalExcluirLote,
} from "@/components/arquivados/ArquivadosModals"

export default function ArquivadosPage() {
  const { user } = useAuth()
  const { leads, corretores, userName, desarquivarLead, updateLeadsBulk, deleteLead } = useLeads()
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
    return calcularKpisArquivados(arquivadosBase, leads, hoje, daqui30dias)
  }, [arquivadosBase, leads, hoje, daqui30dias])

  // Aplicação dos filtros do usuário
  const arquivadosFiltrados = useMemo(() => {
    return filtrarLeadsArquivados(arquivadosBase, {
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

    const csvContent = gerarConteudoCsvArquivados(arquivadosFiltrados, userName)
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `leads-arquivados-${hoje}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast("Planilha CSV gerada com sucesso!")
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
      {isGestor && <ArquivadosKpiCards kpis={kpis} />}

      {/* Barra de Filtros */}
      <ArquivadosFilterBar
        busca={busca}
        setBusca={setBusca}
        isGestor={isGestor}
        filtroCorretor={filtroCorretor}
        setFiltroCorretor={setFiltroCorretor}
        filtroMotivo={filtroMotivo}
        setFiltroMotivo={setFiltroMotivo}
        filtroReaparece={filtroReaparece}
        setFiltroReaparece={setFiltroReaparece}
        filtroOrigem={filtroOrigem}
        setFiltroOrigem={setFiltroOrigem}
        dataInicioCustom={dataInicioCustom}
        setDataInicioCustom={setDataInicioCustom}
        dataFimCustom={dataFimCustom}
        setDataFimCustom={setDataFimCustom}
        corretores={corretores}
      />

      {/* Barra de Ações em Lote */}
      <ArquivadosBatchActions
        selectedCount={selectedIds.size}
        isGestor={isGestor}
        submittingAction={submittingAction}
        onDesarquivar={handleDesarquivarSelecionados}
        onOpenModalData={() => setModalDataOpen(true)}
        onOpenModalCorretor={() => setModalCorretorOpen(true)}
        onOpenModalExcluir={() => setModalExcluirOpen(true)}
        onClearSelection={() => setSelectedIds(new Set())}
      />

      {/* Tabela de Leads Arquivados */}
      <ArquivadosTable
        leads={arquivadosFiltrados}
        selectedIds={selectedIds}
        allSelected={allSelected}
        hasNoArquivadosBase={arquivadosBase.length === 0}
        hoje={hoje}
        userName={userName}
        onToggleSelectAll={toggleSelectAll}
        onToggleSelectLead={toggleSelectLead}
        onDesarquivarIndividual={handleDesarquivarIndividual}
      />

      {/* Modal de Alteração de Data em Lote */}
      <ModalAlterarData
        open={modalDataOpen}
        onClose={() => setModalDataOpen(false)}
        selectedCount={selectedIds.size}
        novaDataReaparecimento={novaDataReaparecimento}
        setNovaDataReaparecimento={setNovaDataReaparecimento}
        onSalvarNovaData={handleSalvarNovaData}
        submittingAction={submittingAction}
      />

      {/* Modal de Troca de Corretor Responsável em Lote */}
      <ModalTrocarCorretor
        open={modalCorretorOpen}
        onClose={() => setModalCorretorOpen(false)}
        selectedCount={selectedIds.size}
        novoCorretorId={novoCorretorId}
        setNovoCorretorId={setNovoCorretorId}
        corretores={corretores}
        onSalvarNovoCorretor={handleSalvarNovoCorretor}
        submittingAction={submittingAction}
      />

      {/* Modal de Exclusão em Lote */}
      <ModalExcluirLote
        open={modalExcluirOpen}
        onClose={() => setModalExcluirOpen(false)}
        selectedCount={selectedIds.size}
        motivoExclusao={motivoExclusao}
        setMotivoExclusao={setMotivoExclusao}
        onExcluirSelecionados={handleExcluirSelecionados}
        submittingAction={submittingAction}
      />
    </div>
  )
}
