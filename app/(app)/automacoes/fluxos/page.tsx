import { Suspense } from "react"
import Link from "next/link"
import { ChevronRight, Workflow } from "lucide-react"
import { PageHeading } from "@/components/ui/page-heading"
import FlowList, { FlowListSkeleton } from "@/components/automation/flow-list"
import FlowEditor from "@/components/automation/flow-editor"
import { EditorSkeleton } from "@/components/automation/flow-editor"

// Server Component — Next 16: searchParams é uma Promise (async).
export default async function FluxosPage({
  searchParams,
}: {
  searchParams: Promise<{ fluxo?: string }>
}) {
  const { fluxo } = await searchParams

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeading
          badge="Automações"
          title="Fluxos de Automação"
          subtitle="Crie e edite jornadas de automação com o editor visual. Você arrasta blocos de gatilho, conteúdo, lógica e ações — sem precisar de código."
        />
        {fluxo && (
          <Link
            href="/automacoes/fluxos"
            className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
          >
            <ChevronRight size={13} className="rotate-180" /> Voltar à lista
          </Link>
        )}
      </div>

      {fluxo ? (
        <Suspense fallback={<EditorSkeleton />}>
          <FlowEditor key={fluxo} flowId={fluxo} />
        </Suspense>
      ) : (
        <Suspense fallback={<FlowListSkeleton />}>
          <FlowList />
        </Suspense>
      )}

      <p className="flex items-center gap-1.5 text-[11px] text-zinc-600">
        <Workflow size={12} />
        As alterações são salvas localmente neste dispositivo (demo). Em breve serão sincronizadas com o CRM.
      </p>
    </div>
  )
}