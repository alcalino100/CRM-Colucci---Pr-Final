"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle, RotateCcw, Kanban, Home } from "lucide-react"
import { logger } from "@/lib/logger"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    logger.error("Global ErrorBoundary capturou exceção", {
      message: error?.message || "Erro desconhecido",
      digest: error?.digest,
      stack: error?.stack,
    })
  }, [error])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12 text-foreground">
      <div className="relative mx-auto flex w-full max-w-lg flex-col items-center rounded-2xl border border-destructive/30 bg-card p-8 text-center shadow-xl">
        {/* Glow de aviso */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-12 size-48 rounded-full bg-destructive/10 blur-3xl"
        />

        {/* Ícone */}
        <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive ring-8 ring-destructive/5">
          <AlertTriangle className="size-8" />
        </div>

        <span className="mb-1 font-mono text-xs font-semibold tracking-wider text-destructive uppercase">
          Instabilidade Detectada
        </span>
        <h1 className="mb-2 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Algo deu errado
        </h1>

        <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
          Ocorreu uma falha inesperada ao processar esta tela. O erro foi registrado no sistema de diagnósticos.
        </p>

        {error?.digest && (
          <div className="mb-6 rounded-lg border border-border bg-muted/60 px-3 py-1.5 font-mono text-xs text-muted-foreground">
            Código do incidente: <span className="text-foreground font-semibold">{error.digest}</span>
          </div>
        )}

        {/* Ações de recuperação */}
        <div className="flex w-full flex-col gap-2.5 sm:flex-row">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <RotateCcw className="size-4" />
            Tentar novamente
          </button>
          <Link
            href="/kanban"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm font-semibold text-secondary-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Kanban className="size-4" />
            Ir para o Kanban
          </Link>
        </div>

        <div className="mt-6 border-t border-border pt-4 w-full">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.href = "/"
              }
            }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            <Home className="size-3" />
            Recarregar aplicação a partir da página inicial
          </button>
        </div>
      </div>
    </main>
  )
}
