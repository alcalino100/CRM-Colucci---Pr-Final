"use client"

import { Search, X } from "lucide-react"
import { Select } from "@/components/ui/primitives"
import {
  LOCACAO_STATUSES,
  LOCACAO_STATUS_LABEL,
  TEMPERATURAS,
  TEMP_LABEL,
  TIPOS_IMOVEL_LOCACAO,
  QUARTOS_OPCOES,
} from "@/lib/locacao-labels"
import { ORIGENS, type Origem, type Temperatura } from "@/lib/mock-data"
import type { LocacaoStatus } from "@/lib/locacao-labels"
import { cn } from "@/lib/utils"
import type { LocacaoFilters } from "./kanban-locacao-utils"

interface KanbanLocacaoFilterBarProps {
  filters: LocacaoFilters
  onChangeFilters: (updates: Partial<LocacaoFilters>) => void
  onClearFilters: () => void
  hasActiveFilters: boolean
  isGestor: boolean
  corretores: { id: string; nome: string }[]
}

export function KanbanLocacaoFilterBar({
  filters,
  onChangeFilters,
  onClearFilters,
  hasActiveFilters,
  isGestor,
  corretores,
}: KanbanLocacaoFilterBarProps) {
  const {
    query,
    tempFilter,
    origemFilter,
    statusFilter,
    corretorFilter,
    tipoFilter,
    quartosFilter,
    aluguelMaxFilter,
    bairrosFilter,
    showArchived,
  } = filters

  const chip = (active: boolean, color?: string) =>
    cn(
      "rounded-full border px-3 py-1 text-xs font-medium transition",
      active
        ? (color ?? "border-primary bg-primary text-primary-foreground")
        : "border-border bg-card text-muted-foreground hover:text-foreground"
    )

  return (
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
          onChange={(e) => onChangeFilters({ query: e.target.value })}
          placeholder="Pesquisar por nome, telefone ou ref"
          aria-label="Pesquisar leads"
          className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-9 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        />
        {query && (
          <button
            type="button"
            onClick={() => onChangeFilters({ query: "" })}
            aria-label="Limpar pesquisa"
            className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Temperatura:</span>
        <button
          type="button"
          onClick={() => onChangeFilters({ tempFilter: "todas" })}
          className={chip(tempFilter === "todas")}
        >
          Todas
        </button>
        {TEMPERATURAS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onChangeFilters({ tempFilter: t })}
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
          value={origemFilter}
          onChange={(e) => onChangeFilters({ origemFilter: e.target.value as Origem | "todas" })}
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
          value={statusFilter}
          onChange={(e) => onChangeFilters({ statusFilter: e.target.value as LocacaoStatus | "todos" })}
          aria-label="Filtrar por status"
          className="w-44 text-xs"
        >
          <option value="todos">Status: todos</option>
          {LOCACAO_STATUSES.map((s) => (
            <option key={s} value={s}>
              {LOCACAO_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        {isGestor && (
          <Select
            value={corretorFilter}
            onChange={(e) => onChangeFilters({ corretorFilter: e.target.value })}
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
        <span className="ml-2 h-5 w-px bg-border" aria-hidden />
        <Select
          value={tipoFilter}
          onChange={(e) => onChangeFilters({ tipoFilter: e.target.value })}
          aria-label="Filtrar por tipo"
          className="w-40 text-xs"
        >
          <option value="todos">Tipo: todos</option>
          {TIPOS_IMOVEL_LOCACAO.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Select
          value={quartosFilter}
          onChange={(e) => onChangeFilters({ quartosFilter: e.target.value })}
          aria-label="Filtrar por quartos"
          className="w-36 text-xs"
        >
          <option value="todos">Quartos: todos</option>
          {QUARTOS_OPCOES.map((q) => (
            <option key={q} value={q}>
              {q} quarto(s)
            </option>
          ))}
        </Select>
        <input
          type="number"
          value={aluguelMaxFilter}
          onChange={(e) => onChangeFilters({ aluguelMaxFilter: e.target.value })}
          placeholder="Aluguel máx."
          aria-label="Filtrar por aluguel máximo"
          className="h-7 w-28 rounded-lg border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        />
        <input
          type="text"
          value={bairrosFilter}
          onChange={(e) => onChangeFilters({ bairrosFilter: e.target.value })}
          placeholder="Bairros"
          aria-label="Filtrar por bairros"
          className="h-7 w-28 rounded-lg border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        />
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="rounded-full border border-dashed border-border px-3 py-1 text-xs font-medium text-primary transition hover:border-primary/40 hover:bg-primary/5"
          >
            Limpar filtros
          </button>
        )}
        <span className="ml-2 h-5 w-px bg-border" aria-hidden />
        <button
          type="button"
          onClick={() => onChangeFilters({ showArchived: !showArchived })}
          className={chip(showArchived, "#a1a1aa")}
        >
          {showArchived ? "Ocultar arquivados" : "Mostrar arquivados"}
        </button>
      </div>
    </div>
  )
}
