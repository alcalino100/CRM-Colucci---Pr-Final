"use client"

import { useEffect, useRef, useState } from "react"
import type { ComponentType } from "react"
import { Bell, BellOff, UserPlus, CalendarDays, Trash2, Megaphone } from "lucide-react"
import { useLeads } from "@/lib/leads-store"
import { useAuth } from "@/lib/auth-context"
import { isGestorNivel } from "@/lib/roles"
import { fmtDateTime } from "@/lib/labels"
import { cn } from "@/lib/utils"
import type { Notification } from "@/lib/mock-data"

type Aba = "minhas" | "equipe" | "gestao"

// Ícone + cor de chip por tipo de notificação
const TIPO_STYLE: Record<string, { icon: ComponentType<{ className?: string }>; chip: string }> = {
  lead_novo: { icon: UserPlus, chip: "bg-sky-100 text-sky-700" },
  visita: { icon: CalendarDays, chip: "bg-blue-100 text-blue-700" },
  exclusao: { icon: Trash2, chip: "bg-red-100 text-red-700" },
  comunicado_gestao: { icon: Megaphone, chip: "bg-amber-100 text-amber-700" },
  locacao_lead_novo: { icon: UserPlus, chip: "bg-teal-100 text-teal-700" },
  locacao_visita: { icon: CalendarDays, chip: "bg-emerald-100 text-emerald-700" },
  locacao_exclusao: { icon: Trash2, chip: "bg-orange-100 text-orange-700" },
  whatsapp_desconectado: { icon: BellOff, chip: "bg-red-100 text-red-700" },
}

// Selo do módulo: Vendas (azul) × Locação (verde)
function ModuleChip({ modulo }: { modulo?: string | null }) {
  if (modulo === "vendas") return <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700">Vendas</span>
  if (modulo === "locacao") return <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Locação</span>
  return null
}

export function NotificationBell() {
  const { notifications, markNotificationsRead } = useLeads()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [aba, setAba] = useState<Aba>("minhas")
  const ref = useRef<HTMLDivElement>(null)
  const unread = notifications.filter((n) => !n.read).length
  const isGestor = isGestorNivel(user?.role ?? "corretor")

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
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-[0_18px_44px_-14px_rgb(0_0_0/0.3)] animate-in fade-in zoom-in-95">
          <div className="bg-gradient-to-r from-primary to-accent px-4 py-3 text-primary-foreground">
            <div className="flex items-center gap-2">
              <Bell className="size-4" />
              <p className="font-display text-sm font-semibold">Notificações</p>
              {unread > 0 && (
                <span className="ml-auto rounded-full bg-primary-foreground/20 px-2 py-0.5 text-[11px] font-bold">
                  {unread} não lida{unread > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="mt-2 flex gap-1">
              {abas.map((a) => (
                <button
                  key={a.key}
                  onClick={() => setAba(a.key)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition",
                    abaAtiva === a.key ? "bg-primary-foreground/95 text-primary" : "bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25",
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
              lista.map((n) => {
                const st = n.tipo ? TIPO_STYLE[n.tipo] : undefined
                const Icon = st?.icon ?? Bell
                return (
                  <div
                    key={n.id}
                    className={cn(
                      "flex gap-3 border-b border-border/60 px-4 py-3 last:border-0 transition hover:bg-muted/60",
                      !n.read && "bg-primary/[0.04]",
                    )}
                  >
                    <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", st?.chip ?? "bg-muted text-muted-foreground")}>
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {n.titulo && <p className="text-sm font-semibold leading-snug text-foreground">{n.titulo}</p>}
                        <ModuleChip modulo={n.modulo} />
                      </div>
                      <p className={cn("text-sm leading-snug text-foreground", n.titulo && "mt-0.5")}>{n.texto}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{fmtDateTime(n.timestamp)}</p>
                    </div>
                    {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" aria-label="Não lida" />}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
