"use client"

import { useEffect, useRef, useState } from "react"
import { Bell, BellOff } from "lucide-react"
import { useLeads } from "@/lib/leads-store"
import { useAuth } from "@/lib/auth-context"
import { fmtDateTime } from "@/lib/labels"
import { cn } from "@/lib/utils"
import type { Notification } from "@/lib/mock-data"

type Aba = "minhas" | "equipe" | "gestao"

export function NotificationBell() {
  const { notifications, markNotificationsRead } = useLeads()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [aba, setAba] = useState<Aba>("minhas")
  const ref = useRef<HTMLDivElement>(null)
  const unread = notifications.filter((n) => !n.read).length
  const isGestor = user?.role === "gestor"

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && unread > 0) markNotificationsRead()
  }

  // Minhas: dirigidas ao usuário. Equipe: operacionais do time. Gestão: gerenciais (para_role gestor)
  function inAba(n: Notification, a: Aba): boolean {
    if (a === "minhas") return n.paraUsuarioId === user?.id
    if (a === "gestao") return n.paraRole === "gestor" && !n.paraUsuarioId
    return !n.paraUsuarioId && n.paraRole !== "gestor" // equipe: broadcast operacional
  }

  const abas: { key: Aba; label: string }[] = isGestor
    ? [{ key: "gestao", label: "Gestão" }, { key: "minhas", label: "Minhas" }, { key: "equipe", label: "Equipe" }]
    : [{ key: "minhas", label: "Minhas" }, { key: "equipe", label: "Equipe" }]

  const abaAtiva = abas.some((a) => a.key === aba) ? aba : abas[0].key
  const lista = notifications.filter((n) => inAba(n, abaAtiva))

  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} aria-label="Notificações" className="relative rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground">
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          <div className="border-b border-border px-4 py-3">
            <p className="font-display text-sm font-semibold">Notificações</p>
            <div className="mt-2 flex gap-1">
              {abas.map((a) => (
                <button
                  key={a.key}
                  onClick={() => setAba(a.key)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition",
                    abaAtiva === a.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {lista.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
                <BellOff className="size-5" />
                Nenhuma notificação nesta aba.
              </div>
            ) : (
              lista.map((n) => (
                <div key={n.id} className={cn("border-b border-border/60 px-4 py-3 last:border-0", !n.read && "bg-primary/5")}>
                  {n.titulo && <p className="text-sm font-semibold leading-snug text-foreground">{n.titulo}</p>}
                  <p className={cn("text-sm leading-snug text-foreground", n.titulo && "mt-1")}>{n.texto}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{fmtDateTime(n.timestamp)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
