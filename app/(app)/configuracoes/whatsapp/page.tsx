"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { MessageCircle } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLeads } from "@/lib/leads-store"
import { WhatsappConnectionCard } from "@/components/whatsapp-connection-card"

export default function WhatsappConfigPage() {
  const { user } = useAuth()
  const { corretores } = useLeads()
  const router = useRouter()
  const isGestor = user?.role === "gestor"

  useEffect(() => {
    if (user && !isGestor) router.replace("/painel-corretor")
  }, [user, isGestor, router])

  if (!user || !isGestor) return null

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-foreground">
          <MessageCircle className="size-6 text-emerald-600" />
          Conexões WhatsApp
        </h1>
        <p className="text-sm text-muted-foreground">
          Conecte o WhatsApp de cada corretor para capturar leads automaticamente. As mensagens recebidas viram leads no funil.
        </p>
      </header>

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
