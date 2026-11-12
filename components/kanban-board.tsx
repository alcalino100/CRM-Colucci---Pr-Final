"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { SearchX } from "lucide-react"
import { useToast } from "@/components/ui/primitives"
import { useLeads } from "@/lib/leads-store"
import { useAuth } from "@/lib/auth-context"
import { CORRETOR_HIDDEN } from "@/lib/pipeline-stages"
import { type Lead, type LeadStatus, type Temperatura } from "@/lib/mock-data"
import { lerFiltros, queryFiltros } from "@/lib/leads-filtros"
import { matchesLeadQuery, leadDentroPeriodo, sortLeadsByRecentDate } from "@/lib/kanban-utils"
import { useKanbanActions } from "@/lib/use-kanban-actions"
import { KanbanReativadosBanner } from "@/components/kanban/KanbanReativadosBanner"
import { KanbanFilterBar } from "@/components/kanban/KanbanFilterBar"
import { KanbanColumns } from "@/components/kanban/KanbanColumns"
import { KanbanDialogs } from "@/components/kanban/KanbanDialogs"

export function KanbanBoard({
  leads,
  showCorretor = false,
  currentCorretorId,
  isGestor = false,
  heightClass = "h-[calc(100vh-13rem)]",
}: {
  leads: Lead[]
  showCorretor?: boolean
  currentCorretorId: string
  isGestor?: boolean
  heightClass?: string
}) {
  const { corretores, userName } = useLeads()
  const { user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const filtros = lerFiltros(searchParams)
  const toast = useToast()

  const [tempFilter, setTempFilter] = useState<Temperatura | "todas">("todas")
  const [query, setQuery] = useState("")
  const [showArchived, setShowArchived] = useState(false)
  const [tagColorMap, setTagColorMap] = useState<Record<string, string>>({})
  const [filterReativados, setFilterReativados] = useState(false)

  // Etapas editáveis no Master
  const [, setStagesTick] = useState(0)
  useEffect(() => {
    const h = () => setStagesTick((t) => t + 1)
    window.addEventListener("crm-stages-change", h)
    return () => window.removeEventListener("crm-stages-change", h)
  }, [])

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok || !Array.isArray(j.tags)) return
        const map: Record<string, string> = {}
        for (const t of j.tags) map[t.name] = t.color
        setTagColorMap(map)
      })
      .catch(() => {})
  }, [])

  const usuarioNome = user ? userName(user.id) : "Sistema"

  const {
    canManage,
    onDragEnd,
    setEditLead,
    setDelLead,
    setAssumirDialog,
    setUploadMeta,
    setArchiveLead,
    setDesarquivarLead,
    dialogProps,
  } = useKanbanActions({
    leads,
    currentCorretorId,
    isGestor,
    user,
    usuarioNome,
  })

  // Persistência individual apenas para gestores
  useEffect(() => {
    if (!isGestor || !user?.id) return
    if (typeof window === "undefined") return
    if (searchParams.toString()) return
    try {
      const saved = window.localStorage.getItem(`crm-filtros:${user.id}`)
      if (saved) router.replace(`${pathname}?${saved}`, { scroll: false })
    } catch {}
  }, [searchParams, pathname, isGestor, user?.id, router])

  function updateFiltros(patch: Record<string, string | null | undefined>) {
    const qs = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") qs.delete(k)
      else qs.set(k, v)
    }
    const s = qs.toString()
    if (isGestor && user?.id && typeof window !== "undefined") {
      try {
        if (s) window.localStorage.setItem(`crm-filtros:${user.id}`, s)
        else window.localStorage.removeItem(`crm-filtros:${user.id}`)
        window.dispatchEvent(new Event("crm-filtros-change"))
      } catch {}
    }
    router.push(s ? `${pathname}?${s}` : pathname, { scroll: false })
  }

  const leadsReativados = useMemo(() => {
    return leads.filter((l) => Boolean(l.reativadoEm && !l.arquivadoEm))
  }, [leads])

  useEffect(() => {
    if (leadsReativados.length > 0) {
      const primeiro = leadsReativados[0]
      toast(
        leadsReativados.length === 1
          ? `🔔 Lead "${primeiro.nome}" reativado no funil! Bloco destacado em cor âmbar.`
          : `🔔 ${leadsReativados.length} leads reativados no funil! Blocos destacados em cor âmbar.`
      )
    }
  }, [leadsReativados.length])

  const filtered = leads.filter(
    (l) =>
      (showArchived || !l.arquivadoEm) &&
      (!filterReativados || Boolean(l.reativadoEm && !l.arquivadoEm)) &&
      (tempFilter === "todas" || l.temperatura === tempFilter) &&
      (filtros.origem === "todas" || l.origem === filtros.origem) &&
      (filtros.status === "todos" || l.status === filtros.status) &&
      (isGestor || !CORRETOR_HIDDEN.has(l.status)) &&
      (filtros.corretor === "todos" || l.corretorId === filtros.corretor) &&
      leadDentroPeriodo(l, filtros.dataInicio, filtros.dataFim) &&
      matchesLeadQuery(l, query)
  )

  const byStatus = (s: LeadStatus) =>
    filtered.filter((l) => l.status === s).sort(sortLeadsByRecentDate)

  const temFiltros =
    tempFilter !== "todas" ||
    filtros.origem !== "todas" ||
    filtros.status !== "todos" ||
    filtros.corretor !== "todos" ||
    !!filtros.dataInicio ||
    !!filtros.dataFim ||
    !!query.trim()

  const noResults = temFiltros && filtered.length === 0

  const limparFiltros = () => {
    setQuery("")
    setTempFilter("todas")
    if (isGestor && user?.id && typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(`crm-filtros:${user.id}`)
      } catch {}
    }
    updateFiltros({ corretor: null, origem: null, status: null, data_inicio: null, data_fim: null })
  }

  return (
    <>
      <KanbanReativadosBanner
        leadsReativados={leadsReativados}
        filterReativados={filterReativados}
        onToggleFilter={() => setFilterReativados((p) => !p)}
      />

      <KanbanFilterBar
        query={query}
        setQuery={setQuery}
        tempFilter={tempFilter}
        setTempFilter={setTempFilter}
        filtros={filtros}
        updateFiltros={updateFiltros}
        limparFiltros={limparFiltros}
        temFiltros={temFiltros}
        showArchived={showArchived}
        setShowArchived={setShowArchived}
        isGestor={isGestor}
        corretores={corretores}
        leadsReativadosCount={leadsReativados.length}
        filterReativados={filterReativados}
        setFilterReativados={setFilterReativados}
      />

      {noResults ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/60 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <SearchX className="size-6" />
          </div>
          <p className="text-sm font-medium text-foreground">Nenhum lead encontrado para estes filtros</p>
          <button
            type="button"
            onClick={limparFiltros}
            className="text-xs font-medium text-primary hover:underline cursor-pointer"
          >
            Limpar filtros
          </button>
        </div>
      ) : (
        <KanbanColumns
          isGestor={isGestor}
          showCorretor={showCorretor}
          heightClass={heightClass}
          byStatus={byStatus}
          canManage={canManage}
          tagColorMap={tagColorMap}
          onDragEnd={onDragEnd}
          onOpen={(item) => router.push(`/painel-corretor/${item.id}${queryFiltros(searchParams)}`)}
          onEdit={(item) => setEditLead(item)}
          onDelete={(item) => setDelLead(item)}
          onAssumir={(item) => setAssumirDialog(item)}
          onEnviarMeta={(item) => setUploadMeta(item)}
          onArquivar={(item) => setArchiveLead(item)}
          onDesarquivar={(item) => setDesarquivarLead(item)}
        />
      )}

      <KanbanDialogs {...dialogProps} />
    </>
  )
}
