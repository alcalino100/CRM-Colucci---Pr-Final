"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Bot, RefreshCw, Search, Users } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { isGestorNivel } from "@/lib/roles"
import { useLeads } from "@/lib/leads-store"
import { useWhatsAppStatus } from "@/lib/whatsapp-status-context"
import { WhatsappConnectionCard } from "@/components/whatsapp-connection-card"
import { PageHeading } from "@/components/ui/page-heading"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, Input } from "@/components/ui/primitives"
import { cn } from "@/lib/utils"

export default function WhatsappConfigPage() {
  const { user } = useAuth()
  const { corretores } = useLeads()
  const { instances, refreshAll, refreshing } = useWhatsAppStatus()
  const router = useRouter()
  const isGestor = isGestorNivel(user?.role ?? "corretor")

  const [busca, setBusca] = useState("")
  const [filtro, setFiltro] = useState<"todos" | "desconectados" | "conectados">("todos")

  useEffect(() => {
    if (user && !isGestor) router.replace("/painel-corretor")
  }, [user, isGestor, router])

  const corretoresFiltrados = useMemo(() => {
    return corretores.filter((c) => {
      // Busca por nome
      if (busca.trim()) {
        const q = busca.toLowerCase().trim()
        if (!c.nome.toLowerCase().includes(q)) return false
      }
      // Filtro de status se houver dado de instância
      if (filtro !== "todos") {
        const inst = instances.find((i) => i.corretor_id === c.id)
        const isConectado = inst?.status === "conectado"
        if (filtro === "conectados" && !isConectado) return false
        if (filtro === "desconectados" && isConectado) return false
      }
      return true
    })
  }, [corretores, busca, filtro, instances])

  if (!user || !isGestor) return null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeading
          title="Conexões WhatsApp"
          badge="WhatsApp"
          subtitle="Conecte o WhatsApp de cada corretor e as linhas da IA para capturar leads e gerenciar atendimento em tempo real."
        />
        <Button
          variant="outline"
          onClick={refreshAll}
          disabled={refreshing}
          className="gap-2"
        >
          <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
          {refreshing ? "Sincronizando..." : "Verificar Todas as Conexões"}
        </Button>
      </div>

      {/* Seção 1: Linhas Principais da IA Patricia */}
      <Card className="border-sky-500/20 bg-sky-500/5">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base text-sky-900 dark:text-sky-200">
            <Bot className="size-5 text-sky-600" />
            Linhas Principais da IA · Atendimento de Anúncios e Site
          </CardTitle>
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
            Automático Meta Ads
          </span>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <WhatsappConnectionCard
            titulo="Patricia · Linha 1 (Principal)"
            instanceNameFixo="patricia-6c2875b4"
            compact
          />
          <WhatsappConnectionCard
            titulo="Patricia · Linha 2 (Secundária)"
            instanceNameFixo="patricia2"
            compact
          />
        </CardContent>
      </Card>

      {/* Seção 2: Conexões dos Corretores */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Users className="size-5 text-primary" />
            <h2 className="font-display text-lg font-bold">WhatsApp dos Corretores</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              {corretores.length} cadastrados
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
              <button
                onClick={() => setFiltro("todos")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold transition",
                  filtro === "todos" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Todos
              </button>
              <button
                onClick={() => setFiltro("desconectados")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold transition",
                  filtro === "desconectados"
                    ? "bg-destructive text-destructive-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Offline
              </button>
              <button
                onClick={() => setFiltro("conectados")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold transition",
                  filtro === "conectados"
                    ? "bg-emerald-600 text-white"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Online
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar corretor..."
                className="h-8 pl-8 text-xs w-48"
              />
            </div>
          </div>
        </div>

        {corretores.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card/60 py-12 text-center text-sm text-muted-foreground">
            Nenhum corretor cadastrado.
          </p>
        ) : corretoresFiltrados.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card/60 py-12 text-center text-sm text-muted-foreground">
            Nenhum corretor encontrado com o filtro atual.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {corretoresFiltrados.map((c) => (
              <WhatsappConnectionCard key={c.id} corretorId={c.id} corretorNome={c.nome} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
