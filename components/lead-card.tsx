"use client"

import { useState } from "react"
import { AlertTriangle, AlertCircle, Camera, Users, Megaphone, Store, Circle, Phone, Clock, MessageSquare, MessageCircle, MoreVertical, Pencil, Trash2, UserCheck, Send, Archive, ArchiveRestore, Plus } from "lucide-react"
import { Badge } from "@/components/ui/primitives"
import { useLeads } from "@/lib/leads-store"
import { usePresenca } from "@/lib/presence"
import { OnlineDot } from "@/components/online-dot"
import { ORIGEM_VARIANT, TEMP_LABEL, TEMP_VARIANT, brl, fmtDate } from "@/lib/labels"
import { type Lead, type Origem } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import { tagColor } from "@/lib/ai/tags-catalog"

const ORIGEM_ICON: Record<Origem, any> = {
  Instagram: Camera,
  Indicação: Users,
  "Tráfego Pago": Megaphone,
  WhatsApp: MessageCircle,
  Marketplace: Store,
  Outro: Circle,
}

export function LeadCard({
  lead,
  showCorretor = false,
  canManage = false,
  podeExcluir = false,
  isGestor = false,
  overdue = false,
  onOpen,
  onEdit,
  onDelete,
  onAssumir,
  onEnviarMeta,
  onArquivar,
  onDesarquivar,
  tagColorMap = {},
}: {
  lead: Lead
  showCorretor?: boolean
  canManage?: boolean
  podeExcluir?: boolean
  isGestor?: boolean
  overdue?: boolean
  tagColorMap?: Record<string, string>
  onOpen?: (lead: Lead) => void
  onEdit?: (lead: Lead) => void
  onDelete?: (lead: Lead) => void
  onAssumir?: (lead: Lead) => void
  onEnviarMeta?: (lead: Lead) => void
  onArquivar?: (lead: Lead) => void
  onDesarquivar?: (lead: Lead) => void
}) {
  const { userName, users, updateLead } = useLeads()
  const { online } = usePresenca()
  const OrigemIcon = ORIGEM_ICON[lead.origem]
  const corretor = users.find((u) => u.id === lead.corretorId)
  const initials = userName(lead.corretorId).split(" ").map((n) => n[0]).slice(0, 2).join("")
  const [menu, setMenu] = useState(false)
  const [showTagEditor, setShowTagEditor] = useState(false)
  const [newTag, setNewTag] = useState("")
  const [savingTag, setSavingTag] = useState(false)
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  const gestorNome = lead.gestorResponsavel ? userName(lead.gestorResponsavel) : null

  const normRefs = ((lead.referencias ?? []) as any[])
    .map((r) => (typeof r === "string" ? r : r?.ref))
    .filter((t): t is string => typeof t === "string" && Boolean(t.trim()))
  const currentTags = normRefs.length ? normRefs : lead.imovelRef ? [lead.imovelRef] : []

  async function addTag() {
    const tag = newTag.trim()
    if (!tag || currentTags.includes(tag)) return
    setSavingTag(true)
    try {
      const next = [...currentTags, tag]
      const r = await fetch(`/api/leads/${encodeURIComponent(lead.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tags: next }) })
      const j = await r.json()
      if (!j.ok) throw new Error(j.erro || "falha")
      // update local lead via store
      updateLead(lead.id, { referencias: next.map((t, i) => ({ ref: t, principal: i === 0 && !lead.referencias?.some(r => r.principal) })) })
      setNewTag("")
      setShowTagEditor(false)
    } catch { /* silent */ } finally { setSavingTag(false) }
  }

  async function removeTag(tag: string) {
    const next = currentTags.filter((t) => t !== tag)
    try {
      await fetch(`/api/leads/${encodeURIComponent(lead.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tags: next }) })
      updateLead(lead.id, { referencias: next.map((t, i) => ({ ref: t, principal: i === 0 && !lead.referencias?.some(r => r.principal) })) })
    } catch { /* silent */ }
  }
  const isReativado = Boolean(lead.reativadoEm && !lead.arquivadoEm)

  return (
    <div className={cn(
      "group relative rounded-xl border p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
      isReativado
        ? "border-2 border-amber-500 bg-card ring-2 ring-amber-400/40 shadow-md shadow-amber-500/10 dark:border-amber-400 dark:bg-card dark:ring-amber-400/30"
        : overdue
        ? "border-destructive/50 bg-card ring-1 ring-destructive/20"
        : "border-border bg-card hover:border-primary/30",
      lead.gestorResponsavel && !isReativado && "ring-1 ring-violet-400/40",
    )}>
      {isReativado && (
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1.5 rounded-t-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 shadow-sm" />
      )}
      {overdue && <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-destructive/10 px-2 py-1.5 text-xs font-semibold text-destructive"><AlertTriangle className="size-3.5" /> Follow-up pendente</div>}
      {isReativado && (
        <div className="mb-2.5 flex items-center justify-between gap-1.5 rounded-lg border border-amber-500/60 bg-amber-500/15 px-2.5 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-300 shadow-sm">
          <span className="flex items-center gap-1.5">
            <ArchiveRestore className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>REATIVADO • {fmtDate(lead.reativadoEm || "")}</span>
          </span>
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-extrabold text-amber-800 dark:text-amber-300 uppercase tracking-wide">
            {lead.reativacoesCount && lead.reativacoesCount > 1 ? `${lead.reativacoesCount}ª vez` : "Retomar contato"}
          </span>
        </div>
      )}
      {lead.arquivadoEm && (
        <div className="mb-2 flex items-center justify-between gap-1.5 rounded-lg border border-slate-300 bg-slate-100 px-2 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <span className="flex items-center gap-1.5">
            <Archive className="size-3.5 text-slate-500" />
            Arquivado {lead.dataReaparecimento ? `(retorna ${fmtDate(lead.dataReaparecimento)})` : ""}
          </span>
        </div>
      )}
      {lead.consentimentoContato === false && (
        <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-700 dark:text-red-300">
          <AlertCircle className="size-3.5" /> Confirmar consentimento antes de contatar
        </div>
      )}
      {gestorNome && (
        <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-violet-100 px-2 py-1.5 text-xs font-semibold text-violet-700">
          <UserCheck className="size-3.5" /> Assumido por {gestorNome}
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={() => onOpen?.(lead)} className="text-left font-display text-[0.95rem] font-semibold leading-tight text-foreground transition-colors hover:text-primary">
          {lead.nome}
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          {showCorretor && (
            <span className="relative">
              {corretor?.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={corretor.avatar} alt={corretor.nome} title={corretor.nome} className="size-6 rounded-full object-cover ring-1 ring-border" />
              ) : (
                <span title={userName(lead.corretorId)} className="flex size-6 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground">
                  {initials}
                </span>
              )}
              <OnlineDot online={!!online[lead.corretorId]} className="absolute -bottom-0.5 -right-0.5" />
            </span>
          )}
          {canManage && (
            <div className="relative">
              <button
                type="button"
                aria-label="Ações do lead"
                onPointerDown={stop}
                onClick={(e) => { stop(e); setMenu((m) => !m) }}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <MoreVertical className="size-4" />
              </button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-10" onPointerDown={stop} onClick={(e) => { stop(e); setMenu(false) }} />
                  <div className="absolute right-0 top-8 z-20 w-40 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg" onPointerDown={stop}>
                    <button
                      type="button"
                      onClick={(e) => { stop(e); setMenu(false); onEdit?.(lead) }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <Pencil className="size-3.5" /> Editar
                    </button>
                    {isGestor && (
                      <button
                        type="button"
                        onClick={(e) => { stop(e); setMenu(false); onAssumir?.(lead) }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        <UserCheck className="size-3.5" />
                        {lead.gestorResponsavel ? "Desassumir" : "Assumir"}
                      </button>
                    )}
                    {isGestor && lead.status === "fechado" && !lead.arquivadoEm && (
                      <button
                        type="button"
                        onClick={(e) => { stop(e); setMenu(false); onEnviarMeta?.(lead) }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        <Send className="size-3.5" /> Enviar ao Meta
                      </button>
                    )}
                    {!lead.arquivadoEm && (
                      <button
                        type="button"
                        onClick={(e) => { stop(e); setMenu(false); onArquivar?.(lead) }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        <Archive className="size-3.5" /> Arquivar
                      </button>
                    )}
                    {lead.arquivadoEm && (
                      <button
                        type="button"
                        onClick={(e) => { stop(e); setMenu(false); onDesarquivar?.(lead) }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        <ArchiveRestore className="size-3.5" /> Desarquivar
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!podeExcluir}
                      title={podeExcluir ? undefined : "Apenas gestores podem excluir leads"}
                      onClick={(e) => { stop(e); if (!podeExcluir) return; setMenu(false); onDelete?.(lead) }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent"
                    >
                      <Trash2 className="size-3.5" /> Excluir
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <div className={cn(
        "mt-2 flex flex-col gap-1.5 text-xs",
        isReativado ? "text-foreground font-medium dark:text-stone-100" : "text-muted-foreground"
      )}>
        {lead.telefone && (
          <span className="flex items-center gap-1.5">
            <Phone className={cn("size-3.5 shrink-0", isReativado ? "text-amber-600 dark:text-amber-400" : "")} />
            <span className={cn(isReativado ? "font-semibold text-foreground dark:text-amber-200" : "")}>{lead.telefone}</span>
          </span>
        )}
        {lead.observacoes?.trim() ? (
          <span className="flex items-start gap-1.5">
            <MessageSquare className={cn("mt-0.5 size-3.5 shrink-0", isReativado ? "text-amber-600 dark:text-amber-400" : "")} />
            <span className={cn("line-clamp-2", isReativado ? "text-foreground/90 dark:text-stone-200" : "")}>{lead.observacoes.trim()}</span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5 italic opacity-70"><MessageSquare className="size-3.5" />Sem observação</span>
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge variant={TEMP_VARIANT[lead.temperatura]}>{TEMP_LABEL[lead.temperatura]}</Badge>
        {currentTags.map((r) => {
          const cor = tagColorMap[r] ?? tagColor(r)
          return (
            <span key={r} className="group/tag inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ borderWidth: 1, borderStyle: "solid", borderColor: cor, backgroundColor: `${cor}1a`, color: cor }}>
              {r}
              <button type="button" onClick={(e) => { stop(e); removeTag(r) }} className="hidden rounded-full p-0.5 text-destructive hover:bg-destructive/10 group-hover/tag:inline-flex">
                <span className="sr-only">Remover</span>×
              </button>
            </span>
          )
        })}
        {canManage && (
          <button type="button" onClick={(e) => { stop(e); setShowTagEditor((s) => !s) }} className="inline-flex items-center justify-center rounded-full border border-dashed border-border p-0.5 text-muted-foreground hover:border-primary/50 hover:text-primary">
            <Plus className="size-3" />
          </button>
        )}
        {showTagEditor && (
          <div className="flex w-full gap-1" onClick={stop}>
            <input
              autoFocus
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addTag(); if (e.key === "Escape") setShowTagEditor(false) }}
              placeholder="Nova tag..."
              className="h-6 flex-1 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              disabled={savingTag}
            />
            <button type="button" onClick={addTag} disabled={savingTag || !newTag.trim()} className="h-6 rounded bg-primary px-2 text-[10px] font-medium text-primary-foreground disabled:opacity-50">OK</button>
          </div>
        )}
        <Badge variant={ORIGEM_VARIANT[lead.origem]} className="gap-1">
          <OrigemIcon className="size-3" />
          {lead.origem}
        </Badge>
      </div>
      {lead.valorNegociacao != null && (
        <p className="mt-2.5 font-display text-base font-bold text-primary">{brl(lead.valorNegociacao)}</p>
      )}
      <div className="mt-2.5 flex items-center gap-1 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
        <Clock className="size-3" />
        Atualizado em {fmtDate(lead.atualizadoEm)}
      </div>
    </div>
  )
}
