"use client"

import Link from "next/link"
import {
  Archive,
  ArchiveRestore,
  ExternalLink,
  Mail,
  Phone,
  ShieldAlert,
  Users,
} from "lucide-react"
import { Badge, Card } from "@/components/ui/primitives"
import { Button } from "@/components/ui/button"
import {
  MOTIVO_ARQUIVAMENTO_LABEL,
  type Lead,
  type MotivoArquivamento,
} from "@/lib/mock-data"
import { STATUS_LABEL } from "@/lib/labels"
import { fmtDataBr } from "@/lib/arquivados-utils"
import { cn } from "@/lib/utils"
import { ResponsiveTable, type ResponsiveColumn } from "@/components/ui/responsive-table"

interface ArquivadosTableProps {
  leads: Lead[]
  selectedIds: Set<string>
  allSelected: boolean
  hasNoArquivadosBase: boolean
  hoje: string
  userName: (id: string) => string
  onToggleSelectAll: () => void
  onToggleSelectLead: (id: string) => void
  onDesarquivarIndividual: (lead: Lead) => void
}

export function ArquivadosTable({
  leads,
  selectedIds,
  allSelected,
  hasNoArquivadosBase,
  hoje,
  userName,
  onToggleSelectAll,
  onToggleSelectLead,
  onDesarquivarIndividual,
}: ArquivadosTableProps) {
  const columns: ResponsiveColumn<Lead>[] = [
    {
      key: "select",
      priority: true,
      header: (
        <input
          type="checkbox"
          className="size-4 rounded border-border"
          checked={allSelected}
          onChange={onToggleSelectAll}
          aria-label="Selecionar todos os leads arquivados visíveis"
        />
      ),
      render: (lead) => (
        <input
          type="checkbox"
          className="size-4 rounded border-border"
          checked={selectedIds.has(lead.id)}
          onChange={() => onToggleSelectLead(lead.id)}
          aria-label={`Selecionar lead ${lead.nome}`}
        />
      ),
      className: "w-10 text-center",
      align: "center",
    },
    {
      key: "nome",
      priority: true,
      header: "Lead",
      render: (lead) => {
        const isReincidente = (lead.reativacoesCount || 0) > 0
        return (
          <div className="flex flex-col gap-1">
            <Link
              href={`/painel-corretor/${lead.id}`}
              className="font-semibold text-foreground hover:underline flex items-center gap-1.5"
            >
              <span>{lead.nome}</span>
              <ExternalLink className="size-3 text-muted-foreground" />
            </Link>
            <div className="flex flex-wrap items-center gap-1">
              <Badge variant="gray" className="text-[10px]">
                {lead.origem}
              </Badge>
              {lead.statusAnterior && (
                <Badge variant="slate" className="text-[10px]">
                  Volta como: {(STATUS_LABEL as Record<string, string>)[lead.statusAnterior] || lead.statusAnterior}
                </Badge>
              )}
              {isReincidente && (
                <Badge variant="amber" className="text-[10px] font-bold">
                  {lead.reativacoesCount}x reativado
                </Badge>
              )}
            </div>
          </div>
        )
      },
    },
    {
      key: "contato",
      mobileLabel: "Contato",
      header: "Contato",
      render: (lead) => (
        <div className="flex flex-col gap-1 text-xs">
          {lead.telefone && (
            <span className="flex items-center gap-1 font-mono text-foreground">
              <Phone className="size-3 text-muted-foreground" />
              {lead.telefone}
            </span>
          )}
          {lead.email && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Mail className="size-3" />
              {lead.email}
            </span>
          )}
          {lead.consentimentoContato === false && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-500/15 rounded px-1.5 py-0.5 border border-amber-500/30 dark:text-amber-300 dark:bg-amber-950/40">
              <ShieldAlert className="size-2.5" />
              Confirmar consentimento
            </span>
          )}
        </div>
      ),
    },
    {
      key: "responsavel",
      mobileLabel: "Responsável",
      header: "Responsável",
      render: (lead) => (
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <Users className="size-3.5 text-muted-foreground" />
          <span>{userName(lead.corretorId) || lead.corretorId || "Não atribuído"}</span>
        </div>
      ),
    },
    {
      key: "motivo",
      mobileLabel: "Motivo & Observação",
      header: "Motivo & Observação",
      className: "max-w-xs",
      render: (lead) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground text-xs">
            {MOTIVO_ARQUIVAMENTO_LABEL[lead.motivoArquivamento as MotivoArquivamento] ||
              lead.motivoArquivamento ||
              "Outro"}
          </span>
          {(lead.observacaoArquivamento || lead.observacoes) && (
            <p
              className="text-xs text-muted-foreground truncate"
              title={lead.observacaoArquivamento || lead.observacoes}
            >
              {lead.observacaoArquivamento || lead.observacoes}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "arquivadoEm",
      mobileLabel: "Arquivado em",
      header: "Arquivado Em",
      className: "text-xs text-muted-foreground",
      render: (lead) => fmtDataBr(lead.arquivadoEm),
    },
    {
      key: "reaparecimento",
      mobileLabel: "Data de Retorno",
      header: "Reaparecimento",
      render: (lead) => {
        const isVencido = Boolean(lead.dataReaparecimento && lead.dataReaparecimento <= hoje)
        return (
          <div className="flex flex-col gap-0.5">
            <span
              className={cn(
                "text-xs font-semibold",
                isVencido ? "text-destructive font-bold" : "text-amber-600 dark:text-amber-400"
              )}
            >
              {fmtDataBr(lead.dataReaparecimento)}
            </span>
            {isVencido && (
              <span className="text-[10px] font-bold text-red-600">
                Vencido (reativar)
              </span>
            )}
          </div>
        )
      },
    },
    {
      key: "acoes",
      mobileLabel: "Ações",
      header: "Ações",
      align: "right",
      render: (lead) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:hover:bg-emerald-950/40"
            title="Desarquivar agora"
            onClick={() => onDesarquivarIndividual(lead)}
          >
            <ArchiveRestore className="size-4" />
            <span className="sr-only">Desarquivar</span>
          </Button>

          <Link href={`/painel-corretor/${lead.id}`}>
            <Button variant="ghost" size="sm" className="h-8 px-2" title="Ver ficha completa">
              <ExternalLink className="size-4" />
              <span className="sr-only">Ver ficha</span>
            </Button>
          </Link>
        </div>
      ),
    },
  ]

  return (
    <Card className="overflow-hidden">
      <ResponsiveTable
        data={leads}
        columns={columns}
        keyExtractor={(l) => l.id}
        rowClassName={(l) => (selectedIds.has(l.id) ? "bg-primary/5" : "")}
        emptyMessage={
          <div className="flex flex-col items-center justify-center gap-2 py-8">
            <Archive className="size-8 text-muted-foreground/60" />
            <p className="font-medium text-foreground">Nenhum lead arquivado encontrado</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              {hasNoArquivadosBase
                ? "Quando você arquivar leads com data de reaparecimento no funil, eles aparecerão aqui."
                : "Tente ajustar os filtros ou a busca textual."}
            </p>
          </div>
        }
      />
    </Card>
  )
}
