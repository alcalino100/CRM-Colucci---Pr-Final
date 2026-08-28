// =============================================================================
// automation/flow-node.tsx — Nó custom do React Flow.
// =============================================================================

"use client"

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { AlertTriangle, ChevronRight } from "lucide-react"
import { NODE_TYPES, NODE_ICONS, categoriaDe, handlesSaida } from "@/lib/flow/palette"
import type { FieldValue, FlowNodeType } from "@/lib/flow/types"

export type FlowNodeData = {
  nodeType: FlowNodeType
  nome: string
  config: Record<string, FieldValue>
  erro?: boolean
}

export type FlowRFNode = Node<FlowNodeData, "flowNode">

export default function FlowNode({ data, selected }: NodeProps<FlowRFNode>) {
  const { nodeType, nome, config, erro } = data
  const def = NODE_TYPES[nodeType]
  const cat = categoriaDe(nodeType)
  const Icon = NODE_ICONS[nodeType]
  const saidas = handlesSaida(nodeType, config)
  const isStart = !!def.isStart
  const isEnd = !!def.isEnd

  return (
    <div
      data-flow-node
      className={`relative w-56 rounded-xl border bg-zinc-900 shadow-lg shadow-black/40 transition-colors ${
        erro
          ? "border-red-500/80"
          : selected
            ? "border-cyan-500"
            : "border-zinc-800 hover:border-zinc-700"
      }`}
    >
      {/* faixa da categoria */}
      <span
        className="pointer-events-none absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
        style={{ backgroundColor: cat.color }}
      />

      {erro && (
        <span className="absolute -top-2 -right-2 grid h-5 w-5 place-items-center rounded-full bg-red-500 text-white shadow" title="Nó sem saída conectada">
          <AlertTriangle size={11} strokeWidth={2.5} />
        </span>
      )}

      <div className="flex flex-col gap-1.5 px-3 py-2.5 pl-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
              style={{ backgroundColor: `${cat.color}22`, color: cat.color }}
            >
              <Icon size={14} strokeWidth={2.2} />
            </span>
            <span className="truncate text-[13px] font-semibold leading-tight text-zinc-100">{data.nome || def.label}</span>
          </div>
          {!selected && <ChevronRight size={13} className="shrink-0 text-zinc-600" />}
        </div>

        <div className="flex min-w-0 items-center gap-1.5 text-[10.5px] text-zinc-500">
          <span className="truncate">{def.label}</span>
          <span className="h-0.5 w-0.5 rounded-full bg-zinc-700" />
          <span className="shrink-0 uppercase tracking-wide">{cat.label}</span>
        </div>

        {/* legenda de saídas quando ramifica */}
        {saidas.length > 1 && (
          <div className="mt-0.5 flex items-center gap-3 border-t border-zinc-800 pt-1.5">
            {saidas.map((h) => (
              <span key={h.id} className="flex items-center gap-1 text-[10px] font-medium text-zinc-400">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: h.cor }} />
                {h.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* handle de entrada */}
      {!isStart && (
        <Handle
          id="in"
          type="target"
          position={Position.Top}
          className="!h-2.5 !w-2.5 !border-2 !border-zinc-900 !bg-zinc-500"
          style={{ top: 0 }}
        />
      )}

      {/* handles de saída */}
      {!isEnd &&
        saidas.map((h, i) => (
          <Handle
            key={h.id}
            id={h.id}
            type="source"
            position={Position.Bottom}
            isConnectableStart
            className="!h-2.5 !w-2.5 !border-2 !border-zinc-900"
            style={{
              left: saidas.length > 1 ? (i === 0 ? "28%" : "72%") : "50%",
              backgroundColor: h.cor,
            }}
          />
        ))}
    </div>
  )
}