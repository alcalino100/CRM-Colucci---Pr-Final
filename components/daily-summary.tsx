"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarDays, Sparkles, UserPlus, X } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLeads } from "@/lib/leads-store"
import { useLocacao } from "@/lib/locacao-store"
import { isGestorNivel, modulosRole } from "@/lib/roles"
import { Badge } from "@/components/ui/primitives"
import { ORIGENS, type LeadStatus, type Origem, type Temperatura } from "@/lib/mock-data"
import { STATUS_LABEL, STATUS_VARIANT, TEMP_LABEL, TEMP_VARIANT, LEAD_STATUSES } from "@/lib/labels"
import { LOCACAO_STATUSES, LOCACAO_STATUS_LABEL, LOCACAO_STATUS_VARIANT, type LocacaoStatus } from "@/lib/locacao-labels"

function ymd(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${m}-${day}`
}

const KEY_PREFIX = "colucci:resumo:"

type ResumoLead = {
  tipo: "vendas" | "locacao"
  id: string
  nome: string
  origem: Origem
  temperatura: Temperatura
  status: LeadStatus | LocacaoStatus
  criadoEm: string
}

function StatusBadge({ item }: { item: ResumoLead }) {
  if (item.tipo === "vendas") {
    const s = item.status as LeadStatus
    return <Badge variant={STATUS_VARIANT[s]} className="shrink-0">{STATUS_LABEL[s]}</Badge>
  }
  const s = item.status as LocacaoStatus
  return <Badge variant={LOCACAO_STATUS_VARIANT[s]} className="shrink-0">{LOCACAO_STATUS_LABEL[s]}</Badge>
}

export function DailySummary() {
  const { user } = useAuth()
  const { leads: vendasLeads, ready: readyVendas } = useLeads()
  const { leads: locacaoLeads, ready: readyLocacao } = useLocacao()
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const modulos = useMemo(() => (user ? modulosRole(user.role) : []), [user])
  const ready = (modulos.includes("vendas") ? readyVendas : true) && (modulos.includes("locacao") ? readyLocacao : true)

  // Leads que chegaram ONTEM, no escopo do papel do usuário e dos módulos dele
  const ontemLeads = useMemo(() => {
    if (!user) return []
    const key = ymd(new Date(Date.now() - 86400000))
    const gestor = isGestorNivel(user.role)
    const out: ResumoLead[] = []
    if (modulos.includes("vendas")) {
      for (const l of vendasLeads) {
        if ((l.criadoEm ?? "").slice(0, 10) !== key) continue
        if (!gestor && l.corretorId !== user.id) continue
        out.push({ tipo: "vendas", id: l.id, nome: l.nome, origem: l.origem, temperatura: l.temperatura, status: l.status, criadoEm: l.criadoEm ?? "" })
      }
    }
    if (modulos.includes("locacao")) {
      for (const l of locacaoLeads) {
        if ((l.criadoEm ?? "").slice(0, 10) !== key) continue
        if (!gestor && l.corretorId !== user.id) continue
        out.push({ tipo: "locacao", id: l.id, nome: l.nome, origem: l.origem, temperatura: l.temperatura, status: l.status, criadoEm: l.criadoEm ?? "" })
      }
    }
    return out.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
  }, [user, modulos, vendasLeads, locacaoLeads])

  const secoesStatus = useMemo(() => {
    const secoes: { titulo: string; itens: { label: string; variant: string; n: number }[] }[] = []
    const vendas = ontemLeads.filter((i) => i.tipo === "vendas")
    if (vendas.length > 0) {
      const acc = new Map<LeadStatus, number>()
      for (const i of vendas) acc.set(i.status as LeadStatus, (acc.get(i.status as LeadStatus) ?? 0) + 1)
      secoes.push({ titulo: "Vendas", itens: LEAD_STATUSES.filter((s) => acc.get(s)).map((s) => ({ label: STATUS_LABEL[s], variant: STATUS_VARIANT[s], n: acc.get(s)! })) })
    }
    const locacao = ontemLeads.filter((i) => i.tipo === "locacao")
    if (locacao.length > 0) {
      const acc = new Map<LocacaoStatus, number>()
      for (const i of locacao) acc.set(i.status as LocacaoStatus, (acc.get(i.status as LocacaoStatus) ?? 0) + 1)
      secoes.push({ titulo: "Locação", itens: LOCACAO_STATUSES.filter((s) => acc.get(s)).map((s) => ({ label: LOCACAO_STATUS_LABEL[s], variant: LOCACAO_STATUS_VARIANT[s], n: acc.get(s)! })) })
    }
    return secoes
  }, [ontemLeads])

  const porOrigem = useMemo(() => {
    const acc = new Map<Origem, number>()
    for (const i of ontemLeads) acc.set(i.origem, (acc.get(i.origem) ?? 0) + 1)
    return ORIGENS.filter((o) => acc.get(o)).map((o) => ({ o, n: acc.get(o)! }))
  }, [ontemLeads])

  const temAmbos = ontemLeads.some((i) => i.tipo === "vendas") && ontemLeads.some((i) => i.tipo === "locacao")

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
  const vendasVisiveis = visiveis.filter((i) => i.tipo === "vendas")
  const locacaoVisiveis = visiveis.filter((i) => i.tipo === "locacao")

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

          {/* Por status (separado por módulo) */}
          {secoesStatus.map((sec) => (
            <section key={sec.titulo}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Por status {temAmbos && <span className="text-primary">· {sec.titulo}</span>}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {sec.itens.map((it) => (
                  <Badge key={it.label} variant={it.variant} className="gap-1 px-2.5 py-1">
                    {it.label}
                    <span className="font-bold">{it.n}</span>
                  </Badge>
                ))}
              </div>
            </section>
          ))}

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
              {isGestorNivel(user.role) ? "Todos os leads de ontem" : "Seus leads de ontem"}
            </h3>
            {vendasVisiveis.length > 0 && (
              <>
                {temAmbos && <p className="mb-1 text-xs font-semibold text-primary">Vendas</p>}
                <ul className="space-y-2">
                  {vendasVisiveis.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 rounded-lg border border-border/70 bg-background px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{i.nome}</p>
                        <p className="text-xs text-muted-foreground">{i.origem}</p>
                      </div>
                      <Badge variant={TEMP_VARIANT[i.temperatura]}>{TEMP_LABEL[i.temperatura]}</Badge>
                      <StatusBadge item={i} />
                    </li>
                  ))}
                </ul>
              </>
            )}
            {locacaoVisiveis.length > 0 && (
              <>
                {temAmbos && <p className="mb-1 text-xs font-semibold text-primary">Locação</p>}
                <ul className="space-y-2">
                  {locacaoVisiveis.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 rounded-lg border border-border/70 bg-background px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{i.nome}</p>
                        <p className="text-xs text-muted-foreground">{i.origem}</p>
                      </div>
                      <Badge variant={TEMP_VARIANT[i.temperatura]}>{TEMP_LABEL[i.temperatura]}</Badge>
                      <StatusBadge item={i} />
                    </li>
                  ))}
                </ul>
              </>
            )}
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
