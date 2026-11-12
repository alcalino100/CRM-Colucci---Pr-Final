import Link from "next/link"
import { Compass, Kanban, Users, ArrowLeft } from "lucide-react"

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12 text-foreground">
      <div className="relative mx-auto flex w-full max-w-md flex-col items-center rounded-2xl border border-border bg-card p-8 text-center shadow-lg">
        {/* Glow de fundo */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-10 size-40 rounded-full bg-primary/10 blur-3xl"
        />

        {/* Ícone */}
        <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-8 ring-primary/5">
          <Compass className="size-8" />
        </div>

        {/* Status code e título */}
        <span className="mb-1 font-mono text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Erro 404
        </span>
        <h1 className="mb-2 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Página não encontrada
        </h1>

        <p className="mb-6 text-sm text-muted-foreground leading-relaxed">
          O endereço solicitado não existe, foi movido ou você não tem permissão para acessá-lo.
        </p>

        {/* Ações */}
        <div className="flex w-full flex-col gap-2.5 sm:flex-row">
          <Link
            href="/kanban"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Kanban className="size-4" />
            Ir para o Kanban
          </Link>
          <Link
            href="/cadastros"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm font-semibold text-secondary-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Users className="size-4" />
            Cadastros
          </Link>
        </div>

        <div className="mt-6 border-t border-border pt-4 w-full">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            Voltar ao início do sistema
          </Link>
        </div>
      </div>
    </main>
  )
}
