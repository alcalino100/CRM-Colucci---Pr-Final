"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { useLeads } from "@/lib/leads-store"
import { useAuth } from "@/lib/auth-context"
import { isGestorNivel, podeVendas } from "@/lib/roles"
import { Skeleton, useToast } from "@/components/ui/primitives"
import { PageHeading } from "@/components/ui/page-heading"
import { ORIGENS, type LeadStatus, type Origem } from "@/lib/mock-data"
import { FunilROI } from "@/components/funil-roi"
import {
  ymd,
  addDays,
  variacao,
  fmtDia,
  separateCadastrosLeads,
  groupCadastrosPorDia,
  isLeadNovoNoPeriodo,
  type CadastrosFilters,
  type CriterioData,
  type AbaCadastros,
} from "@/components/cadastros/cadastros-utils"
import dynamic from "next/dynamic"
import { CadastrosFilterBar } from "@/components/cadastros/CadastrosFilterBar"
import { CadastrosKpis } from "@/components/cadastros/CadastrosKpis"
import { CadastrosList } from "@/components/cadastros/CadastrosList"

const CadastrosChart = dynamic(
  () => import("@/components/cadastros/CadastrosChart").then((m) => m.CadastrosChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 w-full rounded-xl border border-border/50 bg-card p-4 animate-pulse">
        <div className="h-full w-full rounded-lg bg-muted/30" />
      </div>
    ),
  }
)

const fetcher = (u: string) => fetch(u).then((r) => r.json())

