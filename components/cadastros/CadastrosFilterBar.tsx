"use client"

import { Select } from "@/components/ui/primitives"
import { LEAD_STATUSES, STATUS_LABEL } from "@/lib/labels"
import { ORIGENS, type LeadStatus, type Origem } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import { PRESETS, type CadastrosFilters, type CriterioData } from "./cadastros-utils"

interface CadastrosFilterBarProps {
  filters: CadastrosFilters
  onChangeFilters: (updates: Partial<CadastrosFilters>) => void
  corretores: { id: string; nome: string }[]
}

export function CadastrosFilterBar({
  filters,
  onChangeFilters,
  corretores,
}: CadastrosFilterBarProps) {
  const { dataInicio, dataFim, corretor, origem, status, criterioData, showArchived } = filters

  return (
    <div className="flex flex-col gap-3">
      {/* Presets de período */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">Período:</span>
        {PRESETS.map((p) => {
          const r = p.get()
          const active = dataInicio === r.ini && dataFim === r.fim
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onChangeFilters({ dataInicio: r.ini, dataFim: r.fim })}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                active
                  ? "border-primary bg-primary text-primary-foreground font-semibold shadow-sm"
                  : "border-border bg-background hover:border-primary hover:text-primary"
              )}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      {/* Controles de data e filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground font-medium text-xs">De</span>
          <input
            type="date"
            value={dataInicio}
            onChange={(e) => onChangeFilters({ dataInicio: e.target.value })}
            className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground font-medium text-xs">Até</span>
          <input
            type="date"
            value={dataFim}
            onChange={(e) => onChangeFilters({ dataFim: e.target.value })}
            className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
          />
        </label>

        {/* Critério de Data */}
        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/20 px-2 py-1">
          <span className="text-xs text-muted-foreground font-medium">Critério:</span>
          <button
            type="button"
            onClick={() => onChangeFilters({ criterioData: "criacao" })}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-semibold transition",
              criterioData === "criacao"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Considera apenas a data em que o lead foi criado no CRM"
          >
            Data de Cadastro
          </button>
          <button
            type="button"
            onClick={() => onChangeFilters({ criterioData: "atividade" })}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-semibold transition",
              criterioData === "atividade"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Inclui também leads antigos que tiveram movimentação recente no período"
          >
            Cadastro + Atividade
          </button>
        </div>

        <Select
          value={corretor}
          onChange={(e) => onChangeFilters({ corretor: e.target.value })}
          aria-label="Filtrar por corretor"
          className="w-44 text-xs h-8"
        >
          <option value="todos">Corretor: todos</option>
          {corretores.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </Select>

        <Select
          value={origem}
          onChange={(e) => onChangeFilters({ origem: e.target.value as Origem | "todas" })}
          aria-label="Filtrar por origem"
          className="w-40 text-xs h-8"
        >
          <option value="todas">Origem: todas</option>
          {ORIGENS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>

        <Select
          value={status}
          onChange={(e) => onChangeFilters({ status: e.target.value as LeadStatus | "todos" })}
          aria-label="Filtrar por status"
          className="w-48 text-xs h-8"
        >
          <option value="todos">Status: todos</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>

        <button
          type="button"
          onClick={() => onChangeFilters({ showArchived: !showArchived })}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
            showArchived
              ? "border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold"
              : "border-border bg-background text-muted-foreground hover:text-foreground"
          )}
        >
          {showArchived ? "Ocultar arquivados" : "Mostrar arquivados"}
        </button>
      </div>
    </div>
  )
}
