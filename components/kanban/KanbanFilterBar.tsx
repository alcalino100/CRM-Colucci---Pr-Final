"use client"

import { Search, Sparkles, X } from "lucide-react"
import { Input, Select } from "@/components/ui/primitives"
import { LEAD_STATUSES, STATUS_LABEL, TEMPERATURAS, TEMP_LABEL } from "@/lib/labels"
import { ORIGENS, type LeadStatus, type Origem, type Temperatura } from "@/lib/mock-data"
import { ORIGEM_SLUG, STATUS_SLUG, type FiltrosLeads } from "@/lib/leads-filtros"
import { cn } from "@/lib/utils"

export function KanbanFilterBar({
  query,
  setQuery,
  tempFilter,
  setTempFilter,
  filtros,
  updateFiltros,
  limparFiltros,
  temFiltros,
  showArchived,
  setShowArchived,
  isGestor,
  corretores,
  leadsReativadosCount,
  filterReativados,
  setFilterReativados,
}: {
  query: string
  setQuery: (q: string) => void
  tempFilter: Temperatura | "todas"
  setTempFilter: (t: Temperatura | "todas") => void
  filtros: FiltrosLeads
  updateFiltros: (patch: Record<string, string | null | undefined>) => void
  limparFiltros: () => void
  temFiltros: boolean
  showArchived: boolean
  setShowArchived: (v: boolean | ((p: boolean) => boolean)) => void
  isGestor: boolean
  corretores: { id: string; nome: string }[]
  leadsReativadosCount: number
  filterReativados: boolean
  setFilterReativados: (v: boolean | ((p: boolean) => boolean)) => void
}) {
  const chip = (active: boolean, color?: string) =>
    cn(
      "rounded-full border px-3 py-1 text-xs font-medium transition cursor-pointer",
      active
        ? (color ?? "border-primary bg-primary text-primary-foreground")
        : "border-border bg-card text-muted-foreground hover:text-foreground"
    )

  const badges: { label: string; limpar: () => void }[] = []
  if (filtros.corretor !== "todos") {
    const n = corretores.find((c) => c.id === filtros.corretor)?.nome ?? filtros.corretor
    badges.push({ label: `Corretor: ${n}`, limpar: () => updateFiltros({ corretor: null }) })
  }
  if (filtros.origem !== "todas") {
    badges.push({ label: `Origem: ${filtros.origem}`, limpar: () => updateFiltros({ origem: null }) })
  }
  if (filtros.status !== "todos") {
    badges.push({ label: `Status: ${STATUS_LABEL[filtros.status]}`, limpar: () => updateFiltros({ status: null }) })
  }
  if (filtros.dataInicio || filtros.dataFim) {
    const fmt = (d: string) => (d ? d.split("-").reverse().join("/") : "—")
    badges.push({
      label: `Período: ${fmt(filtros.dataInicio)} → ${fmt(filtros.dataFim)}`,
      limpar: () => updateFiltros({ data_inicio: null, data_fim: null }),
    })
  }

  return (
    <>
      <div className="relative mb-3 flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary/0 via-primary/70 to-primary/0"
        />
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar por nome, telefone ou ref"
            aria-label="Pesquisar leads"
            className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-9 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpar pesquisa"
              className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {leadsReativadosCount > 0 && (
            <button
              type="button"
              onClick={() => setFilterReativados((p) => !p)}
              className={chip(
                filterReativados,
                "border-amber-500 bg-amber-500 text-stone-950 font-bold shadow-sm dark:bg-amber-400 dark:text-stone-950"
              )}
            >
              <Sparkles className="size-3.5 inline mr-1" />
              Reativados ({leadsReativadosCount})
            </button>
          )}
          <span className="text-xs font-medium text-muted-foreground">Temperatura:</span>
          <button type="button" onClick={() => setTempFilter("todas")} className={chip(tempFilter === "todas")}>
            Todas
          </button>
          {TEMPERATURAS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTempFilter(t)}
              className={chip(
                tempFilter === t,
                t === "quente"
                  ? "border-red-600 bg-red-600 text-white"
                  : t === "morno"
                  ? "border-amber-500 bg-amber-500 text-white"
                  : "border-slate-500 bg-slate-500 text-white"
              )}
            >
              {TEMP_LABEL[t]}
            </button>
          ))}
          <span className="ml-2 h-5 w-px bg-border" aria-hidden />
          <Select
            value={filtros.origem}
            onChange={(e) => {
              const v = e.target.value as Origem | "todas"
              updateFiltros({ origem: v === "todas" ? null : ORIGEM_SLUG[v] })
            }}
            aria-label="Filtrar por origem"
            className="w-36 text-xs"
          >
            <option value="todas">Origem: todas</option>
            {ORIGENS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
          <Select
            value={filtros.status}
            onChange={(e) => {
              const v = e.target.value as LeadStatus | "todos"
              updateFiltros({ status: v === "todos" ? null : STATUS_SLUG[v] })
            }}
            aria-label="Filtrar por status"
            className="w-44 text-xs"
          >
            <option value="todos">Status: todos</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          {isGestor && (
            <Select
              value={filtros.corretor}
              onChange={(e) => updateFiltros({ corretor: e.target.value === "todos" ? null : e.target.value })}
              aria-label="Filtrar por corretor"
              className="w-40 text-xs"
            >
              <option value="todos">Corretor: todos</option>
              {corretores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          )}
          <Input
            type="date"
            value={filtros.dataInicio}
            onChange={(e) => updateFiltros({ data_inicio: e.target.value || null })}
            aria-label="Filtrar por data inicial"
            className="h-9 w-auto text-xs"
          />
          <Input
            type="date"
            value={filtros.dataFim}
            onChange={(e) => updateFiltros({ data_fim: e.target.value || null })}
            aria-label="Filtrar por data final"
            className="h-9 w-auto text-xs"
          />
          {temFiltros && (
            <button
              type="button"
              onClick={limparFiltros}
              className="rounded-full border border-dashed border-border px-3 py-1 text-xs font-medium text-primary transition hover:border-primary/40 hover:bg-primary/5 cursor-pointer"
            >
              Limpar filtros
            </button>
          )}
          <span className="ml-2 h-5 w-px bg-border" aria-hidden />
          <button
            type="button"
            onClick={() => setShowArchived((p) => !p)}
            className={chip(showArchived, "#a1a1aa")}
          >
            {showArchived ? "Ocultar arquivados" : "Mostrar arquivados"}
          </button>
        </div>
      </div>

      {badges.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Filtros ativos:</span>
          {badges.map((b, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 py-0.5 pl-2.5 pr-1 text-xs font-medium"
            >
              {b.label}
              <button
                type="button"
                onClick={b.limpar}
                aria-label={`Remover filtro ${b.label}`}
                className="flex size-5 items-center justify-center rounded-full text-muted-foreground transition hover:bg-primary/10 hover:text-foreground cursor-pointer"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </>
  )
}
