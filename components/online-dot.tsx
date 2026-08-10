"use client"

import { cn } from "@/lib/utils"

interface OnlineDotProps {
  online: boolean
  showLabel?: boolean
  className?: string
}

// Bolinha de status online/ausente ao lado do nome do corretor.
export function OnlineDot({ online, showLabel = false, className }: OnlineDotProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn(
          "relative inline-block size-2.5 shrink-0 rounded-full",
          online ? "bg-emerald-500" : "bg-zinc-400",
        )}
        title={online ? "Online" : "Ausente"}
      >
        {online && (
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/50" />
        )}
      </span>
      {showLabel && (
        <span className={cn("text-xs font-medium", online ? "text-emerald-600" : "text-muted-foreground")}>
          {online ? "Online" : "Ausente"}
        </span>
      )}
    </span>
  )
}
