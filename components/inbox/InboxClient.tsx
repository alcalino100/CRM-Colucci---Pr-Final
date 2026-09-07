"use client"
import { useEffect, useState } from "react"
import { InboxList, InboxSkeleton } from "./InboxList"
import { ConversaView, ConversaSkeleton } from "./ConversaView"
import { WidgetPanel } from "./WidgetPanel"
import { useInboxStore } from "@/lib/inbox-store"

export function InboxClient(){
  const [loading, setLoading] = useState(true)
  const selectedId = useInboxStore(s=>s.selectedId)
  const setSelected = useInboxStore(s=>s.setSelected)
  useEffect(()=>{ const t=setTimeout(()=>setLoading(false),800); return()=>clearTimeout(t)},[])
  if(loading){
    return (
      <div className="flex flex-col gap-4 lg:h-[calc(100vh-11rem)] lg:flex-row">
        <InboxSkeleton />
        <ConversaSkeleton />
        <div className="hidden lg:block w-[240px] shrink-0 rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="h-32 animate-pulse rounded bg-slate-800" /></div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-11rem)] lg:flex-row">
      {/* Desktop: 3 colunas | Mobile: drawer Inbox quando conversa aberta */}
      <div className={`${selectedId ? "hidden md:flex" : "flex"} w-full md:w-[280px] shrink-0`}>
        <InboxList />
      </div>
      <div className={`${!selectedId ? "hidden md:flex" : "flex"} min-w-0 flex-1`}>
        <ConversaView />
      </div>
      {/* Widget: esconde em mobile quando conversa aberta, mostra em desktop sempre */}
      <div className={`${selectedId ? "hidden lg:flex" : "flex"} w-full lg:w-[240px] shrink-0`}>
        <WidgetPanel />
      </div>
      {/* Botão voltar mobile quando conversa selecionada */}
      {selectedId && (
        <button onClick={()=>setSelected(null)} className="fixed bottom-4 left-4 z-20 rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-lg md:hidden">← Voltar ao Inbox</button>
      )}
    </div>
  )
}
