"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { supabase } from "@/lib/supabase/client"

interface Presenca {
  // userId -> online?
  online: Record<string, boolean>
  // userId -> último heartbeat (para "ausente desde")
  ultimaVez: Record<string, string>
  // userId -> segundos de uso registrados hoje
  usoHoje: Record<string, number>
}

const PresencaCtx = createContext<Presenca>({ online: {}, ultimaVez: {}, usoHoje: {} })

export function usePresenca() {
  return useContext(PresencaCtx)
}

// Verifica se o usuário está online (heartbeat recente)
export function isOnline(presenca: Presenca, userId?: string | null) {
  return Boolean(userId && presenca.online[userId])
}

const HEARTBEAT_MS = 30_000 // persistência da sessão
const ONLINE_LIMIAR_MS = 45_000 // considerado online se heartbeat < 45s atrás

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [online, setOnline] = useState<Record<string, boolean>>({})
  const [ultimaVez, setUltimaVez] = useState<Record<string, string>>({})
  const [usoHoje, setUsoHoje] = useState<Record<string, number>>({})

  const sessionId = useRef<string | null>(null)
  const acumulado = useRef(0)

  // Sessão de uso: cria registro no login e acumula tempo visível
  useEffect(() => {
    if (!user) return
    let disposed = false
    const uid = user.id

    async function abrirSessao() {
      try {
        const { data } = await supabase
          .from("crm_sessoes")
          .insert({
            user_id: uid,
            inicio_em: new Date().toISOString(),
            duracao_seg: 0,
            atualizado_em: new Date().toISOString(),
          })
          .select("id")
          .single()
        if (!disposed && data && !sessionId.current) sessionId.current = (data as { id: string }).id
      } catch {
        // tabela ainda não criada — segue sem persistir
      }
    }

    async function persistir(final = false) {
      const id = sessionId.current
      if (!id) return
      const agora = new Date().toISOString()
      try {
        await supabase
          .from("crm_sessoes")
          .update({
            duracao_seg: Math.round(acumulado.current),
            atualizado_em: agora,
            fim_em: final ? agora : null,
          })
          .eq("id", id)
      } catch {}
      if (final) {
        sessionId.current = null
        acumulado.current = 0
      }
    }

    // acumula 1s por tick enquanto a aba está visível
    const tick = window.setInterval(() => {
      if (document.visibilityState === "visible") acumulado.current += 1
    }, 1000)

    // heartbeat periódico
    const pulso = window.setInterval(() => void persistir(false), HEARTBEAT_MS)

    const onVis = () => {
      if (document.visibilityState === "hidden") void persistir(true)
      else if (!sessionId.current) void abrirSessao()
    }
    const onUnload = () => void persistir(true)
    document.addEventListener("visibilitychange", onVis)
    window.addEventListener("pagehide", onUnload)

    void abrirSessao()

    return () => {
      disposed = true
      window.clearInterval(tick)
      window.clearInterval(pulso)
      document.removeEventListener("visibilitychange", onVis)
      window.removeEventListener("pagehide", onUnload)
      void persistir(true)
    }
  }, [user?.id])

  // Polling de presença (online) + uso do dia
  useEffect(() => {
    if (!user) return
    let disposed = false

    async function lerEstado() {
      try {
        const limiar = new Date(Date.now() - ONLINE_LIMIAR_MS).toISOString()
        const { data } = await supabase
          .from("crm_sessoes")
          .select("user_id, atualizado_em")
          .gte("atualizado_em", limiar)
        if (disposed || !data) return
        const mapOnline: Record<string, boolean> = {}
        const mapVez: Record<string, string> = {}
        for (const s of data as { user_id: string; atualizado_em: string }[]) {
          mapOnline[s.user_id] = true
          mapVez[s.user_id] = s.atualizado_em
        }
        setOnline(mapOnline)
        setUltimaVez(mapVez)
      } catch {}

      try {
        const hoje = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
        const { data } = await supabase
          .from("crm_sessoes")
          .select("user_id, duracao_seg")
          .gte("inicio_em", hoje)
        if (disposed || !data) return
        const map: Record<string, number> = {}
        for (const s of data as { user_id: string; duracao_seg: number }[]) {
          map[s.user_id] = (map[s.user_id] || 0) + (s.duracao_seg || 0)
        }
        setUsoHoje(map)
      } catch {}
    }

    void lerEstado()
    const poll = window.setInterval(lerEstado, 15_000)
    return () => {
      disposed = true
      window.clearInterval(poll)
    }
  }, [user?.id])

  return <PresencaCtx.Provider value={{ online, ultimaVez, usoHoje }}>{children}</PresencaCtx.Provider>
}
