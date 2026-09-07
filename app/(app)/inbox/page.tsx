"use client"
import { useEffect, useState } from "react"
import { InboxList, InboxSkeleton } from "@/components/inbox/InboxList"
import { ConversaView, ConversaSkeleton } from "@/components/inbox/ConversaView"
import { WidgetPanel } from "@/components/inbox/WidgetPanel"

export default function InboxPage(){
  const [loading, setLoading] = useState(true)
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
      {/* Em mobile: stack vertical [Inbox] -> [Conversa] -> [Widget] */}
      <InboxList />
      <ConversaView />
      <WidgetPanel />
    </div>
  )
}
