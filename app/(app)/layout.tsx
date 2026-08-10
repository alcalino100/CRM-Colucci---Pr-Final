"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { BellRing, Building2, CalendarDays, KanbanSquare, LayoutDashboard, LogOut, Menu, KeyRound, Shield, ScrollText, BarChart3, ClipboardCheck, FileSignature, MessageCircle, UserCircle, UsersRound, X, Handshake, UserPlus } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import type { Role } from "@/lib/mock-data"
import { isAdminRole, isGestorNivel, nivelRole, podeLocacao, podeVendas } from "@/lib/roles"
import { ToastProvider } from "@/components/ui/primitives"
import { LeadsProvider, useLeads } from "@/lib/leads-store"
import { LocacaoProvider } from "@/lib/locacao-store"
import { PresenceProvider } from "@/lib/presence"
import { ColucciLogo } from "@/components/colucci-logo"
import { NotificationBell } from "@/components/notification-bell"
import { DailySummary } from "@/components/daily-summary"
import { SaleCelebrationProvider } from "@/components/sale-celebration"
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
  { href: "/cadastros", label: "Leads Cadastrados", icon: UserPlus, roles: ["gestor"] },
  { href: "/fechamento", label: "Fechamentos", icon: Handshake, roles: ["gestor"] },
  { href: "/auditoria", label: "Auditoria de Leads", icon: ClipboardCheck, roles: ["gestor"] },
  { href: "/auditoria/registros", label: "Registros de Auditoria", icon: ScrollText, roles: ["gestor"] },
  { href: "/meta-ads", label: "Meta Ads", icon: BarChart3, roles: ["gestor"] },
  { href: "/configuracoes/whatsapp", label: "Conexões WhatsApp", icon: MessageCircle, roles: ["gestor"] },
  { href: "/perfil", label: "Meu Perfil", icon: UserCircle, roles: ["corretor", "gestor"] },
]

const NAV_LOCACAO: { href: string; label: string; icon: any; roles: Role[] }[] = [
  { href: "/locacao", label: "Kanban de Locação", icon: Building2, roles: ["corretor", "gestor"] },
  { href: "/locacao/leads", label: "Leads de Locação", icon: UsersRound, roles: ["corretor", "gestor"] },
  { href: "/locacao/agenda", label: "Agenda de Locação", icon: CalendarDays, roles: ["corretor", "gestor"] },
  { href: "/locacao/contratos", label: "Contratos", icon: FileSignature, roles: ["gestor"] },
  { href: "/locacao/dashboard", label: "Dashboard Locação", icon: BarChart3, roles: ["gestor"] },
  { href: "/locacao/auditoria", label: "Registros de Auditoria", icon: ScrollText, roles: ["gestor"] },
]

const NAV2: { href: string; label: string; icon: any; roles: Role[] }[] = [
  { href: "/admin", label: "Administração", icon: Shield, roles: ["gestor"] },
  { href: "/admin/notificacoes", label: "Disparador de Notificações", icon: BellRing, roles: ["gestor"] },
  { href: "/admin/logs", label: "Logs", icon: ScrollText, roles: ["gestor"] },
]

// Gestor de módulo (vendas/locação) gerencia a própria equipe pelo Gestão de Acessos
const ACESSOS_LINK: { href: string; label: string; icon: any; roles: Role[] } = {
  href: "/admin/acessos",
  label: "Gestão de Acessos",
  icon: KeyRound,
  roles: ["gestor"],
}

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

  const nivel = nivelRole(user.role)
  const nivelName = nivel === "master" ? "gestor" : nivel
  const canNivel = (roles: Role[]) => roles.includes(nivelName as Role)
  const items = NAV.filter((n) => podeVendas(user.role) && canNivel(n.roles))
  const itemsLocacao = NAV_LOCACAO.filter((n) => podeLocacao(user.role) && canNivel(n.roles))
  const items2 = NAV2.filter((n) => isAdminRole(user.role))
  // Gestor de módulo (ex.: gestor_locacao) vê Gestão de Acessos na seção do seu módulo
  const isModuleGestor = isGestorNivel(user.role) && !isAdminRole(user.role)
  if (isModuleGestor) {
    if (podeVendas(user.role)) items.push(ACESSOS_LINK)
    if (podeLocacao(user.role)) itemsLocacao.push(ACESSOS_LINK)
  }
  const initials = user.nome.split(" ").map((n) => n[0]).slice(0, 2).join("")

  function handleLogout() {
    logout()
    router.replace("/login")
  }

  function renderItems(navItems: { href: string; label: string; icon: any }[]) {
    return navItems.map((item) => {
      const active = item.href === "/admin" || item.href === "/auditoria" || item.href === "/locacao"
        ? pathname === item.href
        : pathname === item.href || pathname.startsWith(item.href + "/")
      return (
        <Link key={item.href} href={item.href}
          className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
            active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-white")}>
          <item.icon className="size-4.5" />
          {item.label}
        </Link>
      )
    })
  }

  const SidebarContent = (
    <>
      <div className="flex items-center px-5 py-5">
        <ColucciLogo />
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3">
        {items.length > 0 && (
          <>
            <span className="px-3 pt-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60">Vendas</span>
            {renderItems(items)}
          </>
        )}
        {itemsLocacao.length > 0 && (
          <>
            <span className="px-3 pt-4 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60">Locação</span>
            {renderItems(itemsLocacao)}
          </>
        )}
        {items2.length > 0 && (
          <>
            <span className="px-3 pt-4 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60">Administração</span>
            {renderItems(items2)}
          </>
        )}
      </nav>
      <div className="border-t border-sidebar-border px-3 py-4">
        <span className="px-3 text-xs uppercase tracking-wide text-sidebar-foreground/70">
          {nivel === "master" ? "Gestor Master" : nivel === "gestor" ? "Gestor" : "Corretor"}
        </span>
      </div>
    </>
  )

  return (
    <ToastProvider>
      <SaleCelebrationProvider>
      <LeadsProvider>
      <LocacaoProvider>
      <PresenceProvider>
      <DailySummary />
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

          <main className="relative min-w-0 flex-1 overflow-x-hidden p-4 lg:p-6">
            {/* Aurora de fundo global */}
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -top-24 left-1/4 h-80 w-[34rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
              <div className="absolute right-[-4rem] top-1/3 h-64 w-64 rounded-full bg-accent/8 blur-3xl" />
              <div className="absolute bottom-[-6rem] left-[-4rem] h-72 w-72 rounded-full bg-secondary/10 blur-3xl" />
            </div>
            <div className="relative z-10">{children}</div>
          </main>
        </div>
      </div>
      </PresenceProvider>
      </LocacaoProvider>
      </LeadsProvider>
      </SaleCelebrationProvider>
    </ToastProvider>
  )
}
