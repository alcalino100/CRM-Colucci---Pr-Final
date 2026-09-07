"use client"
import { useEffect, useState } from "react"
import { InboxList, InboxSkeleton } from "./InboxList"
import { ConversaView, ConversaSkeleton } from "./ConversaView"
import { WidgetPanel } from "./WidgetPanel"
import { useInboxStore } from "@/lib/inbox-store"
import { useAuth } from "@/lib/auth-context"
import { supabase } from "@/lib/supabase/client"
import { isTelefoneBloqueado } from "@/lib/telefones-bloqueados"
import { InstanceSelector } from "./InstanceSelector"
import type { InboxConversation } from "@/lib/inbox-mock"

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
  const [filtroTrafego, setFiltroTrafego] = useState(true)
  const selectedId = useInboxStore(s=>s.selectedId)
  const setSelected = useInboxStore(s=>s.setSelected)
  const setConversas = useInboxStore(s=>s.setConversas)
  const setModoReal = useInboxStore(s=>s.setModoReal)
  const instanciaSelecionada = useInboxStore(s=>s.instanciaSelecionada)
  // Gestores de Vendas (Patricia, Guilherme, Kleber) veem a base da instância selecionada; locação (Ricardo) não
  const isGestorVendas = !!user && isGestorNivel(user.role) && podeVendas(user.role)

  useEffect(()=>{ const t=setTimeout(()=>setLoading(false),800); return()=>clearTimeout(t)},[])

  if(user && !isGestorVendas){
    return <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">Acesso restrito a gestores de Vendas (Patrícia, Guilherme, Kleber). Ricardo e equipe de Locação não têm acesso a esta base.</div>
  }

  // Fase 2: fonte primária = conversas WhatsApp da instância selecionada, enriquece com leads, filtro Tráfego Pago como toggle
  useEffect(()=>{
    if(!isGestorVendas || !user) return
    let cancelled=false
    async function loadReal(){
      try{
        const inst = instanciaSelecionada || PATRICIA_INSTANCE
        const r = await fetch(`/api/whatsapp/chat/conversas?instanceName=${inst}`)
        const j = await r.json()
        const raw: any[] = j.conversas || []
        if(cancelled) return
        let filtradas = raw.filter((c:any)=> !isTelefoneBloqueado(c.telefone || ""))
        const leadIds = filtradas.filter(c=>c.leadId).map(c=>c.leadId)
        let leadsMap = new Map<string, any>()
        if(leadIds.length>0){
          const { data: leads } = await supabase.from("leads").select("id,origem,status").in("id", leadIds)
          for(const l of leads||[]) leadsMap.set(l.id, l)
        }
        if(filtroTrafego){
          filtradas = filtradas.filter(c=>{
            if(!c.leadId) return false
            const l = leadsMap.get(c.leadId)
            return l?.origem === "Tráfego Pago"
          })
        }
        // Nome do responsável vem da instância selecionada
        const respNome = inst.split("-")[0] || "Patricia"
        const conversas: InboxConversation[] = filtradas.map((c:any)=>({
          id: `real-${c.leadId || c.telefone}`,
          leadId: c.leadId || "",
          leadName: c.nome || c.nomeContato || c.telefone || "Sem nome",
          responsavel: respNome,
          telefone: c.telefone || "",
          email: "",
          status: c.leadId && leadsMap.get(c.leadId) ? mapStatus(leadsMap.get(c.leadId).status) : (c.status ? mapStatus(c.status) : "aguardando_resposta"),
          followUpAtivo: c.leadId ? leadsMap.get(c.leadId)?.status === "em_followup" : false,
          tentativasRestantes: c.leadId && leadsMap.get(c.leadId)?.status === "em_followup" ? 2 : undefined,
          proximaTentativaISO: c.leadId && leadsMap.get(c.leadId)?.status === "em_followup" ? new Date(Date.now()+2*3600_000).toISOString() : undefined,
          ultimaMensagem: c.ultima || "",
          timestamp: c.ultimaEm || new Date().toISOString(),
          unread: c.leadId && leadsMap.get(c.leadId)?.status === "novo" ? 1 : 0,
          origem: "WhatsApp" as const,
        }))
        if(!cancelled){
          if(conversas.length>0){
            setConversas(conversas)
            setModoReal(true)
          } else {
            setConversas([])
            setModoReal(true)
          }
        }
      }catch{}
    }
    loadReal()
    return()=>{cancelled=true}
  }, [isGestorVendas, user, filtroTrafego, instanciaSelecionada, setConversas, setModoReal])
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
    <div className="flex flex-col gap-3">
      {isGestorVendas && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={filtroTrafego} onChange={e=>setFiltroTrafego(e.target.checked)} className="rounded border-slate-300 text-cyan-500 focus:ring-cyan-500" />
            <span className="font-medium text-slate-700 dark:text-slate-300">Somente Tráfego Pago</span>
          </label>
          <span className="hidden sm:inline text-slate-500">{filtroTrafego ? "filtrando base para IA" : "toda a base"}</span>
          <span className="ml-auto flex items-center gap-2">Instância: <InstanceSelector /></span>
        </div>
      )}
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
    </div>
  )
}
