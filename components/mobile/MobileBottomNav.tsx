"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { KanbanSquare, Inbox, UserPlus, Zap, Menu, CalendarDays, Archive, UserCircle } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { isGestorNivel } from "@/lib/roles"
import { cn } from "@/lib/utils"

export function MobileBottomNav({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = usePathname()
  const { user } = useAuth()
  const isGestor = user?.role ? isGestorNivel(user.role) : false

  const items = isGestor
    ? [
        { href: "/painel-corretor", label: "Kanban", icon: KanbanSquare },
        { href: "/inbox", label: "Inbox", icon: Inbox },
        { href: "/cadastros", label: "Cadastros", icon: UserPlus },
        { href: "/follow-ups", label: "Follow-up", icon: Zap },
      ]
    : [
        { href: "/painel-corretor", label: "Kanban", icon: KanbanSquare },
        { href: "/agenda", label: "Agenda", icon: CalendarDays },
        { href: "/arquivados", label: "Arquivados", icon: Archive },
        { href: "/perfil", label: "Perfil", icon: UserCircle },
      ]

  return (
    <nav
      aria-label="Navegação inferior mobile"
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-border bg-card/95 px-2 pb-safe backdrop-blur-md shadow-[0_-4px_20px_rgba(0,0,0,0.08)] lg:hidden"
    >
      {items.map((item) => {
        const active = pathname === item.href || (item.href === "/painel-corretor" && pathname.startsWith("/painel-corretor"))
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 py-1 text-[11px] font-medium transition-colors",
              active
                ? "text-primary font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <item.icon className={cn("size-5 transition-transform", active && "scale-110 text-primary")} />
            <span>{item.label}</span>
          </Link>
        )
      })}

      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Abrir todas as opções do menu"
        className="flex flex-1 flex-col items-center justify-center gap-1 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none"
      >
        <Menu className="size-5" />
        <span>Mais</span>
      </button>
    </nav>
  )
}
