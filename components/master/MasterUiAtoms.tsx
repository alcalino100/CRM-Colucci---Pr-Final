import { cn } from "@/lib/utils"

export const btn = (primary = false) =>
  cn(
    "rounded-lg px-3 py-2 text-xs font-semibold transition disabled:opacity-50",
    primary
      ? "bg-primary text-primary-foreground hover:opacity-90"
      : "border border-border bg-card hover:bg-muted"
  )
