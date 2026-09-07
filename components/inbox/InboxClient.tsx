"use client"
import { useEffect, useState } from "react"
import { InboxList, InboxSkeleton } from "./InboxList"
import { ConversaView, ConversaSkeleton } from "./ConversaView"
import { WidgetPanel } from "./WidgetPanel"
import { useInboxStore } from "@/lib/inbox-store"
import { useAuth } from "@/lib/auth-context"
import { supabase } from "@/lib/supabase/client"
import type { InboxConversation, InboxMessage } from "@/lib/inbox-mock"

const PATRICIA_ID = "6c2875b4-0d11-4370-b9fd-3c13b5257bd4"
const PATRICIA_INSTANCE = "patricia-6c2875b4"

function mapStatus(s: string): "aguardando_resposta" | "respondido" | "em_follow_up" {
  if(s==="em_followup" || s==="em_follow_up") return "em_follow_up"
  if(s==="novo" || s==="em_atendimento" || s==="aguardando") return "aguardando_resposta"
  return "respondido"
}

export function InboxClient(){
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const selectedId = useInboxStore(s=>s.selectedId)
  const setSelected = useInboxStore(s=>s.setSelected)
  const setConversas = useInboxStore(s=>s.setConversas)
  const setMensagens = useInboxStore(s=>s.setMensagens)
  const setModoReal = useInboxStore(s=>s.setModoReal)
  const isPatricia = user?.id === PATRICIA_ID

  useEffect(()=>{ const t=setTimeout(()=>setLoading(false),800); return()=>clearTimeout(t)},[])

  // Fase 2: dados reais só para Patricia, só origem Tráfego Pago, só instancia dela
  useEffect(()=>{
    if(!isPatricia || !user) return
    let cancelled=false
    async function loadReal(){
      try{
        // Leads só Tráfego Pago da Patricia (tag)
        const { data: leads, error } = await supabase.from("leads").select("id,nome,telefone,email,origem,status,corretor_id,atualizado_em").eq("origem","Tráfego Pago").eq("corretor_id", PATRICIA_ID).limit(100)
        if(error || !leads) return
        if(cancelled) return
        // Monta conversas a partir dos leads filtrados
        const conversas: InboxConversation[] = leads.map(l=>({
          id: `real-${l.id}`,
          leadId: l.id,
          leadName: l.nome || "Sem nome",
          responsavel: "Patricia",
          telefone: l.telefone || "",
          email: (l as any).email || "",
          status: mapStatus((l as any).status || "novo"),
          followUpAtivo: (l as any).status === "em_followup",
          tentativasRestantes: (l as any).status === "em_followup" ? 2 : undefined,
          proximaTentativaISO: (l as any).status === "em_followup" ? new Date(Date.now()+2*3600_000).toISOString() : undefined,
          ultimaMensagem: `Lead ${l.origem} · ${l.status}`,
          timestamp: (l as any).atualizado_em || new Date().toISOString(),
          unread: (l as any).status === "novo" ? 1 : 0,
          origem: "WhatsApp" as const,
        }))
        if(conversas.length>0){
          setConversas(conversas)
          setModoReal(true)
          // Pré-carrega mensagens da primeira conversa para teste
          // Mensagens reais serão carregadas sob demanda no ConversaView via leadId
        }
      }catch{}
    }
    loadReal()
    return()=>{cancelled=true}
  }, [isPatricia, user, setConversas, setModoReal, setMensagens])
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
