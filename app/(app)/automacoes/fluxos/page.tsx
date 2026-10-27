import { Suspense } from "react"
import Link from "next/link"
import { ChevronRight, Workflow, Plus, Sparkles, Layers } from "lucide-react"
import FlowList, { FlowListSkeleton } from "@/components/automation/flow-list"
import FlowEditor from "@/components/automation/flow-editor"
import { RequireGestor } from "@/components/RequireGestor"
import { EditorSkeleton } from "@/components/automation/flow-editor"
import { AutomationSubNav } from "@/components/automation/AutomationSubNav"

// Server Component — Next 16: searchParams é uma Promise (async).
export default async function FluxosPage({
  searchParams,
}: {
  searchParams: Promise<{ fluxo?: string }>
}) {
  const { fluxo } = await searchParams

  return (
    <RequireGestor>
      <div className="space-y-6">
        {/* 1. Subnavegação Unificada */}
        <AutomationSubNav />

        {/* 2. Header & Ações */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Workflow className="size-4" />
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                Fluxos Visuais de Automação
              </h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Editor visual de jornadas: configure blocos de gatilho, mensagens de WhatsApp, condições lógicas e ações operacionais.
            </p>
          </div>

          {fluxo && (
            <Link
              href="/automacoes/fluxos"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-muted"
            >
              <ChevronRight size={14} className="rotate-180" /> Voltar à lista de fluxos
            </Link>
          )}
        </div>

        {/* 3. Conteúdo Principal */}
        {fluxo ? (
          <Suspense fallback={<EditorSkeleton />}>
            <FlowEditor key={fluxo} flowId={fluxo} />
          </Suspense>
        ) : (
          <Suspense fallback={<FlowListSkeleton />}>
            <FlowList />
          </Suspense>
        )}

        {/* 4. Rodapé Informativo */}
        <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-muted/20 p-3 text-xs text-muted-foreground">
          <Sparkles className="size-3.5 text-primary shrink-0" />
          <span>
            Os fluxos visuais representam os mapas de jornada da imobiliária (Captação, Reativação Fria e Régua D+1/D+2/D+3), sincronizados com o motor de envio em tempo real.
          </span>
        </div>
      </div>
    </RequireGestor>
  )
}
