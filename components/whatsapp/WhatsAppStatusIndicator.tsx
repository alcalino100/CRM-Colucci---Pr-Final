"use client"

import React, { useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  MessageCircle,
  QrCode,
  RefreshCw,
  Search,
  Volume2,
  VolumeX,
  XCircle,
} from "lucide-react"
import { useWhatsAppStatus, type WhatsAppInstance } from "@/lib/whatsapp-status-context"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Badge, Card, Dialog, Input, useToast } from "@/components/ui/primitives"
import { cn } from "@/lib/utils"

export function WhatsAppStatusIndicator() {
  const { user } = useAuth()
  const toast = useToast()
  const {
    instances,
    loading,
    refreshing,
    myInstance,
    myInstanceDisconnected,
    disconnectedInstances,
    connectedInstances,
    patriciaDisconnected,
    isGestor,
    soundEnabled,
    toggleSound,
    testSound,
    monitorModalOpen,
    openMonitorModal,
    closeMonitorModal,
    openReconnectModal,
    refreshAll,
    refreshSingle,
  } = useWhatsAppStatus()

  const [busca, setBusca] = useState("")
  const [filtro, setFiltro] = useState<"todos" | "desconectados" | "conectados">("todos")
  const [checkingInstance, setCheckingInstance] = useState<string | null>(null)

  const offlineCount = disconnectedInstances.length
  const totalCount = instances.length

  // Copia mensagem padronizada para enviar ao corretor cujo WhatsApp caiu
  const copiarAviso = (inst: WhatsAppInstance) => {
    const nome = inst.corretorNome || "Corretor"
    const texto = `🚨 Olá, ${nome}! Seu WhatsApp conectado ao CRM Colucci acabou de desconectar (${inst.instance_name}).\n\nPor favor, acesse o CRM em Meu Perfil → Meu WhatsApp para ler o QR Code e restabelecer sua conexão para não perder novos leads!`
    navigator.clipboard
      .writeText(texto)
      .then(() => toast(`Mensagem de aviso para ${nome} copiada!`))
      .catch(() => toast("Não foi possível copiar.", "error"))
  }

  const handleRefreshSingle = async (instanceName: string) => {
    setCheckingInstance(instanceName)
    try {
      await refreshSingle(instanceName)
    } finally {
      setCheckingInstance(null)
    }
  }

  // Instâncias filtradas pela busca e pelo filtro selecionado
  const filteredInstances = useMemo(() => {
    let list = instances
    if (filtro === "desconectados") list = list.filter((i) => i.status !== "conectado")
    if (filtro === "conectados") list = list.filter((i) => i.status === "conectado")

    if (busca.trim()) {
      const q = busca.toLowerCase().trim()
      list = list.filter(
        (i) =>
          i.instance_name.toLowerCase().includes(q) ||
          i.corretorNome?.toLowerCase().includes(q) ||
          i.numero?.includes(q),
      )
    }
    // Ordena: desconectados primeiro, patricia prioritária
    return [...list].sort((a, b) => {
      if (a.status !== "conectado" && b.status === "conectado") return -1
      if (a.status === "conectado" && b.status !== "conectado") return 1
      if (a.isPatricia && !b.isPatricia) return -1
      if (!a.isPatricia && b.isPatricia) return 1
      return (a.corretorNome || "").localeCompare(b.corretorNome || "")
    })
  }, [instances, filtro, busca])

  // Topbar Button para Corretor
  if (!isGestor) {
    if (myInstanceDisconnected) {
      return (
        <>
          <button
            onClick={() =>
              openReconnectModal({
                corretorId: user?.id,
                corretorNome: user?.nome,
                titulo: "Meu WhatsApp",
              })
            }
            className="flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive transition hover:bg-destructive/20"
            title="Seu WhatsApp está desconectado! Clique para reconectar."
          >
            <span className="relative flex size-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-destructive" />
            </span>
            <MessageCircle className="size-3.5" />
            <span className="hidden sm:inline">WhatsApp Offline</span>
          </button>
        </>
      )
    }

    return (
      <div
        className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400"
        title="Seu WhatsApp está conectado e pronto para receber leads."
      >
        <span className="size-2 rounded-full bg-emerald-500" />
        <MessageCircle className="size-3.5" />
        <span className="hidden sm:inline">WhatsApp Conectado</span>
      </div>
    )
  }

  // Topbar Button para Gestor
  return (
    <>
      <button
        onClick={openMonitorModal}
        className={cn(
          "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition shadow-xs",
          offlineCount > 0
            ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
            : "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400",
        )}
        title={
          offlineCount > 0
            ? `${offlineCount} instâncias desconectadas. Clique para ver detalhes e reconectar.`
            : "Todas as instâncias de WhatsApp estão conectadas."
        }
      >
        {offlineCount > 0 ? (
          <>
            <span className="relative flex size-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-80" />
              <span className="relative inline-flex size-2.5 rounded-full bg-destructive" />
            </span>
            <MessageCircle className="size-3.5" />
            <span>
              {offlineCount} {offlineCount === 1 ? "Offline" : "Offline"}
            </span>
          </>
        ) : (
          <>
            <span className="size-2 rounded-full bg-emerald-500" />
            <MessageCircle className="size-3.5" />
            <span className="hidden sm:inline">WhatsApps OK</span>
            <span className="opacity-70">({totalCount})</span>
          </>
        )}
      </button>

      {/* Modal Completo de Monitoramento para o Gestor */}
      <Dialog
        open={monitorModalOpen}
        onClose={closeMonitorModal}
        title="Monitor de Conexões WhatsApp em Tempo Real"
      >
        <div className="flex flex-col gap-4">
          {/* Header com KPIs rápidos */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-3 text-center shadow-2xs">
              <span className="text-[11px] font-medium text-muted-foreground uppercase">Total</span>
              <p className="font-display text-lg font-bold text-foreground">{totalCount}</p>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-center shadow-2xs">
              <span className="text-[11px] font-medium text-emerald-700 uppercase dark:text-emerald-400">
                Online
              </span>
              <p className="font-display text-lg font-bold text-emerald-700 dark:text-emerald-400">
                {connectedInstances.length}
              </p>
            </div>
            <div
              className={cn(
                "rounded-xl border p-3 text-center shadow-2xs",
                offlineCount > 0
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-border bg-card text-muted-foreground",
              )}
            >
              <span className="text-[11px] font-medium uppercase">Offline</span>
              <p className="font-display text-lg font-bold">
                {offlineCount}
              </p>
            </div>
            <div
              className={cn(
                "rounded-xl border p-3 text-center shadow-2xs",
                patriciaDisconnected
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
              )}
            >
              <span className="text-[11px] font-medium uppercase">IA Patricia</span>
              <p className="font-display text-xs font-bold mt-1">
                {patriciaDisconnected ? "🔴 Offline" : "🟢 Conectada"}
              </p>
            </div>
          </div>

          {/* Barra de Filtros e Ferramentas */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFiltro("todos")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-semibold transition",
                  filtro === "todos"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                Todos ({totalCount})
              </button>
              <button
                onClick={() => setFiltro("desconectados")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-semibold transition",
                  filtro === "desconectados"
                    ? "bg-destructive text-destructive-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                Offline ({offlineCount})
              </button>
              <button
                onClick={() => setFiltro("conectados")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-semibold transition",
                  filtro === "conectados"
                    ? "bg-emerald-600 text-white"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                Online ({connectedInstances.length})
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={toggleSound}
                className={cn(
                  "flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition",
                  soundEnabled
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "border-muted bg-muted text-muted-foreground",
                )}
                title={soundEnabled ? "Som de alerta ativo. Clique para silenciar." : "Som de alerta silenciado. Clique para ativar."}
              >
                {soundEnabled ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
                <span className="hidden sm:inline">{soundEnabled ? "Som Ativo" : "Silenciado"}</span>
              </button>
              {soundEnabled && (
                <button
                  onClick={testSound}
                  className="rounded-lg border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
                  title="Testar som do alerta"
                >
                  Testar
                </button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={refreshAll}
                disabled={refreshing}
                className="gap-1.5 h-8 text-xs"
              >
                <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
                {refreshing ? "Sincronizando..." : "Verificar Todas"}
              </Button>
            </div>
          </div>

          {/* Campo de Busca Rápida */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por corretor, linha ou telefone..."
              className="pl-9 h-9 text-sm"
            />
          </div>

          {/* Lista de Instâncias */}
          <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
            {filteredInstances.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                Nenhuma conexão encontrada com o filtro atual.
              </p>
            ) : (
              filteredInstances.map((inst) => {
                const isOnline = inst.status === "conectado"
                const nomeExibicao = inst.corretorNome || inst.instance_name
                const isPatricia = inst.isPatricia

                return (
                  <div
                    key={inst.id || inst.instance_name}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 transition",
                      !isOnline
                        ? "border-destructive/30 bg-destructive/5 hover:bg-destructive/10"
                        : "border-border bg-card/60 hover:bg-card",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-lg",
                          !isOnline
                            ? "bg-destructive/15 text-destructive"
                            : "bg-emerald-500/15 text-emerald-600",
                        )}
                      >
                        {isOnline ? (
                          <CheckCircle2 className="size-4" />
                        ) : (
                          <AlertTriangle className="size-4" />
                        )}
                      </span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-foreground leading-none">
                            {nomeExibicao}
                          </p>
                          {isPatricia && (
                            <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                              IA Principal
                            </span>
                          )}
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-0.2 text-[10px] font-semibold",
                              isOnline
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-destructive/20 text-destructive",
                            )}
                          >
                            {isOnline ? "Conectado" : "Desconectado"}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-mono text-[11px]">{inst.instance_name}</span>
                          {inst.numero && <span>· +{inst.numero}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 ml-auto">
                      {!isOnline ? (
                        <>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              closeMonitorModal()
                              openReconnectModal({
                                corretorId: inst.corretor_id ?? undefined,
                                corretorNome: inst.corretorNome,
                                instanceName: inst.instance_name,
                                titulo: isPatricia ? `IA Patricia · ${inst.instance_name}` : inst.corretorNome,
                              })
                            }}
                            className="gap-1 h-7 text-xs"
                          >
                            <QrCode className="size-3.5" />
                            Reconectar QR
                          </Button>
                          {!isPatricia && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => copiarAviso(inst)}
                              className="gap-1 h-7 text-xs"
                              title="Copiar mensagem para avisar o corretor pelo WhatsApp pessoal"
                            >
                              <Copy className="size-3" />
                              <span className="hidden sm:inline">Avisar</span>
                            </Button>
                          )}
                        </>
                      ) : (
                        <button
                          onClick={() => handleRefreshSingle(inst.instance_name)}
                          disabled={checkingInstance === inst.instance_name}
                          className="flex items-center gap-1 rounded-md p-1.5 text-xs text-muted-foreground transition hover:bg-muted"
                          title="Verificar status na Evolution"
                        >
                          <RefreshCw
                            className={cn(
                              "size-3.5",
                              checkingInstance === inst.instance_name && "animate-spin",
                            )}
                          />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer com link direto */}
          <div className="flex items-center justify-between border-t border-border pt-3 text-xs">
            <span className="text-muted-foreground">
              Status monitorado em tempo real via Supabase e Webhook Evolution.
            </span>
            <Link
              href="/configuracoes/whatsapp"
              onClick={closeMonitorModal}
              className="flex items-center gap-1 font-semibold text-primary hover:underline"
            >
              Ir para Conexões WhatsApp
              <ExternalLink className="size-3" />
            </Link>
          </div>
        </div>
      </Dialog>
    </>
  )
}
