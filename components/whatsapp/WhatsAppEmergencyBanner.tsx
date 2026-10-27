"use client"

import React, { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ChevronDown, ChevronUp, MessageCircle, QrCode, ShieldAlert, X } from "lucide-react"
import { useWhatsAppStatus } from "@/lib/whatsapp-status-context"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"

export function WhatsAppEmergencyBanner() {
  const { user } = useAuth()
  const {
    myInstanceDisconnected,
    disconnectedInstances,
    patriciaDisconnected,
    patriciaInstances,
    isGestor,
    openReconnectModal,
    openMonitorModal,
  } = useWhatsAppStatus()

  const [minimized, setMinimized] = useState(false)
  const prevDisconnectedCount = useRef(disconnectedInstances.length)

  // Se o número de desconectados aumentar, desminimiza automaticamente
  useEffect(() => {
    if (disconnectedInstances.length > prevDisconnectedCount.current) {
      setMinimized(false)
    }
    prevDisconnectedCount.current = disconnectedInstances.length
  }, [disconnectedInstances.length])

  // Se o usuário for corretor e seu WhatsApp estiver desconectado
  if (!isGestor && myInstanceDisconnected) {
    return (
      <div className="relative z-20 border-b border-destructive/30 bg-gradient-to-r from-red-600/15 via-amber-500/15 to-red-600/15 px-4 py-3 text-foreground backdrop-blur-sm shadow-sm transition-all animate-in fade-in slide-in-from-top-2">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="relative flex size-3 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex size-3 rounded-full bg-destructive" />
            </span>
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
              <span className="flex items-center gap-1.5 font-bold text-destructive">
                <AlertTriangle className="size-4 shrink-0" />
                WhatsApp Desconectado
              </span>
              <span className="text-xs text-muted-foreground sm:text-sm">
                Seu WhatsApp pessoal caiu. Você não receberá novos leads nem mensagens dos clientes até reconectar.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={() =>
                openReconnectModal({
                  corretorId: user?.id,
                  corretorNome: user?.nome,
                  titulo: "Meu WhatsApp",
                })
              }
              className="gap-1.5 shadow-sm"
            >
              <QrCode className="size-4" />
              Reconectar Agora
            </Button>
            <Link
              href="/perfil"
              className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
            >
              Ir ao Perfil
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Se for gestor: monitora Patricia e todos os corretores
  if (isGestor) {
    const offlineCount = disconnectedInstances.length
    if (offlineCount === 0) return null

    // Nomes dos corretores desconectados (até 4 nomes com fallback +X)
    const nomesOffline = disconnectedInstances
      .map((i) => (i.isPatricia ? "IA Patricia" : (i.corretorNome || i.instance_name)))
      .slice(0, 4)
    const rest = offlineCount - nomesOffline.length
    const resumoNomes = rest > 0 ? `${nomesOffline.join(", ")} e mais ${rest}` : nomesOffline.join(", ")

    // Encontra qual linha da Patricia está offline caso exista
    const patriciaOffline = patriciaInstances.find((i) => i.status !== "conectado")

    // Barra minimizada
    if (minimized) {
      return (
        <div className="relative z-20 flex items-center justify-between border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-800 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
            </span>
            <span className="font-semibold">
              {offlineCount} WhatsApp{offlineCount > 1 ? "s" : ""} offline:
            </span>
            <span className="truncate max-w-md text-muted-foreground">{resumoNomes}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openMonitorModal()}
              className="font-medium text-amber-900 underline hover:no-underline dark:text-amber-300"
            >
              Ver detalhes
            </button>
            <button
              onClick={() => setMinimized(false)}
              className="flex items-center gap-1 rounded p-1 hover:bg-amber-500/20"
              title="Expandir alerta"
            >
              <ChevronDown className="size-3.5" />
            </button>
          </div>
        </div>
      )
    }

    // 1. Alerta crítico se a IA da Patricia estiver desconectada
    if (patriciaDisconnected && patriciaOffline) {
      return (
        <div className="relative z-20 border-b border-red-500/40 bg-gradient-to-r from-red-600/20 via-red-500/15 to-red-600/20 px-4 py-3 text-foreground shadow-sm transition-all animate-in fade-in slide-in-from-top-2">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="relative flex size-3.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-600 opacity-90" />
                <span className="relative inline-flex size-3.5 rounded-full bg-red-600" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-xs">
                    Crítico
                  </span>
                  <p className="text-sm font-bold text-red-600 dark:text-red-400">
                    WhatsApp da IA Patricia Desconectado!
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  A automação está paralisada. Novos leads de campanhas não estão recebendo resposta imediata.
                  {offlineCount > 1 && ` (+${offlineCount - 1} corretor${offlineCount - 1 > 1 ? "es" : ""} offline)`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={() =>
                  openReconnectModal({
                    instanceName: patriciaOffline.instance_name,
                    titulo: patriciaOffline.instance_name.includes("patricia2")
                      ? "Patricia · Linha 2"
                      : "Patricia · Linha 1",
                  })
                }
                className="gap-1.5 shadow-sm"
              >
                <QrCode className="size-4" />
                Reconectar Patricia
              </Button>
              <Button size="sm" variant="outline" onClick={openMonitorModal}>
                Ver Todos ({offlineCount})
              </Button>
              <button
                onClick={() => setMinimized(true)}
                className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted"
                title="Minimizar aviso"
              >
                <ChevronUp className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )
    }

    // 2. Alerta padrão de gestor para corretores offline
    return (
      <div className="relative z-20 border-b border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-red-500/10 to-amber-500/15 px-4 py-3 text-foreground backdrop-blur-sm shadow-sm transition-all animate-in fade-in slide-in-from-top-2">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="relative flex size-3 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-80" />
              <span className="relative inline-flex size-3 rounded-full bg-amber-500" />
            </span>
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
              <span className="flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-400">
                <AlertTriangle className="size-4 shrink-0" />
                {offlineCount} {offlineCount === 1 ? "WhatsApp Offline" : "WhatsApps Offline"}
              </span>
              <span className="text-xs text-muted-foreground sm:text-sm">
                Conexões caídas: <strong className="text-foreground">{resumoNomes}</strong>. Leads atribuídos podem não ser entregues.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="default" onClick={openMonitorModal} className="gap-1.5">
              <MessageCircle className="size-4" />
              Ver Instâncias ({offlineCount})
            </Button>
            <Link href="/configuracoes/whatsapp">
              <Button size="sm" variant="outline">
                Conexões
              </Button>
            </Link>
            <button
              onClick={() => setMinimized(true)}
              className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted"
              title="Minimizar aviso"
            >
              <ChevronUp className="size-4" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