export default function CadastrosPage() {
  const { user } = useAuth()
  const { leads, corretores, userName, updateLeadsBulk } = useLeads()
  const toast = useToast()
  const [loading, setLoading] = useState(true)

  // Filters state
  const [dataInicio, setDataInicio] = useState(() => ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
  const [dataFim, setDataFim] = useState(() => ymd(new Date()))
  const [corretor, setCorretor] = useState("todos")
  const [origem, setOrigem] = useState<Origem | "todas">("todas")
  const [status, setStatus] = useState<LeadStatus | "todos">("todos")
  const [criterioData, setCriterioData] = useState<CriterioData>("criacao")
  const [abaLeads, setAbaLeads] = useState<AbaCadastros>("novos")
  const [showArchived, setShowArchived] = useState(false)

  // Bulk actions state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  const [bulkSubmitting, setBulkSubmitting] = useState(false)

  // Meta Ads insights
  const { data: contasData } = useSWR("/api/meta?op=accounts", fetcher)
  const contaIds = useMemo(() => (contasData?.data ?? []).map((c: { id: string }) => c.id), [contasData])
  const insightsKey =
    contaIds.length > 0 ? `/api/meta?op=insights&node=${contaIds[0]}&since=${dataInicio}&until=${dataFim}` : null
  const { data: insightsData, isLoading: loadingMeta } = useSWR(insightsKey, fetcher)

  const investimentoMeta = useMemo(() => {
    if (!insightsData?.data) return null
    return (insightsData.data as { spend?: string | number }[]).reduce(
      (s: number, r) => s + Number(r.spend || 0),
      0
    )
  }, [insightsData])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 300)
    return () => clearTimeout(t)
  }, [])

  const filters: CadastrosFilters = useMemo(
    () => ({
      dataInicio,
      dataFim,
      corretor,
      origem,
      status,
      criterioData,
      abaLeads,
      showArchived,
    }),
    [dataInicio, dataFim, corretor, origem, status, criterioData, abaLeads, showArchived]
  )

  function handleUpdateFilters(updates: Partial<CadastrosFilters>) {
    if (updates.dataInicio !== undefined) setDataInicio(updates.dataInicio)
    if (updates.dataFim !== undefined) setDataFim(updates.dataFim)
    if (updates.corretor !== undefined) setCorretor(updates.corretor)
    if (updates.origem !== undefined) setOrigem(updates.origem)
    if (updates.status !== undefined) setStatus(updates.status)
    if (updates.criterioData !== undefined) setCriterioData(updates.criterioData)
    if (updates.abaLeads !== undefined) setAbaLeads(updates.abaLeads)
    if (updates.showArchived !== undefined) setShowArchived(updates.showArchived)
  }

  // Separar novos de antigos
  const separados = useMemo(() => separateCadastrosLeads(leads, filters), [leads, filters])

  // Dias no intervalo selecionado
  const dias = useMemo(() => {
    const iniT = new Date(dataInicio + "T00:00:00")
    const fimT = new Date(dataFim + "T00:00:00")
    if (!dataInicio || !dataFim || isNaN(iniT.getTime()) || isNaN(fimT.getTime())) return 1
    return Math.max(1, Math.round((fimT.getTime() - iniT.getTime()) / 86400000) + 1)
  }, [dataInicio, dataFim])

  // Comparativo com período anterior
  const comparativo = useMemo(() => {
    if (!dataInicio || !dataFim) return null
    const prevIni = addDays(dataInicio, -dias)
    const prevFim = addDays(dataInicio, -1)

    const prevLeads = leads.filter(
      (l) =>
        (!showArchived ? !l.arquivadoEm : true) &&
        (corretor === "todos" || l.corretorId === corretor) &&
        (origem === "todas" || l.origem === origem) &&
        (status === "todos" || l.status === status) &&
        isLeadNovoNoPeriodo(l, prevIni, prevFim)
    )

    const prevFechados = prevLeads.filter((l) => l.status === "fechado").length

    return {
      prevIni,
      prevFim,
      novos: { cur: separados.novos.length, prev: prevLeads.length },
      media: { cur: separados.novos.length / dias, prev: prevLeads.length / dias },
      fechados: {
        cur: separados.novos.filter((l) => l.status === "fechado").length,
        prev: prevFechados,
      },
    }
  }, [dataInicio, dataFim, dias, leads, showArchived, corretor, origem, status, separados.novos])

  // Gráfico por dia (baseado exclusivamente nos cadastros novos do período)
  const porDia = useMemo(() => {
    return groupCadastrosPorDia(separados.novos, dataInicio, dataFim)
  }, [separados.novos, dataInicio, dataFim])

  // Distribuição por status
  const porStatus = useMemo(() => {
    const m = new Map<LeadStatus, number>()
    for (const l of separados.exibidos) m.set(l.status, (m.get(l.status) ?? 0) + 1)
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  }, [separados.exibidos])

  // Distribuição por origem
  const porOrigem = useMemo(() => {
    return ORIGENS.map((o) => ({
      origem: o,
      total: separados.exibidos.filter((l) => l.origem === o).length,
    }))
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [separados.exibidos])

  // Seleção de itens
  const allFilteredSelected =
    separados.exibidos.length > 0 && separados.exibidos.every((l) => selectedIds.has(l.id))

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (allFilteredSelected) return new Set()
      return new Set(separados.exibidos.map((l) => l.id))
    })
  }

  async function handleBulkSubmit(patch: Record<string, unknown>) {
    setBulkSubmitting(true)
    const result = await updateLeadsBulk(Array.from(selectedIds), patch)
    setBulkSubmitting(false)
    if (result.ok) {
      toast(
        `✓ ${result.updated ?? selectedIds.size} lead${selectedIds.size !== 1 ? "s" : ""} atualizado${
          selectedIds.size !== 1 ? "s" : ""
        }`
      )
      setSelectedIds(new Set())
      setBulkEditOpen(false)
    } else {
      toast(result.error ?? "Erro ao atualizar leads", "error")
    }
  }

  if (!user || !isGestorNivel(user.role) || !podeVendas(user.role)) {
    return <p className="py-16 text-center text-muted-foreground">Acesso restrito aos gestores.</p>
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 w-full lg:col-span-2" />
          <Skeleton className="h-64 w-full" />
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeading
        title="Leads Cadastrados"
        subtitle="Monitore os novos cadastros com separação clara de leads antigos da base e acompanhe a conversão."
        badge="Visão gerencial"
      />

      <CadastrosFilterBar
        filters={filters}
        onChangeFilters={handleUpdateFilters}
        corretores={corretores}
      />

      <CadastrosKpis
        totalNovos={separados.novos.length}
        totalAntigosAtivos={separados.antigosMovimentados.length}
        mediaNovosPorDia={separados.novos.length / dias}
        totalFechados={separados.novos.filter((l) => l.status === "fechado").length}
        dias={dias}
        comparativo={comparativo}
        variacao={variacao}
        fmtDia={fmtDia}
      />

      {/* Funil de Conversão — baseado no conjunto selecionado */}
      <FunilROI leads={separados.exibidos} investimento={investimentoMeta} loadingMeta={loadingMeta} />

      <CadastrosChart porDia={porDia} porStatus={porStatus} porOrigem={porOrigem} />

      <CadastrosList
        leads={separados.exibidos}
        novosCount={separados.novos.length}
        antigosCount={separados.antigosMovimentados.length}
        todosCount={separados.todos.length}
        abaLeads={abaLeads}
        onSelectAba={(aba) => setAbaLeads(aba)}
        dataInicio={dataInicio}
        dataFim={dataFim}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        allFilteredSelected={allFilteredSelected}
        onClearSelection={() => setSelectedIds(new Set())}
        bulkEditOpen={bulkEditOpen}
        setBulkEditOpen={setBulkEditOpen}
        bulkSubmitting={bulkSubmitting}
        onBulkSubmit={handleBulkSubmit}
        userName={userName}
      />
    </div>
  )
}
