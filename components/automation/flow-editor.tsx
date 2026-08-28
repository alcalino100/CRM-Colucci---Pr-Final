// =============================================================================
// automation/flow-editor.tsx — Editor do fluxo: toolbar + biblioteca + canvas
// + painel de config + mini-preview.
// =============================================================================

"use client"

import "@xyflow/react/dist/style.css"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ReactFlowProvider } from "@xyflow/react"
import {
  AlertTriangle, ArrowLeft, Check, Copy, ListTree, Pause, Play, Rocket, Save, Workflow,
} from "lucide-react"
import NodeLibrary from "./node-library"
import NodeConfig from "./node-config"
import FlowCanvas from "./flow-canvas"
import { useFlowStore, validarFluxo } from "@/lib/flow/flow-store"
import { FLOW_STATUS_LABEL, FLOW_TIPOS_LABEL, NODE_ICONS, NODE_TYPES } from "@/lib/flow/palette"
import type { FlowDoc, FlowStatus } from "@/lib/flow/types"
import { useToast } from "@/components/ui/primitives"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/primitives"

const EDITOR_ID = "fluxo-editor-tudo"

export default function FlowEditor({ flowId }: { flowId: string }) {
  const router = useRouter()
  const flow = useFlowStore((s) => s.flows[flowId])
  const touch = useFlowStore((s) => s.touch)
  const setStatus = useFlowStore((s) => s.setStatus)
  const toast = useToast()

  const [tocando, setTocando] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [previewAberto, setPreviewAberto] = useState(false)

  const validacao = useMemo(() => (flow ? validarFluxo(flow) : null), [flow])
  const problemas = useMemo(() => {
    if (!validacao) return []
    const p: string[] = []
    if (!validacao.temInicio) p.push("falta o bloco Início")
    if (validacao.multiplosInicios) p.push("múltiplos blocos de início")
    if (validacao.orfaos.length) p.push(`${validacao.orfaos.length} bloco(s) sem entrada`)
    if (validacao.semSaida.length) p.push(`${validacao.semSaida.length} bloco(s) sem saída`)
    return p
  }, [validacao])

  if (!flow) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40">
        <Workflow size={40} className="text-zinc-700" />
        <p className="text-sm text-zinc-500">Fluxo não encontrado</p>
        <Link href="/automacoes/fluxos" className="rounded-lg border border-zinc-700 px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-800">
          Voltar para a lista
        </Link>
      </div>
    )
  }

  const salvar = () => {
    if (!tocando) {
      setTocando(true)
      touch(flow.id)
      setTimeout(() => setTocando(false), 1400)
    }
    toast("Rascunho salvo localmente")
  }

  const publicar = () => {
    if (problemas.length > 0) {
      toast(`Ajuste antes de publicar: ${problemas.join("; ")}`, "error")
      return
    }
    setStatus(flow.id, "ativo")
    toast("Fluxo publicado com sucesso")
  }

  const testar = () => {
    toast("Modo de teste disponível em breve", "error")
  }

  const alternarAtivo = () => {
    setStatus(flow.id, flow.status === "ativo" ? "inativo" : "ativo")
    toast(flow.status === "ativo" ? "Fluxo desativado" : "Fluxo ativado")
  }

  const duplicar = () => {
    const id = useFlowStore.getState().duplicateFlow(flow.id)
    router.push(`/automacoes/fluxos?fluxo=${id}`)
    toast("Fluxo duplicado")
  }

  const slugStatus = (s: FlowStatus) =>
    s === "ativo" ? "text-emerald-400 bg-emerald-500/10 border-emerald-700/40" : s === "rascunho" ? "text-amber-400 bg-amber-500/10 border-amber-700/40" : "text-zinc-400 bg-zinc-700/10 border-zinc-700/40"

  return (
    <div id={EDITOR_ID} className="flex h-[calc(100vh-12rem)] min-h-[540px] flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2.5">
        <Link
          href="/automacoes/fluxos"
          aria-label="Voltar para a lista"
          onClick={() => setSelectedNodeId(null)}
          className="grid h-8 w-8 place-items-center rounded-lg border border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <ArrowLeft size={15} />
        </Link>

        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "grid h-8 w-8 shrink-0 place-items-center rounded-lg border",
              slugStatus(flow.status)
            )}
            title={`Status: ${FLOW_STATUS_LABEL[flow.status]}`}
          >
            {flow.status === "ativo" ? <Pause size={13} /> : <Play size={13} />}
          </span>
          <div className="min-w-0">
            <EditableTitle value={flow.nome} onCommit={(nome) => useFlowStore.getState().renameFlow(flow.id, nome)} toast={toast} />
            <p className="truncate text-[10.5px] text-zinc-500">
              {FLOW_TIPOS_LABEL[flow.tipo] ?? flow.tipo} · {flow.nodes.length} blocos · atualizado {formatQuando(flow.updatedAt)}
            </p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button onClick={alternarAtivo} className="flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800" disabled={flow.status === "rascunho"}>
            {flow.status === "ativo" ? <Pause size={13} /> : <Play size={13} />}
            {flow.status === "ativo" ? "Desativar" : "Ativar"}
          </button>
          <button onClick={duplicar} className="flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800">
            <Copy size={13} /> Duplicar
          </button>
          <button onClick={testar} className="flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800">
            <Rocket size={13} /> Testar Fluxo
          </button>
          <button onClick={salvar} className="flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800">
            <Save size={13} className={tocando ? "text-cyan-400" : ""} /> Salvar Rascunho
          </button>
          <button onClick={publicar} className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-cyan-400">
            <Check size={13} /> Publicar
          </button>
        </div>
      </div>

      {/* Aviso < 1024px (desktop só) */}
      <div className="rounded-lg border border-red-800/40 bg-red-950/40 px-3 py-2 text-[11px] text-red-300 lg:hidden">
        O editor de fluxos é otimizado para telas maiores. Use um computador para editar.
      </div>

      {/* Corpo: 3 painéis */}
      <div className="relative z-0 flex min-h-0 flex-1 gap-3">
        {/* Biblioteca */}
        <div className="hidden w-70 shrink-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60 md:block">
          <NodeLibrary />
        </div>

        {/* Canvas */}
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
          <ReactFlowProvider>
            <FlowCanvas
              flowId={flow.id}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
            />
          </ReactFlowProvider>
          <PilhaOrdem flow={flow} aberto={previewAberto} onToggle={() => setPreviewAberto((v) => !v)} onSelect={setSelectedNodeId} />
        </div>

        {/* Config */}
        {selectedNodeId && (
          <div className="hidden w-80 shrink-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60 sm:block">
            <NodeConfig flowId={flow.id} nodeId={selectedNodeId} onClose={() => setSelectedNodeId(null)} />
          </div>
        )}
      </div>
    </div>
  )
}

