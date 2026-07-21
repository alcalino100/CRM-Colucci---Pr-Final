"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { BellRing, CalendarDays, KanbanSquare, LayoutDashboard, LogOut, Menu, KeyRound, Shield, ScrollText, BarChart3, ClipboardCheck, UserCircle, X } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import type { Role } from "@/lib/mock-data"
import { ToastProvider } from "@/components/ui/primitives"
import { LeadsProvider, useLeads } from "@/lib/leads-store"
import { ColucciLogo } from "@/components/colucci-logo"
import { NotificationBell } from "@/components/notification-bell"
import { cn } from "@/lib/utils"

// Mostra a foto de perfil (se houver) ou as iniciais. Precisa estar dentro do LeadsProvider.
function TopbarAvatar({ userId, initials }: { userId: string; initials: string }) {
  const { users } = useLeads()
  const avatar = users.find((u) => u.id === userId)?.avatar
  if (avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatar || "/placeholder.svg"} alt="Foto de perfil" className="size-9 rounded-full object-cover" />
  }
  return <div className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{initials}</div>
}

const NAV: { href: string; label: string; icon: any; roles: Role[] }[] = [
  { href: "/painel-corretor", label: "Kanban", icon: KanbanSquare, roles: ["corretor", "gestor"] },
  { href: "/agenda", label: "Agenda", icon: CalendarDays, roles: ["corretor", "gestor"] },
  { href: "/dashboard-gestao", label: "Dashboard", icon: LayoutDashboard, roles: ["gestor"] },
  { href: "/auditoria", label: "Auditoria de Leads", icon: ClipboardCheck, roles: ["gestor"] },
  { href: "/meta-ads", label: "Meta Ads", icon: BarChart3, roles: ["gestor"] },
  { href: "/perfil", label: "Meu Perfil", icon: UserCircle, roles: ["corretor", "gestor"] },
  { href: "/admin", label: "Administração", icon: Shield, roles: ["gestor"] },
  { href: "/admin/notificacoes", label: "Disparador de Notificações", icon: BellRing, roles: ["gestor"] },
  { href: "/admin/acessos", label: "Gestão de Acessos", icon: KeyRound, roles: ["gestor"] },
  { href: "/admin/logs", label: "Logs", icon: ScrollText, roles: ["gestor"] },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.replace("/login")
  }, [loading, user, router])

  useEffect(() => setOpen(false), [pathname])

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Carregando...</div>
  }

  const items = NAV.filter((n) => n.roles.includes(user.role))
  const initials = user.nome.split(" ").map((n) => n[0]).slice(0, 2).join("")

  function handleLogout() {
    logout()
    router.replace("/login")
  }

  const SidebarContent = (
    <>
      <div className="flex items-center px-5 py-5">
        <ColucciLogo />
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {items.map((item) => {
          const active = item.href === "/admin"
            ? pathname === "/admin"
            : pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <Link key={item.href} href={item.href}
              className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-white")}>
              <item.icon className="size-4.5" />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="border-t border-sidebar-border px-3 py-4">
        <span className="px-3 text-xs uppercase tracking-wide text-sidebar-foreground/70">
          {user.role === "gestor" ? "Gestor" : "Corretor"}
        </span>
      </div>
    </>
  )

  return (
    <ToastProvider>
      <LeadsProvider>
      <div className="flex min-h-screen bg-background">
        {/* Sidebar desktop */}
        <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-sidebar lg:flex">{SidebarContent}</aside>

        {/* Sidebar mobile */}
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-sidebar">
              <button onClick={() => setOpen(false)} aria-label="Fechar menu" className="absolute right-3 top-4 text-sidebar-foreground"><X className="size-5" /></button>
              {SidebarContent}
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden lg:pl-64">
          {/* Topbar */}
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card px-4 lg:px-6">
            <button onClick={() => setOpen(true)} aria-label="Abrir menu" className="rounded-md p-2 text-muted-foreground hover:bg-muted lg:hidden">
              <Menu className="size-5" />
            </button>
            <div className="ml-auto flex items-center gap-3">
              <NotificationBell />
              <div className="text-right">
                <p className="text-sm font-medium leading-tight">{user.nome}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
              <TopbarAvatar userId={user.id} initials={initials} />
              <button onClick={handleLogout} aria-label="Sair" className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-destructive">
                <LogOut className="size-5" />
              </button>
            </div>
          </header>

          <main className="min-w-0 flex-1 overflow-x-hidden p-4 lg:p-6">{children}</main>
        </div>
      </div>
      </LeadsProvider>
    </ToastProvider>
  )
}
