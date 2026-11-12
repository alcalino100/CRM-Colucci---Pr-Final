"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export type ResponsiveColumn<T> = {
  key: string
  header: React.ReactNode
  render: (item: T, index: number) => React.ReactNode
  mobileLabel?: string
  hideOnMobile?: boolean
  priority?: boolean // Se verdadeiro, renderiza no topo do card mobile
  className?: string
  align?: "left" | "center" | "right"
}

export interface ResponsiveTableProps<T> {
  data: T[]
  columns: ResponsiveColumn<T>[]
  keyExtractor: (item: T, index: number) => string | number
  emptyMessage?: React.ReactNode
  rowClassName?: (item: T, index: number) => string
  className?: string
}

export function ResponsiveTable<T>({
  data,
  columns,
  keyExtractor,
  emptyMessage = "Nenhum registro encontrado.",
  rowClassName,
  className,
}: ResponsiveTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  const priorityColumns = columns.filter((c) => c.priority && !c.hideOnMobile)
  const detailColumns = columns.filter((c) => !c.priority && !c.hideOnMobile)

  return (
    <div className={cn("w-full", className)}>
      {/* Visualização Desktop: <table> padrão com cabeçalho fixo */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-4 py-3 font-medium",
                    col.align === "center" && "text-center",
                    col.align === "right" && "text-right",
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((item, index) => {
              const rowCls = rowClassName ? rowClassName(item, index) : ""
              return (
                <tr key={keyExtractor(item, index)} className={cn("transition hover:bg-muted/30", rowCls)}>
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-4 py-3 align-middle",
                        col.align === "center" && "text-center",
                        col.align === "right" && "text-right",
                        col.className
                      )}
                    >
                      {col.render(item, index)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Visualização Mobile: Cards estruturados chave-valor */}
      <div className="flex flex-col gap-3 md:hidden p-1">
        {data.map((item, index) => {
          const rowCls = rowClassName ? rowClassName(item, index) : ""
          return (
            <div
              key={keyExtractor(item, index)}
              className={cn(
                "flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3.5 shadow-xs transition",
                rowCls
              )}
            >
              {/* Topo prioritário do card */}
              {priorityColumns.length > 0 && (
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/50">
                  {priorityColumns.map((col) => (
                    <div key={col.key} className={cn("flex-1", col.className)}>
                      {col.render(item, index)}
                    </div>
                  ))}
                </div>
              )}

              {/* Linhas chave-valor de detalhes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {detailColumns.map((col) => {
                  const label =
                    col.mobileLabel || (typeof col.header === "string" ? col.header : col.key)
                  return (
                    <div key={col.key} className="flex flex-col gap-0.5">
                      <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                        {label}
                      </span>
                      <div className="text-foreground">{col.render(item, index)}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
