"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, Clock, Layers, BarChart3, Zap, Workflow, FileText } from "lucide-react"
import { cn } from "@/lib/utils"

interface AutomationSubNavProps {
  pendingJobsCount?: number
  className?: string
}

export function AutomationSubNav({ pendingJobsCount, className }: AutomationSubNavProps) {
  const pathname = usePathname()

  const tabs = [
    { href: "/automacoes", label: "Visão Geral", icon: Activity, exact: true },
    { href: "/automacoes/fluxos", label: "Fluxos Visuais", icon: Workflow },
    { href: "/automacoes/regras", label: "Regras & Cadência", icon: Zap },
    { href: "/automacoes/fila", label: "Fila de Envios", icon: Layers, badge: pendingJobsCount },
    { href: "/automacoes/logs", label: "Logs de Auditoria", icon: FileText },
    { href: "/automacoes/relatorio", label: "Relatório Diário", icon: BarChart3 },
  ]

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 border-b border-border/60 pb-3", className)}>
      {tabs.map((tab) => {
        const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
        const Icon = tab.icon

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              isActive
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="size-3.5" />
            <span>{tab.label}</span>
            {typeof tab.badge === "number" && tab.badge > 0 && (
              <span
                className={cn(
                  "ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold tabular-nums",
                  isActive
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300"
                )}
              >
                {tab.badge}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
