"use client"
import { useRef } from "react"
import { Search } from "lucide-react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useInboxStore } from "@/lib/inbox-store"
import { cn } from "@/lib/utils"

function timeAgo(iso: string) {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const m = Math.floor(diff/60000)
  if (m < 1) return "agora"
  if (m < 60) return `há ${m}min`
  const h = Math.floor(m/60)
  if (h < 24) return `há ${h}h`
  const dias = Math.floor(h/24)
  return `há ${dias}d`
}

const badgeStyles: Record<string,string> = {
  aguardando_resposta: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  respondido: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  em_follow_up: "bg-amber-500/15 text-amber-400 border-amber-500/20",
}
const badgeLabel: Record<string,string> = {
  aguardando_resposta: "aguardando resposta",
  respondido: "respondido",
  em_follow_up: "em follow-up",
}

export function InboxList() {
  const { conversas, selectedId, filtro, setSelected, setFiltro } = useInboxStore()
  const filtradas = conversas.filter(c => !filtro || c.leadName.toLowerCase().includes(filtro.toLowerCase()))
  const naoRespondidas = conversas.filter(c=> c.status==="aguardando_resposta").length
  const parentRef = useRef<HTMLDivElement>(null)
  const shouldVirtualize = filtradas.length > 50
  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? filtradas.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 86,
    overscan: 5,
  })

  return (
    <div role="navigation" aria-label="Inbox" className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:w-[280px]">
      <div className="border-b border-slate-200 p-3 dark:border-slate-800">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100" style={{fontFamily:"var(--font-inter)"}}>Inbox</h2>
          {naoRespondidas>0 && <span className="rounded-full bg-cyan-500 px-2 py-0.5 text-[11px] font-bold text-slate-950">{naoRespondidas}</span>}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <input value={filtro} onChange={e=>setFiltro(e.target.value)} placeholder="Buscar por nome..." aria-label="Buscar conversas" className="h-9 w-full rounded-lg border border-slate-300 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-500 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
        </div>
      </div>
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        {filtradas.length===0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">Nenhuma conversa. Você está em dia! 🎉</p>
        ) : shouldVirtualize ? (
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
            {virtualizer.getVirtualItems().map(v => {
              const c = filtradas[v.index]
              return (
                <button key={c.id} onClick={()=>setSelected(c.id)} aria-pressed={selectedId===c.id} style={{ position:"absolute", top:0, left:0, width:"100%", transform:`translateY(${v.start}px)`}} className={cn("flex flex-col gap-1 border-b border-slate-200/60 px-3 py-3 text-left transition hover:bg-slate-100 dark:border-slate-800/60 dark:hover:bg-slate-800", selectedId===c.id && "bg-slate-100 dark:bg-slate-800 border-l-2 border-l-cyan-500")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-900 dark:text-slate-100" style={{fontFamily:"var(--font-inter)"}}>
                      {c.leadName} {c.followUpAtivo && <span aria-label="Follow-up ativo">🤖</span>}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-slate-500 dark:text-slate-400" style={{fontFamily:"var(--font-jetbrains)"}}>{timeAgo(c.timestamp)}</span>
                  </div>
                  <span className="truncate text-xs text-slate-600 dark:text-slate-400">{c.ultimaMensagem}</span>
                  <span className={cn("w-fit rounded-full border px-2 py-0.5 text-[10px] font-medium", badgeStyles[c.status])}>{badgeLabel[c.status]}</span>
                </button>
              )
            })}
          </div>
        ) : filtradas.map(c=>(
          <button key={c.id} onClick={()=>setSelected(c.id)} aria-pressed={selectedId===c.id} className={cn("flex w-full flex-col gap-1 border-b border-slate-200/60 px-3 py-3 text-left transition hover:bg-slate-100 dark:border-slate-800/60 dark:hover:bg-slate-800", selectedId===c.id && "bg-slate-100 dark:bg-slate-800 border-l-2 border-l-cyan-500")}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-900 dark:text-slate-100" style={{fontFamily:"var(--font-inter)"}}>
                {c.leadName} {c.followUpAtivo && <span aria-label="Follow-up ativo">🤖</span>}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-slate-500 dark:text-slate-400" style={{fontFamily:"var(--font-jetbrains)"}}>{timeAgo(c.timestamp)}</span>
            </div>
            <span className="truncate text-xs text-slate-600 dark:text-slate-400">{c.ultimaMensagem}</span>
            <span className={cn("w-fit rounded-full border px-2 py-0.5 text-[10px] font-medium", badgeStyles[c.status])}>{badgeLabel[c.status]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function InboxSkeleton() {
  return (
    <div className="flex h-full w-full flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3 lg:w-[280px]">
      {[1,2,3].map(i=> <div key={i} className="h-20 animate-pulse rounded-lg bg-slate-800" />)}
    </div>
  )
}
