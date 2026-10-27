"use client"

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { useAuth } from "@/lib/auth-context"
import { isGestorNivel } from "@/lib/roles"
import { useToast } from "@/components/ui/primitives"

export interface WhatsAppInstance {
  id: string
  corretor_id: string | null
  instance_name: string
  numero: string | null
  status: "conectado" | "desconectado" | "connecting" | string
  qr_code?: string | null
  criado_em?: string
  atualizado_em?: string
  corretorNome?: string
  isPatricia?: boolean
}

export interface ReconnectTarget {
  corretorId?: string
  corretorNome?: string
  instanceName?: string
  titulo?: string
}

interface WhatsAppStatusContextType {
  instances: WhatsAppInstance[]
  loading: boolean
  refreshing: boolean
  myInstance: WhatsAppInstance | null
  myInstanceDisconnected: boolean
  disconnectedInstances: WhatsAppInstance[]
  connectedInstances: WhatsAppInstance[]
  patriciaInstances: WhatsAppInstance[]
  patriciaDisconnected: boolean
  isGestor: boolean
  soundEnabled: boolean
  toggleSound: () => void
  testSound: () => void
  reconnectModalOpen: boolean
  reconnectTarget: ReconnectTarget | null
  openReconnectModal: (target: ReconnectTarget) => void
  closeReconnectModal: () => void
  monitorModalOpen: boolean
  openMonitorModal: () => void
  closeMonitorModal: () => void
  refreshAll: () => Promise<void>
  refreshSingle: (instanceName: string) => Promise<void>
}

const WhatsAppStatusCtx = createContext<WhatsAppStatusContextType | null>(null)

export function playAlertChime() {
  if (typeof window === "undefined") return
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    if (ctx.state === "suspended") {
      void ctx.resume()
    }
    const now = ctx.currentTime

    // Two-tone warning beep: 587.33 Hz (D5) -> 440 Hz (A4)
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = "sine"
    osc1.frequency.setValueAtTime(587.33, now)
    gain1.gain.setValueAtTime(0.3, now)
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.28)
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.start(now)
    osc1.stop(now + 0.3)

    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = "sine"
    osc2.frequency.setValueAtTime(440, now + 0.16)
    gain2.gain.setValueAtTime(0.35, now + 0.16)
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5)
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.start(now + 0.16)
    osc2.stop(now + 0.55)
  } catch {
    /* Browser autoplay restriction */
  }
}

