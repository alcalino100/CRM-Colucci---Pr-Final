"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarDays, Sparkles, UserPlus, X } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLeads } from "@/lib/leads-store"
import { Badge } from "@/components/ui/primitives"
import { ORIGENS, type LeadStatus, type Origem } from "@/lib/mock-data"
import { STATUS_LABEL, STATUS_VARIANT, TEMP_LABEL, TEMP_VARIANT, LEAD_STATUSES } from "@/lib/labels"

function ymd(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${m}-${day}`
}

const KEY_PREFIX = "colucci:resumo:"

export function DailySummary() {
  const { user } = useAuth()
  const { leads, ready } = useLeads()
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)

  // Leads que chegaram ONTEM, no escopo do papel do usuário
  const ontemLeads = useMemo(() => {
    if (!user) return []
    const ontem = new Date()
    ontem.setDate(ontem.getDate() - 1)
    const key = ymd(ontem)
    return leads
      .filter((l) => (l.criadoEm ?? "").slice(0, 10) === key)
      .filter((l) => user.role === "gestor" || l.corretorId === user.id)
      .sort((a, b) => (b.criadoEm ?? "").localeCompare(a.criadoEm ?? ""))
  }, [leads, user])

  const porStatus = useMemo(() => {
    const acc = new Map<LeadStatus, number>()
    for (const l of ontemLeads) acc.set(l.status, (acc.get(l.status) ?? 0) + 1)
    return LEAD_STATUSES.filter((s) => acc.get(s)).map((s) => ({ s, n: acc.get(s)! }))
  }, [ontemLeads])

  const porOrigem = useMemo(() => {
    const acc = new Map<Origem, number>()
    for (const l of ontemLeads) acc.set(l.origem, (acc.get(l.origem) ?? 0) + 1)
    return ORIGENS.filter((o) => acc.get(o)).map((o) => ({ o, n: acc.get(o)! }))
  }, [ontemLeads])

  // Abre uma vez por dia por usuário (depois que os dados iniciais carregam)
  useEffect(() => {
    if (!user || !ready || ontemLeads.length === 0) return
    const storageKey = `${KEY_PREFIX}${user.id}:${ymd(new Date())}`
    if (localStorage.getItem(storageKey)) return
    const t = setTimeout(() => setOpen(true), 900)
    return () => clearTimeout(t)
  }, [user, ready, ontemLeads.length])

  function fechar() {
    if (user) localStorage.setItem(`${KEY_PREFIX}${user.id}:${ymd(new Date())}`, "1")
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") fechar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, user])

  if (!user || !open) return null

  const ontem = new Date()
  ontem.setDate(ontem.getDate() - 1)
  const dataLabel = ontem.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
  const visiveis = showAll ? ontemLeads : ontemLeads.slice(0, 6)

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm animate-in fade-in" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_60px_-16px_rgb(0_0_0/0.35)] animate-in zoom-in-95 fade-in">
        <div className="bg-gradient-to-r from-primary to-accent px-6 py-5 text-primary-foreground">
          <button
            onClick={fechar}
            aria-label="Fechar"
            className="absolute right-4 top-4 rounded-md p-1 text-primary-foreground/80 transition hover:bg-primary-foreground/15 hover:text-primary-foreground"
          >
            <X className="size-5" />
          </button>
          <div className="flex items-center gap-2">
            <CalendarDays className="size-5" />
            <h2 className="font-display text-lg font-semibold">Resumo do dia anterior</h2>
          </div>
          <p className="mt-1 text-sm capitalize text-primary-foreground/85">{dataLabel}</p>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto p-6">
          {/* Destaque principal */}
          <div className="flex items-center gap-4 rounded-xl border border-border bg-muted/40 p-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-[0_6px_16px_-6px_rgb(178_34_34/0.6)]">
              <UserPlus className="size-5" />
            </span>
            <div>
              <p className="font-display text-3xl font-bold leading-none text-foreground">{ontemLeads.length}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {ontemLeads.length === 1 ? "lead recebido ontem" : "leads recebidos ontem"}
              </p>
            </div>
          </div>

          {/* Por status */}
          {porStatus.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Por status</h3>
              <div className="flex flex-wrap gap-1.5">
                {porStatus.map(({ s, n }) => (
                  <Badge key={s} variant={STATUS_VARIANT[s]} className="gap-1 px-2.5 py-1">
                    {STATUS_LABEL[s]}
                    <span className="font-bold">{n}</span>
                  </Badge>
                ))}
              </div>
            </section>
          )}

          {/* Por origem */}
          {porOrigem.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Por origem</h3>
              <div className="flex flex-wrap gap-1.5">
                {porOrigem.map(({ o, n }) => (
                  <span key={o} className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground">
                    {o}
                    <span className="font-bold text-primary">{n}</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Lista de nomes */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {user.role === "gestor" ? "Todos os leads de ontem" : "Seus leads de ontem"}
            </h3>
            <ul className="space-y-2">
              {visiveis.map((l) => (
                <li key={l.id} className="flex items-center gap-3 rounded-lg border border-border/70 bg-background px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{l.nome}</p>
                    <p className="text-xs text-muted-foreground">{l.origem}</p>
                  </div>
                  <Badge variant={TEMP_VARIANT[l.temperatura]}>{TEMP_LABEL[l.temperatura]}</Badge>
                  <Badge variant={STATUS_VARIANT[l.status]} className="shrink-0">{STATUS_LABEL[l.status]}</Badge>
                </li>
              ))}
            </ul>
            {ontemLeads.length > 6 && !showAll && (
              <button
                onClick={() => setShowAll(true)}
                className="mt-2 text-xs font-medium text-primary hover:underline"
              >
                Ver todos os {ontemLeads.length} leads
              </button>
            )}
          </section>
        </div>

        <div className="border-t border-border p-4">
          <button
            onClick={fechar}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_6px_18px_-6px_rgb(178_34_34/0.55)] transition hover:from-primary/90 hover:to-accent/90 hover:-translate-y-px active:translate-y-0"
          >
            <Sparkles className="size-4" />
            Entendi
          </button>
        </div>
      </div>
    </div>
  )
}
