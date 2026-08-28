// =============================================================================
// automation/flow-canvas.tsx — Superfície React Flow: pan/zoom, drag-n-drop,
// conexões, validação ao vivo.
// =============================================================================

"use client"

import { useCallback, useMemo } from "react"
import {
  ReactFlow, Background, BackgroundVariant, Controls, MarkerType,
  useReactFlow, type Connection, type Edge, type NodeTypes, type OnConnectStartParams,
} from "@xyflow/react"
import type { NodeProps } from "@xyflow/react"
import { AlertTriangle, CheckCircle2 } from "lucide-react"
import FlowNode, { type FlowRFNode } from "./flow-node"
import { useFlowStore, validarFluxo } from "@/lib/flow/flow-store"
import { corDaAresta } from "@/lib/flow/palette"
import type { BranchHandle, FlowNodeType } from "@/lib/flow/types"

const nodeTypes: NodeTypes = { flowNode: FlowNode }

interface FlowCanvasProps {
  flowId: string
  selectedNodeId: string | null
  onSelectNode: (id: string | null) => void
  onStartConnect?: () => void
  onStopConnect?: () => void
}

const TYPE_DRAG = "application/x-colucci-nodo"

export default function FlowCanvas({ flowId, selectedNodeId, onSelectNode, onStartConnect, onStopConnect }: FlowCanvasProps) {
  const flow = useFlowStore((s) => s.flows[flowId])
  const addNode = useFlowStore((s) => s.addNode)
  const moveNode = useFlowStore((s) => s.moveNode)
  const addEdge = useFlowStore((s) => s.addEdge)
  const removeEdge = useFlowStore((s) => s.removeEdge)
  const removeNode = useFlowStore((s) => s.removeNode)
  const { screenToFlowPosition } = useReactFlow<FlowRFNode>()

  const nodes = useMemo<FlowRFNode[]>(() => {
    if (!flow) return []
    const v = validarFluxo(flow)
    const semSaida = new Set(v.semSaida)
    const orfaos = new Set(v.orfaos)
    return flow.nodes.map((n) => ({
      id: n.id,
      type: "flowNode",
      position: n.position,
      data: { ...n.data, erro: semSaida.has(n.data.nome) || orfaos.has(n.data.nome) },
    }))
  }, [flow])

  const edges = useMemo<Edge[]>(() => {
    if (!flow) return []
    return flow.edges.map((e) => {
      const cor = corDaAresta(e.sourceHandle)
      const edge: Edge = {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        label: e.sourceHandle === "else" ? "Não" : e.label,
        style: { stroke: cor, strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: cor, width: 16, height: 16 },
        labelStyle: { fill: cor, fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: "#09090b", fillOpacity: 0.9 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
      }
      return edge
    })
  }, [flow])

  const validacao = useMemo(() => (flow ? validarFluxo(flow) : null), [flow])

  const onConnect = useCallback(
    (c: Connection) => {
      if (!flow || !c.source || !c.target) return
      addEdge(flow.id, {
        source: c.source,
        target: c.target,
        sourceHandle: (c.sourceHandle as BranchHandle | null) ?? "out",
      })
    },
    [flow, addEdge]
  )

  const onReconnect = useCallback(
    (e: Edge, c: Connection) => {
      if (!flow || !c.source || !c.target) return
      removeEdge(flow.id, e.id)
      addEdge(flow.id, {
        source: c.source,
        target: c.target,
        sourceHandle: (c.sourceHandle as BranchHandle | null) ?? "out",
      })
    },
    [flow, removeEdge, addEdge]
  )

  const onDragOver = useCallback((ev: React.DragEvent) => {
    if (ev.dataTransfer.types.includes(TYPE_DRAG)) {
      ev.preventDefault()
      ev.dataTransfer.dropEffect = "move"
    }
  }, [])

  const onDrop = useCallback(
    (ev: React.DragEvent) => {
      const tipo = ev.dataTransfer.getData(TYPE_DRAG)
      if (!tipo || !flow) return
      ev.preventDefault()
      const position = screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
      const nodeId = addNode(flow.id, tipo as FlowNodeType, position)
      onSelectNode(nodeId)
    },
    [flow, screenToFlowPosition, addNode, onSelectNode]
  )

  const onConnectStart = useCallback(
    (_: unknown, __: OnConnectStartParams) => onStartConnect?.(),
    [onStartConnect]
  )
  const onConnectEnd = useCallback(() => onStopConnect?.(), [onStopConnect])

  if (!flow) return null

  const problemas: string[] = []
  if (!validacao?.temInicio) problemas.push("O fluxo não possui o bloco Início do Fluxo.")
  if (validacao?.multiplosInicios) problemas.push("O fluxo possui mais de um bloco de início.")
  if (validacao?.orfaos.length) problemas.push(`${validacao.orfaos.length} bloco(s) sem entrada conectada.`)
  if (validacao?.semSaida.length) problemas.push(`${validacao.semSaida.length} bloco(s) sem saída conectada.`)

  return (
    <div className="relative z-0 h-full w-full">
      <ReactFlow<FlowRFNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={undefined}
        onNodeDragStop={(_, n) => moveNode(flow.id, n.id, n.position)}
        onConnect={onConnect}
        onReconnect={onReconnect}
        onNodeClick={(_, n) => onSelectNode(n.id)}
        onPaneClick={() => onSelectNode(null)}
        onNodesDelete={(ns) => ns.forEach((n) => removeNode(flow.id, n.id))}
        onEdgesDelete={(es) => es.forEach((e) => removeEdge(flow.id, e.id))}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        fitView
        minZoom={0.2}
        maxZoom={2}
        selectionOnDrag
        deleteKeyCode={["Backspace", "Delete"]}
        defaultEdgeOptions={{ animated: false }}
        proOptions={{ hideAttribution: true }}
        className="!bg-zinc-950"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="#27272a" />
        <Controls
          position="bottom-left"
          showInteractive={false}
          className="!overflow-hidden !rounded-lg !border !border-zinc-800 !bg-zinc-900 !shadow-lg"
          style={{
            ["--rf-control-button-bg" as string]: "#18181b",
            ["--rf-control-button-bg-hover" as string]: "#27272a",
            ["--rf-control-button-color" as string]: "#a1a1aa",
            ["--rf-control-button-border-color" as string]: "#3f3f46",
          }}
        />
      </ReactFlow>

      {!selectedNodeId && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 select-none">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/95 px-3 py-1.5 text-[11px] text-zinc-400 shadow">
            Arraste blocos da biblioteca para cá · role para navegar · clique num bloco para editar
          </div>
        </div>
      )}

      {/* faixa de validação */}
      <div className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2">
        {problemas.length === 0 ? (
          <div className="flex items-center gap-1.5 rounded-lg border border-emerald-800/60 bg-emerald-950/80 px-3 py-1.5 text-[11px] font-medium text-emerald-300 shadow">
            <CheckCircle2 size={12} /> Fluxo pronto para publicar
          </div>
        ) : (
          <div className="flex items-center gap-1.5 rounded-lg border border-amber-700/60 bg-amber-950/80 px-3 py-1.5 text-[11px] font-medium text-amber-300 shadow">
            <AlertTriangle size={12} /> {problemas.join(" ")}
          </div>
        )}
      </div>
    </div>
  )
}