export function WhatsAppStatusProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const toast = useToast()
  const [instances, setInstances] = useState<WhatsAppInstance[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [reconnectModalOpen, setReconnectModalOpen] = useState(false)
  const [reconnectTarget, setReconnectTarget] = useState<ReconnectTarget | null>(null)
  const [monitorModalOpen, setMonitorModalOpen] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)

  // Keep a mutable ref of instances to inspect previous status in realtime handlers
  const instancesRef = useRef<WhatsAppInstance[]>([])
  useEffect(() => {
    instancesRef.current = instances
  }, [instances])

  // Load sound setting from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("crm_whatsapp_sound_alert")
      if (saved !== null) {
        setSoundEnabled(saved === "true")
      }
    } catch {
      /* ignore */
    }
  }, [])

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev
      try {
        localStorage.setItem("crm_whatsapp_sound_alert", String(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const testSound = useCallback(() => {
    playAlertChime()
  }, [])

  const isGestor = Boolean(user && isGestorNivel(user.role))

  const fetchInstances = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await fetch("/api/whatsapp/instancias")
      if (!res.ok) return
      const json = await res.json()
      if (Array.isArray(json.data)) {
        const mapped: WhatsAppInstance[] = json.data.map((item: any) => ({
          ...item,
          isPatricia:
            item.instance_name?.toLowerCase().includes("patricia") ||
            item.corretorNome?.toLowerCase().includes("patricia"),
        }))
        setInstances(mapped)
      }
    } catch (err) {
      console.warn("[whatsapp-status] falha ao buscar instâncias:", err)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  // Initial load and periodic refresh
  useEffect(() => {
    void fetchInstances()
    const interval = setInterval(() => {
      void fetchInstances(true)
    }, 60_000)
    return () => clearInterval(interval)
  }, [fetchInstances])

  // Real-time subscription to postgres_changes on whatsapp_instancias
  useEffect(() => {
    const channel = supabase
      .channel("crm-whatsapp-status-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_instancias" },
        (payload: any) => {
          const eventType = payload.eventType
          const newRow = payload.new
          const oldRow = payload.old

          if (eventType === "UPDATE" && newRow) {
            setInstances((prev) => {
              const current = prev.find((i) => i.id === newRow.id || i.instance_name === newRow.instance_name)
              const previousStatus = current?.status ?? oldRow?.status

              // Check if connection was lost
              const justDisconnected = previousStatus === "conectado" && newRow.status === "desconectado"

              if (justDisconnected) {
                if (soundEnabled) {
                  playAlertChime()
                }

                const nome = current?.corretorNome ?? newRow.instance_name
                const isMyInst = user?.id && current?.corretor_id === user.id
                const isPat =
                  newRow.instance_name?.toLowerCase().includes("patricia") ||
                  nome.toLowerCase().includes("patricia")

                if (isMyInst) {
                  toast("🚨 Seu WhatsApp foi desconectado! Reconecte para continuar recebendo leads.", "error")
                } else if (isGestor) {
                  if (isPat) {
                    toast("🚨 URGENTE: O WhatsApp da Patricia (IA) desconectou!", "error")
                  } else {
                    toast(`🚨 WhatsApp de ${nome} desconectou!`, "error")
                  }
                }
              }

              // Also if just reconnected, give a nice feedback if it was current user's
              const justConnected = previousStatus !== "conectado" && newRow.status === "conectado"
              if (justConnected && user?.id && current?.corretor_id === user.id) {
                toast("✅ Seu WhatsApp foi reconectado com sucesso!", "success")
              }

              return prev.map((item) => {
                if (item.id === newRow.id || item.instance_name === newRow.instance_name) {
                  return {
                    ...item,
                    ...newRow,
                    isPatricia:
                      newRow.instance_name?.toLowerCase().includes("patricia") ||
                      item.corretorNome?.toLowerCase().includes("patricia"),
                  }
                }
                return item
              })
            })
          } else if (eventType === "INSERT" && newRow) {
            void fetchInstances(true)
          } else if (eventType === "DELETE" && oldRow) {
            setInstances((prev) => prev.filter((i) => i.id !== oldRow.id && i.instance_name !== oldRow.instance_name))
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchInstances, isGestor, soundEnabled, toast, user?.id])

  const openReconnectModal = useCallback((target: ReconnectTarget) => {
    setReconnectTarget(target)
    setReconnectModalOpen(true)
  }, [])

  const closeReconnectModal = useCallback(() => {
    setReconnectModalOpen(false)
    setReconnectTarget(null)
    void fetchInstances(true)
  }, [fetchInstances])

  const openMonitorModal = useCallback(() => {
    setMonitorModalOpen(true)
  }, [])

  const closeMonitorModal = useCallback(() => {
    setMonitorModalOpen(false)
  }, [])

  const refreshAll = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch("/api/whatsapp/refresh-all", { method: "POST" })
      const json = await res.json()
      if (res.ok) {
        toast("Status de todas as instâncias sincronizado com sucesso!")
        await fetchInstances(true)
      } else {
        toast(json.error ?? "Erro ao sincronizar instâncias.", "error")
      }
    } catch {
      toast("Falha de conexão ao sincronizar instâncias.", "error")
    } finally {
      setRefreshing(false)
    }
  }, [fetchInstances, toast])

  const refreshSingle = useCallback(
    async (instanceName: string) => {
      try {
        const res = await fetch(`/api/whatsapp/refresh?instanceName=${encodeURIComponent(instanceName)}`)
        const json = await res.json()
        if (res.ok) {
          setInstances((prev) =>
            prev.map((inst) =>
              inst.instance_name === instanceName
                ? { ...inst, status: json.status, numero: json.numero ?? inst.numero }
                : inst,
            ),
          )
          toast(`Status de ${instanceName} atualizado: ${json.status}`)
        } else {
          toast(json.error ?? "Erro ao atualizar status.", "error")
        }
      } catch {
        toast("Falha ao comunicar com a Evolution API.", "error")
      }
    },
    [toast],
  )

  const myInstance = useMemo(() => {
    if (!user?.id) return null
    return instances.find((i) => i.corretor_id === user.id) ?? null
  }, [instances, user?.id])

  const myInstanceDisconnected = useMemo(() => {
    if (!user) return false
    // If user has an instance and it is not connected
    if (myInstance && myInstance.status !== "conectado") return true
    return false
  }, [myInstance, user])

  const disconnectedInstances = useMemo(() => {
    return instances.filter((i) => i.status !== "conectado")
  }, [instances])

  const connectedInstances = useMemo(() => {
    return instances.filter((i) => i.status === "conectado")
  }, [instances])

  const patriciaInstances = useMemo(() => {
    return instances.filter((i) => i.isPatricia)
  }, [instances])

  const patriciaDisconnected = useMemo(() => {
    return patriciaInstances.some((i) => i.status !== "conectado")
  }, [patriciaInstances])

  return (
    <WhatsAppStatusCtx.Provider
      value={{
        instances,
        loading,
        refreshing,
        myInstance,
        myInstanceDisconnected,
        disconnectedInstances,
        connectedInstances,
        patriciaInstances,
        patriciaDisconnected,
        isGestor,
        soundEnabled,
        toggleSound,
        testSound,
        reconnectModalOpen,
        reconnectTarget,
        openReconnectModal,
        closeReconnectModal,
        monitorModalOpen,
        openMonitorModal,
        closeMonitorModal,
        refreshAll,
        refreshSingle,
      }}
    >
      {children}
    </WhatsAppStatusCtx.Provider>
  )
}

export function useWhatsAppStatus() {
  const ctx = useContext(WhatsAppStatusCtx)
  if (!ctx) throw new Error("useWhatsAppStatus deve ser usado dentro de WhatsAppStatusProvider")
  return ctx
}
