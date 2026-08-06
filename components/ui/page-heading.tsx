import { Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

// Cabeçalho de página "brilhoso": pill com sparkle + título com gradiente + subtítulo.
export function PageHeading({
  title,
  subtitle,
  badge,
  className,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  badge?: string
  className?: string
}) {
  return (
    <div className={cn("min-w-0", className)}>
      {badge && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-primary/15 to-accent/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary ring-1 ring-primary/25 shadow-[0_0_14px_rgb(178_34_34/0.25)]">
          <Sparkles className="size-3.5" />
          {badge}
        </span>
      )}
      <h1 className={cn("font-display text-2xl font-bold tracking-tight sm:text-3xl", badge && "mt-2.5")}>
        <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">{title}</span>
      </h1>
      {subtitle && <p className="mt-1 max-w-xl text-sm text-muted-foreground text-pretty">{subtitle}</p>}
    </div>
  )
}
