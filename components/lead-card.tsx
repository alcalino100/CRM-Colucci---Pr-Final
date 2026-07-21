"use client"

import { useState } from "react"
import Link from "next/link"
import { Camera, Users, Megaphone, Circle, Phone, Clock, Building, MoreVertical, Pencil, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/primitives"
import { useLeads } from "@/lib/leads-store"
import { ORIGEM_VARIANT, TEMP_LABEL, TEMP_VARIANT, brl, fmtDate, refPrincipal } from "@/lib/labels"
import { type Lead, type Origem } from "@/lib/mock-data"

const ORIGEM_ICON: Record<Origem, any> = {
  Instagram: Camera,
  Indicação: Users,
  "Tráfego Pago": Megaphone,
  Outro: Circle,
}

export function LeadCard({
  lead,
  showCorretor = false,
  canManage = false,
  onEdit,
  onDelete,
}: {
  lead: Lead
  showCorretor?: boolean
  canManage?: boolean
  onEdit?: (lead: Lead) => void
  onDelete?: (lead: Lead) => void
}) {
  const { userName } = useLeads()
  const OrigemIcon = ORIGEM_ICON[lead.origem]
  const initials = userName(lead.corretorId).split(" ").map((n) => n[0]).slice(0, 2).join("")
  const [menu, setMenu] = useState(false)
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/painel-corretor/${lead.id}`} className="font-display text-sm font-semibold leading-tight text-foreground hover:text-primary">
          {lead.nome}
        </Link>
        <div className="flex shrink-0 items-center gap-1.5">
          {showCorretor && (
            <span title={userName(lead.corretorId)} className="flex size-6 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground">
              {initials}
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
                  <div className="absolute right-0 top-8 z-20 w-32 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg" onPointerDown={stop}>
                    <button
                      type="button"
                      onClick={(e) => { stop(e); setMenu(false); onEdit?.(lead) }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <Pencil className="size-3.5" /> Editar
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { stop(e); setMenu(false); onDelete?.(lead) }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
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
        {refPrincipal(lead) && (
          <span className="flex items-center gap-1.5"><Building className="size-3.5" />{refPrincipal(lead)}</span>
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
        <p className="mt-2 font-display text-sm font-bold text-primary">{brl(lead.valorNegociacao)}</p>
      )}
      <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
        <Clock className="size-3" />
        Atualizado em {fmtDate(lead.atualizadoEm)}
      </div>
    </div>
  )
}
