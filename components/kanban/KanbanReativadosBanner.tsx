"use client"

import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Lead } from "@/lib/mock-data"

export function KanbanReativadosBanner({
  leadsReativados,
  filterReativados,
  onToggleFilter,
}: {
  leadsReativados: Lead[]
  filterReativados: boolean
  onToggleFilter: () => void
}) {
  if (leadsReativados.length === 0) return null

  return (
    <div className="relative mb-3 flex flex-col gap-3 rounded-xl border-2 border-amber-500 bg-card p-4 text-foreground shadow-md transition-colors dark:border-amber-400 dark:bg-card">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1 rounded-t-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500"
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-stone-950 shadow-sm ring-2 ring-amber-400/40">
            <Sparkles className="size-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display font-bold text-base text-foreground dark:text-white">
                {leadsReativados.length === 1
                  ? `🔔 1 Lead Reativado no seu funil: ${leadsReativados[0].nome}`
                  : `🔔 ${leadsReativados.length} Leads Reativados aguardando retomada de contato!`}
              </span>
              <span className="inline-flex items-center rounded-full border border-amber-500/60 bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:text-amber-200">
                Retomar Contato
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground dark:text-stone-200 leading-relaxed">
              {leadsReativados.length === 1 ? (
                <>
                  O lead{" "}
                  <strong className="font-semibold text-foreground dark:text-white underline">
                    {leadsReativados[0].nome}
                  </strong>{" "}
                  retornou ao funil como &quot;Novo Lead&quot; com o bloco destacado em cor âmbar.
                </>
              ) : (
                'Estes leads atingiram a data programada de compra e retornaram como "Novo Lead" com bloco destacado em cor âmbar.'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            className={cn(
              "font-bold shadow-sm transition-all",
              filterReativados
                ? "border border-border bg-muted text-foreground hover:bg-muted/80"
                : "bg-amber-500 text-stone-950 font-extrabold hover:bg-amber-400 dark:bg-amber-400 dark:text-stone-950 dark:hover:bg-amber-300"
            )}
            onClick={onToggleFilter}
          >
            <Sparkles className="size-3.5 mr-1.5" />
            {filterReativados ? "Ver todos os leads" : "Destacar apenas reativados"}
          </Button>
        </div>
      </div>
    </div>
  )
}
