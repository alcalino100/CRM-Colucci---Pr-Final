// =============================================================================
// automation/node-library.tsx — Biblioteca de blocos (painel esquerdo, 280px).
// =============================================================================

"use client"

import { useMemo, useState } from "react"
import { ChevronDown, GripVertical, Search } from "lucide-react"
import { CATEGORIES, NODE_ICONS, NODE_TYPES } from "@/lib/flow/palette"
import type { FlowNodeType } from "@/lib/flow/types"

const TYPE_DRAG = "application/x-colucci-nodo"

export default function NodeLibrary() {
  const [abertas, setAbertas] = useState<Record<string, boolean>>({ gatilho: true, conteudo: true })
  const [busca, setBusca] = useState("")

  const tipos = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return (Object.entries(NODE_TYPES) as [FlowNodeType, (typeof NODE_TYPES)[FlowNodeType]][])
      .filter(([, def]) => !q || def.label.toLowerCase().includes(q) || def.category.toLowerCase().includes(q))
  }, [busca])

  const onDragStart = (ev: React.DragEvent<HTMLDivElement>, tipo: FlowNodeType) => {
    ev.dataTransfer.setData(TYPE_DRAG, tipo)
    ev.dataTransfer.effectAllowed = "move"
  }

  const porCategoria = (key: string) =>
    tipos.filter(([, def]) => def.category === key)

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Biblioteca de blocos</h2>
          <p className="text-[11px] text-zinc-500">Arraste para o canvas</p>
        </div>
      </div>

      <div className="px-4 pt-3 pb-2">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar bloco..."
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-1.5 pl-8 pr-3 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-cyan-600 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {/* categoria Início sempre amostrada separadamente */}
        {tipos.map(([tipo, def]) => {
          if (def.isStart) {
            return (
              <DraggableRow key={tipo} tipo={tipo} onDragStart={onDragStart} label={def.label} showGrip />
            )
          }
        })}

        {CATEGORIES.map((cat) => {
          const list = porCategoria(cat.key)
          if (list.length === 0) return null
          const isOpen = abertas[cat.key]
          return (
            <div key={cat.key} className="overflow-hidden rounded-lg border border-zinc-800/70 bg-zinc-900/60">
              <button
                onClick={() => setAbertas((s) => ({ ...s, [cat.key]: !s[cat.key] }))}
                className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-zinc-800/60"
              >
                <span
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-md"
                  style={{ backgroundColor: `${cat.color}22`, color: cat.color }}
                >
                  <cat.icon size={11.5} strokeWidth={2.2} />
                </span>
                <span className="flex-1 text-xs font-semibold text-zinc-200">{cat.label}</span>
                <span className="text-[10px] text-zinc-500">{list.length}</span>
                <ChevronDown size={13} className={`text-zinc-500 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
              </button>
              {isOpen && (
                <div className="space-y-1 px-1.5 pb-1.5">
                  {list.map(([tipo, def]) => (
                    <DraggableRow key={tipo} tipo={tipo} onDragStart={onDragStart} label={def.label} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}

function DraggableRow({
  tipo, onDragStart, label, showGrip,
}: {
  tipo: FlowNodeType
  onDragStart: (ev: React.DragEvent<HTMLDivElement>, tipo: FlowNodeType) => void
  label: string
  showGrip?: boolean
}) {
  const Icon = NODE_ICONS[tipo]
  const def = NODE_TYPES[tipo]
  const cat = CATEGORIES.find((c) => c.key === def.category) ?? CATEGORIES[5]
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, tipo)}
      className="group flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800/80 active:cursor-grabbing"
      title={def.description}
    >
      <span
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md"
        style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
      >
        <Icon size={12.5} strokeWidth={2.2} />
      </span>
      <span className="flex-1 truncate">{label}</span>
      {showGrip && <GripVertical size={12} className="text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100" />}
    </div>
  )
}