import { ApiOficialTela } from "@/components/whatsapp-oficial/ApiOficialTela"
import { RequireGestor } from "@/components/RequireGestor"
import { PageHeading } from "@/components/ui/page-heading"

export const metadata = { title: "API Oficial WhatsApp - CRM" }

export default function WhatsappOficialPage() {
  return (
    <RequireGestor>
      <div className="flex flex-col gap-5">
        <PageHeading title="API Oficial do WhatsApp" subtitle="Configure números, modelos, webhook e testes da API oficial da Meta (disparos em volume)." badge="Meta" />
        <ApiOficialTela />
      </div>
    </RequireGestor>
  )
}
