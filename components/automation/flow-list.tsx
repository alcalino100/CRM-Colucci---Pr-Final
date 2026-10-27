// =============================================================================
// automation/flow-list.tsx — Tabela/listagem de fluxos com filtros e ações.
// =============================================================================

"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Archive,
  ArchiveRestore,
  ArrowUpRight,
  Copy,
  Pause,
  Play,
  Plus,
  Search,
  Trash2,
  Workflow,
  Sparkles,
} from "lucide-react"
import { useFlowStore } from "@/lib/flow/flow-store"
import { FLOW_STATUS_LABEL, FLOW_TIPOS_LABEL } from "@/lib/flow/palette"
import type { FlowStatus, FlowTipo } from "@/lib/flow/types"
import { Dialog, useToast, Skeleton, Badge, Card, CardContent } from "@/components/ui/primitives"
import { cn } from "@/lib/utils"

const FILTROS_TIPO: (FlowTipo | "todos")[] = ["todos", "Captura", "Qualificacao", "Venda", "Nutricao", "Reengajamento"]

export default function FlowList() {
  const router = useRouter()
  const flows = useFlowStore((s) => s.flows)
  const createFlow = useFlowStore((s) => s.createFlow)
  const toast = useToast()

  const [busca, setBusca] = useState("")
  const [tipo, setTipo] = useState<FlowTipo | "todos">("todos")
  const [excluirId, setExcluirId] = useState<string | null>(null)

  const lista = useMemo(() => {
    return Object.values(flows)
      .filter((f) => !f.arquivado)
      .filter((f) => tipo === "todos" || f.tipo === tipo)
      .filter((f) => !busca.trim() || f.nome.toLowerCase().includes(busca.trim().toLowerCase()))
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  }, [flows, tipo, busca])

  const arquivados = useMemo(() => Object.values(flows).filter((f) => f.arquivado), [flows])

  const novo = (t: FlowTipo = "Captura") => {
    const id = createFlow(t)
    toast("Fluxo criado — configure o nome e os blocos")
    router.push(`/automacoes/fluxos?fluxo=${id}`)
  }

  const duplicar = (id: string) => {
    const novoId = useFlowStore.getState().duplicateFlow(id)
    toast("Fluxo duplicado com sucesso")
    router.push(`/automacoes/fluxos?fluxo=${novoId}`)
  }

  const alternarAtivo = (id: string, status: FlowStatus) => {
    useFlowStore.getState().setStatus(id, status === "ativo" ? "inativo" : "ativo")
    toast(status === "ativo" ? "Fluxo desativado" : "Fluxo ativado")
  }

  const arquivar = (id: string, v: boolean) => {
    useFlowStore.getState().archiveFlow(id, v)
    toast(v ? "Fluxo arquivado" : "Fluxo restaurado")
  }

  const excluir = () => {
    if (excluirId) {
      useFlowStore.getState().deleteFlow(excluirId)
      toast("Fluxo excluído permanentemente", "error")
    }
    setExcluirId(null)
  }

  return (
    <div className="space-y-4">
      {/* Filtros e Busca */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar fluxo por nome..."
            className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTROS_TIPO.map((t) => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                tipo === t
                  ? "border-primary bg-primary text-primary-foreground font-semibold"
                  : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {t === "todos" ? "Todos os Tipos" : FLOW_TIPOS_LABEL[t]}
            </button>
          ))}
        </div>
        <button
          onClick={() => novo()}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 shadow-xs"
        >
          <Plus size={14} /> Novo Fluxo
        </button>
      </div>

      {/* Tabela de Fluxos */}
      {lista.length === 0 ? (
        <EmptyState temFiltro={busca.trim() !== "" || tipo !== "todos"} onNovo={() => novo()} />
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border/80 text-left text-xs uppercase tracking-wide text-muted-foreground bg-muted/20">
                <tr>
                  <th className="px-4 py-3 font-medium">Nome do Fluxo</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Sessões Ativas</th>
                  <th className="px-4 py-3 text-right font-medium">Conversão</th>
                  <th className="px-4 py-3 font-medium">Última Edição</th>
                  <th className="px-4 py-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((f) => (
                  <tr key={f.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <button onClick={() => router.push(`/automacoes/fluxos?fluxo=${f.id}`)} className="group flex items-center gap-2.5 text-left">
                        <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg border", slugBg(f.status))}>
                          <Workflow size={14} />
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1 font-semibold text-foreground group-hover:text-primary transition-colors">
                            {f.nome} <ArrowUpRight size={13} className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                          </span>
                          <span className="block text-[11px] text-muted-foreground">{f.nodes.length} blocos configurados{f.arquivado ? " · arquivado" : ""}</span>
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md border border-border/70 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground">{FLOW_TIPOS_LABEL[f.tipo] ?? f.tipo}</span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={f.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-foreground">{f.sessoesAtivas.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-mono text-xs tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">{f.taxaConversao}%</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatData(f.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn title="Editar no Canvas" onClick={() => router.push(`/automacoes/fluxos?fluxo=${f.id}`)}><ArrowUpRight size={14} /></IconBtn>
                        <IconBtn title="Duplicar" onClick={() => duplicar(f.id)}><Copy size={14} /></IconBtn>
                        <IconBtn
                          title={f.status === "ativo" ? "Desativar" : "Ativar"}
                          onClick={() => alternarAtivo(f.id, f.status)}
                          disabled={f.status === "rascunho"}
                        >
                          {f.status === "ativo" ? <Pause size={14} /> : <Play size={14} />}
                        </IconBtn>
                        <IconBtn title="Arquivar" onClick={() => arquivar(f.id, true)}><Archive size={14} /></IconBtn>
                        <IconBtn danger title="Excluir" onClick={() => setExcluirId(f.id)}><Trash2 size={14} /></IconBtn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Versão Mobile */}
          <div className="divide-y divide-border/60 md:hidden">
            {lista.map((f) => (
              <div key={f.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <button onClick={() => router.push(`/automacoes/fluxos?fluxo=${f.id}`)} className="flex min-w-0 items-center gap-2.5 text-left">
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg border", slugBg(f.status))}><Workflow size={14} /></span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-foreground text-sm">{f.nome}</span>
                      <span className="text-[11px] text-muted-foreground">{FLOW_TIPOS_LABEL[f.tipo]} · {f.nodes.length} blocos</span>
                    </span>
                  </button>
                  <StatusBadge status={f.status} />
                </div>
                <div className="flex items-center justify-between border-t border-border/60 pt-2">
                  <span className="text-[11px] text-muted-foreground">Atualizado: {formatData(f.updatedAt)}</span>
                  <div className="flex gap-1">
                    <IconBtn title="Duplicar" onClick={() => duplicar(f.id)}><Copy size={14} /></IconBtn>
                    <IconBtn title="Ativar/Desativar" onClick={() => alternarAtivo(f.id, f.status)}>
                      {f.status === "ativo" ? <Pause size={14} /> : <Play size={14} />}
                    </IconBtn>
                    <IconBtn title="Arquivar" onClick={() => arquivar(f.id, true)}><Archive size={14} /></IconBtn>
                    <IconBtn danger title="Excluir" onClick={() => setExcluirId(f.id)}><Trash2 size={14} /></IconBtn>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Arquivados */}
      {arquivados.length > 0 && (
        <div className="space-y-2">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Fluxos Arquivados ({arquivados.length})</p>
          <Card className="divide-y divide-border/60">
            {arquivados.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <ArchiveRestore size={14} className="shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm text-muted-foreground">{f.nome}</span>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => router.push(`/automacoes/fluxos?fluxo=${f.id}`)} className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                    Abrir
                  </button>
                  <button onClick={() => arquivar(f.id, false)} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-muted">
                    <ArchiveRestore size={12} /> Restaurar
                  </button>
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* Dialog Excluir */}
      <Dialog open={!!excluirId} onClose={() => setExcluirId(null)} title="Excluir fluxo?">
        <p className="mb-4 text-xs text-muted-foreground">
          Esta ação é permanente e removerá os blocos e conexões deste fluxo. Os fluxos arquivados são a forma recomendada de pausar e guardar um fluxo.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={() => setExcluirId(null)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
            Cancelar
          </button>
          <button onClick={excluir} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
            Excluir definitivamente
          </button>
        </div>
      </Dialog>
    </div>
  )
}

function EmptyState({ temFiltro, onNovo }: { temFiltro: boolean; onNovo: () => void }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <div className="grid size-12 place-items-center rounded-2xl border border-border bg-muted/40">
          <Workflow size={22} className="text-muted-foreground" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{temFiltro ? "Nenhum fluxo encontrado" : "Nenhum fluxo criado ainda"}</h3>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            {temFiltro
              ? "Ajuste os filtros ou o termo de busca para localizar outros fluxos."
              : "Crie sua primeira jornada visual com blocos de gatilhos e mensagens automáticas."}
          </p>
        </div>
        <button onClick={onNovo} className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 shadow-xs">
          <Plus size={14} /> Criar Primeiro Fluxo
        </button>
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status }: { status: FlowStatus }) {
  if (status === "ativo") {
    return <Badge variant="green">Ativo</Badge>
  }
  if (status === "rascunho") {
    return <Badge variant="amber">Rascunho</Badge>
  }
  return <Badge variant="gray">Inativo</Badge>
}

function slugBg(status: FlowStatus): string {
  if (status === "ativo") return "border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
  if (status === "rascunho") return "border-amber-500/40 bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
  return "border-border bg-muted/40 text-muted-foreground"
}

function IconBtn({ children, title, onClick, disabled, danger }: { children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "grid size-7 place-items-center rounded-lg border border-transparent text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30",
        danger && "hover:border-red-500/40 hover:text-red-600 dark:hover:text-red-400"
      )}
    >
      {children}
    </button>
  )
}

function formatData(t: number): string {
  if (!t) return "—"
  return new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" })
}

export function FlowListSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="ml-auto h-9 w-28" />
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}
