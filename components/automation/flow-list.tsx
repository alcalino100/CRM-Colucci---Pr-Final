// =============================================================================
// automation/flow-list.tsx — Tabela/listagem de fluxos com filtros e ações.
// =============================================================================

"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Archive, ArchiveRestore, ArrowUpRight, Copy, Pause, Play, Plus, Search, Trash2, Workflow,
} from "lucide-react"
import { useFlowStore } from "@/lib/flow/flow-store"
import { FLOW_STATUS_LABEL, FLOW_TIPOS_LABEL } from "@/lib/flow/palette"
import type { FlowStatus, FlowTipo } from "@/lib/flow/types"
import { Dialog, useToast, Skeleton } from "@/components/ui/primitives"
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
    toast("Fluxo duplicado")
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
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar fluxo..."
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-9 pr-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-cyan-600 focus:outline-none"
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
                  ? "border-cyan-600 bg-cyan-500/15 text-cyan-300"
                  : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
              )}
            >
              {t === "todos" ? "Todos" : FLOW_TIPOS_LABEL[t]}
            </button>
          ))}
        </div>
        <button
          onClick={() => novo()}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-2 text-sm font-semibold text-zinc-950 hover:bg-cyan-400"
        >
          <Plus size={15} /> Novo Fluxo
        </button>
      </div>

      {/* Tabela */}
      {lista.length === 0 ? (
        <EmptyState temFiltro={busca.trim() !== "" || tipo !== "todos"} onNovo={() => novo()} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Fluxo</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Sessões ativas</th>
                  <th className="px-4 py-3 text-right font-medium">Conversão</th>
                  <th className="px-4 py-3 font-medium">Última edição</th>
                  <th className="px-4 py-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((f) => (
                  <tr key={f.id} className="border-b border-zinc-800/60 transition-colors last:border-0 hover:bg-zinc-900/50">
                    <td className="px-4 py-3">
                      <button onClick={() => router.push(`/automacoes/fluxos?fluxo=${f.id}`)} className="group flex items-center gap-2.5 text-left">
                        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg border", slugBg(f.status))}>
                          <Workflow size={14} />
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1 font-medium text-zinc-100 group-hover:text-cyan-300">
                            {f.nome} <ArrowUpRight size={13} className="text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100" />
                          </span>
                          <span className="block text-[11px] text-zinc-500">{f.nodes.length} blocos{f.arquivado ? " · arquivado" : ""}</span>
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300">{FLOW_TIPOS_LABEL[f.tipo] ?? f.tipo}</span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={f.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[13px] text-zinc-300">{f.sessoesAtivas.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-mono text-[13px] text-zinc-300">{f.taxaConversao}%</span>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-zinc-500">{formatData(f.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn title="Editar" onClick={() => router.push(`/automacoes/fluxos?fluxo=${f.id}`)}><ArrowUpRight size={14} /></IconBtn>
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

          {/* Cards mobile */}
          <div className="divide-y divide-zinc-800 md:hidden">
            {lista.map((f) => (
              <div key={f.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <button onClick={() => router.push(`/automacoes/fluxos?fluxo=${f.id}`)} className="flex min-w-0 items-center gap-2 text-left">
                    <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg border", slugBg(f.status))}><Workflow size={14} /></span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-zinc-100">{f.nome}</span>
                      <span className="text-[11px] text-zinc-500">{FLOW_TIPOS_LABEL[f.tipo]} · {f.nodes.length} blocos</span>
                    </span>
                  </button>
                  <StatusBadge status={f.status} />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] text-zinc-500">Edição: {formatData(f.updatedAt)}</span>
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
        </div>
      )}

      {/* Arquivados */}
      {arquivados.length > 0 && (
        <div className="space-y-2">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">Arquivados ({arquivados.length})</p>
          <div className="overflow-hidden rounded-xl border border-zinc-800/70">
            {arquivados.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-2 border-b border-zinc-800/60 px-4 py-2.5 last:border-0">
                <div className="flex min-w-0 items-center gap-2.5">
                  <ArchiveRestore size={14} className="shrink-0 text-zinc-500" />
                  <span className="truncate text-sm text-zinc-400">{f.nome}</span>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => router.push(`/automacoes/fluxos?fluxo=${f.id}`)} className="rounded-md px-2 py-1 text-[11px] font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
                    Abrir
                  </button>
                  <button onClick={() => arquivar(f.id, false)} className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-cyan-400 hover:bg-zinc-800">
                    <ArchiveRestore size={12} /> Restaurar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={!!excluirId} onClose={() => setExcluirId(null)} title="Excluir fluxo?">
        <p className="mb-4 text-sm text-zinc-400">
          Esta ação é permanente e não pode ser desfeita. Os fluxos arquivados são a forma segura de guardar um fluxo.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={() => setExcluirId(null)} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800">
            Cancelar
          </button>
          <button onClick={excluir} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500">
            Excluir definitivamente
          </button>
        </div>
      </Dialog>
    </div>
  )
}

function EmptyState({ temFiltro, onNovo }: { temFiltro: boolean; onNovo: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 px-6 py-20 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl border border-zinc-800 bg-zinc-900">
        <Workflow size={26} className="text-zinc-600" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-zinc-200">{temFiltro ? "Nenhum fluxo encontrado" : "Nenhum fluxo criado ainda"}</h3>
        <p className="mx-auto mt-1 max-w-sm text-xs text-zinc-500">
          {temFiltro
            ? "Ajuste os filtros ou a busca para encontrar fluxos."
            : "Crie seu primeiro fluxo: escolha um gatilho (ex.: novo lead no CRM) e monte a jornada no editor visual."}
        </p>
      </div>
      <button onClick={onNovo} className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-2 text-sm font-semibold text-zinc-950 hover:bg-cyan-400">
        <Plus size={15} /> Criar Fluxo
      </button>
    </div>
  )
}

function StatusBadge({ status }: { status: FlowStatus }) {
  const map: Record<FlowStatus, [string, string]> = {
    ativo: ["bg-emerald-500/10 text-emerald-400", "∙"],
    inativo: ["bg-zinc-700/10 text-zinc-400", "◦"],
    rascunho: ["bg-amber-500/10 text-amber-400", "✎"],
  }
  const [cls, dot] = map[status]
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-current/20 px-2.5 py-1 text-[11px] font-medium", cls)}>
      <span className="size-1.5 rounded-full bg-current" />
      {FLOW_STATUS_LABEL[status]}
    </span>
  )
}

function slugBg(status: FlowStatus): string {
  if (status === "ativo") return "border-emerald-700/40 bg-emerald-500/10 text-emerald-400"
  if (status === "rascunho") return "border-amber-700/40 bg-amber-500/10 text-amber-400"
  return "border-zinc-700 bg-zinc-800/40 text-zinc-400"
}

function IconBtn({ children, title, onClick, disabled, danger }: { children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-lg border border-transparent text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200 disabled:pointer-events-none disabled:opacity-30",
        danger && "hover:border-red-600/40 hover:text-red-400"
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
    <div className="space-y-2">
      <div className="flex gap-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="ml-auto h-9 w-28" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  )
}