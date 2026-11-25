import { RelatoriosMetaTela } from "@/components/relatorios-meta/RelatoriosMetaTela"
import { RequireGestor } from "@/components/RequireGestor"
import { PageHeading } from "@/components/ui/page-heading"

export const metadata = { title: "Relatórios Meta - CRM" }

export default function RelatoriosMetaPage() {
  return (
    <RequireGestor>
      <div className="flex flex-col gap-5">
        <PageHeading title="Instagram e Relatórios Meta" subtitle="Análise de posts, campanhas com IA e relatórios mensais com histórico." badge="Meta" />
        <RelatoriosMetaTela />
      </div>
    </RequireGestor>
  )
}