function EditableTitle({
  value, onCommit, toast,
}: {
  value: string
  onCommit: (v: string) => void
  toast: (msg: string, type?: "success" | "error") => void
}) {
  const [editando, setEditando] = useState(false)
  const [draft, setDraft] = useState(value)
  return editando ? (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const v = draft.trim()
        if (v) {
          onCommit(v)
          toast("Nome do fluxo atualizado")
        }
        setEditando(false)
      }}
    >
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => setEditando(false)}
        className="w-56 rounded-md border border-cyan-600 bg-zinc-800 px-2 py-1 text-sm font-semibold text-zinc-100 outline-none"
      />
    </form>
  ) : (
    <button
      onClick={() => {
        setDraft(value)
        setEditando(true)
      }}
      title="Renomear"
      className="max-w-64 truncate rounded-md px-1 text-left text-sm font-semibold text-zinc-100 hover:bg-zinc-800"
    >
      {value}
    </button>
  )
}

function formatQuando(t: number): string {
  const diff = Date.now() - t
  const min = Math.floor(diff / 60000)
  if (min < 1) return "agora"
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

// Mini-preview: lista de blocos em ordem de execução (BFS a partir do início)
function PilhaOrdem({ flow, aberto, onToggle, onSelect }: { flow: FlowDoc; aberto: boolean; onToggle: () => void; onSelect: (id: string) => void }) {
  const ordem = useMemo(() => emOrdemDeExecucao(flow), [flow.nodes.length, flow.edges.length])
  const Icon = Workflow
  return (
    <div className="absolute bottom-3 left-3 z-10 w-52 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/95 shadow-xl">
      <button onClick={onToggle} className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-zinc-800/70">
        <ListTree size={13} className="text-cyan-400" />
        <span className="flex-1 text-xs font-semibold text-zinc-200">Ordem de execução</span>
        <span className="text-[10px] text-zinc-500">{ordem.length}</span>
      </button>
      {aberto && (
        <div className="max-h-56 space-y-0.5 overflow-y-auto border-t border-zinc-800 px-1.5 py-1.5">
          {ordem.map((n, i) => {
            const IconN = NODE_ICONS[n.data.nodeType] ?? Icon
            return (
              <button
                key={n.id}
                onClick={() => onSelect(n.id)}
                className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                <span className="w-3 text-right font-mono text-[9px] text-zinc-600">{i + 1}</span>
                <IconN size={11} className="shrink-0 text-zinc-500" />
                <span className="truncate">{n.data.nome || NODE_TYPES[n.data.nodeType].label}</span>
                {n.data.nodeType === "start" && <span className="ml-auto text-[9px] uppercase text-emerald-500">início</span>}
                {n.data.nodeType === "fim" && <span className="ml-auto text-[9px] uppercase text-zinc-600">fim</span>}
              </button>
            )
          })}
          {ordem.length === 0 && (
            <p className="flex items-center gap-1.5 px-1.5 py-1 text-[11px] text-zinc-500">
              <AlertTriangle size={11} className="text-amber-400" /> Arrume os blocos no canvas
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// Ordenação BFS por arestas orientadas a partir do Início.
function emOrdemDeExecucao(flow: FlowDoc): FlowDoc["nodes"] {
  const start = flow.nodes.find((n) => n.data.nodeType === "start")
  if (!start) return flow.nodes
  const visitados = new Set<string>([start.id])
  const ordem: FlowDoc["nodes"] = []
  const fila: string[] = [start.id]
  while (fila.length > 0) {
    const curId = fila.shift()!
    const no = flow.nodes.find((n) => n.id === curId)!
    ordem.push(no)
    for (const e of flow.edges.filter((x) => x.source === curId)) {
      if (!visitados.has(e.target)) {
        visitados.add(e.target)
        fila.push(e.target)
      }
    }
  }
  const restantes = flow.nodes.filter((n) => !visitados.has(n.id))
  return [...ordem, ...restantes]
}

export function EditorSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2.5">
        <Skeleton className="h-8 w-8" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56" />
        </div>
        <Skeleton className="ml-auto h-8 w-40" />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)]">
        <Skeleton className="h-[460px] w-full" />
      </div>
    </div>
  )
}