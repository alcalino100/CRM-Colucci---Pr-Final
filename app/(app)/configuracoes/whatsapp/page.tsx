"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { isGestorNivel } from "@/lib/roles"
import { useLeads } from "@/lib/leads-store"
import { WhatsappConnectionCard } from "@/components/whatsapp-connection-card"
import { PageHeading } from "@/components/ui/page-heading"

export default function WhatsappConfigPage() {
  const { user } = useAuth()
  const { corretores } = useLeads()
  const router = useRouter()
  const isGestor = isGestorNivel(user?.role ?? "corretor")

  useEffect(() => {
    if (user && !isGestor) router.replace("/painel-corretor")
  }, [user, isGestor, router])

  if (!user || !isGestor) return null

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title="Conexões WhatsApp"
        badge="WhatsApp"
        subtitle="Conecte o WhatsApp de cada corretor para capturar leads automaticamente. As mensagens recebidas viram leads no funil."
      />

      {corretores.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card/60 py-12 text-center text-sm text-muted-foreground">
          Nenhum corretor cadastrado.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {corretores.map((c) => (
            <WhatsappConnectionCard key={c.id} corretorId={c.id} corretorNome={c.nome} />
          ))}
        </div>
      )}
    </div>
  )
}
