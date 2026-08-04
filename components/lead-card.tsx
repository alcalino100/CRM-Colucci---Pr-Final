"use client"

import { useState } from "react"
import { AlertTriangle, Camera, Users, Megaphone, Circle, Phone, Clock, MessageSquare, MessageCircle, MoreVertical, Pencil, Trash2, UserCheck, Send, Archive } from "lucide-react"
import { Badge } from "@/components/ui/primitives"
import { useLeads } from "@/lib/leads-store"
import { ORIGEM_VARIANT, TEMP_LABEL, TEMP_VARIANT, brl, fmtDate } from "@/lib/labels"
import { type Lead, type Origem } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

const ORIGEM_ICON: Record<Origem, any> = {
  Instagram: Camera,
  Indicação: Users,
  "Tráfego Pago": Megaphone,
  WhatsApp: MessageCircle,
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
}: {
  lead: Lead
  showCorretor?: boolean
  canManage?: boolean
  podeExcluir?: boolean
  isGestor?: boolean
  overdue?: boolean
  onOpen?: (lead: Lead) => void
  onEdit?: (lead: Lead) => void
  onDelete?: (lead: Lead) => void
  onAssumir?: (lead: Lead) => void
  onEnviarMeta?: (lead: Lead) => void
  onArquivar?: (lead: Lead) => void
}) {
  const { userName, users } = useLeads()
  const OrigemIcon = ORIGEM_ICON[lead.origem]
  const corretor = users.find((u) => u.id === lead.corretorId)
  const initials = userName(lead.corretorId).split(" ").map((n) => n[0]).slice(0, 2).join("")
  const [menu, setMenu] = useState(false)
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  const gestorNome = lead.gestorResponsavel ? userName(lead.gestorResponsavel) : null
  return (
    <div className={cn(
      "group relative rounded-xl border bg-card p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
      overdue ? "border-destructive/50 ring-1 ring-destructive/20" : "border-border hover:border-primary/30",
      lead.gestorResponsavel && "ring-1 ring-violet-400/40",
    )}>
      {overdue && <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-destructive/10 px-2 py-1.5 text-xs font-semibold text-destructive"><AlertTriangle className="size-3.5" /> Follow-up pendente</div>}
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
            corretor?.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={corretor.avatar} alt={corretor.nome} title={corretor.nome} className="size-6 rounded-full object-cover ring-1 ring-border" />
            ) : (
              <span title={userName(lead.corretorId)} className="flex size-6 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground">
                {initials}
              </span>
            )
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
                    {isGestor && lead.status === "fechado" && !lead.arquivadoEm && (
                      <button
                        type="button"
                        onClick={(e) => { stop(e); setMenu(false); onArquivar?.(lead) }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        <Archive className="size-3.5" /> Arquivar
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
      <div className="mt-2 flex flex-col gap-1.5 text-xs text-muted-foreground">
        {lead.telefone && (
          <span className="flex items-center gap-1.5"><Phone className="size-3.5" />{lead.telefone}</span>
        )}
        {lead.observacoes?.trim() ? (
          <span className="flex items-start gap-1.5"><MessageSquare className="mt-0.5 size-3.5 shrink-0" /><span className="line-clamp-2">{lead.observacoes.trim()}</span></span>
        ) : (
          <span className="flex items-center gap-1.5 italic opacity-70"><MessageSquare className="size-3.5" />Sem observação</span>
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge variant={TEMP_VARIANT[lead.temperatura]}>{TEMP_LABEL[lead.temperatura]}</Badge>
        {(lead.referencias?.length ? lead.referencias.map((r) => r.ref) : lead.imovelRef ? [lead.imovelRef] : []).map((r) => (
          <Badge key={r} variant="gray">{r}</Badge>
        ))}
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
