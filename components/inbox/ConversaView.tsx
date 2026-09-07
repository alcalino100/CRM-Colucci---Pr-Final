"use client"
import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useInboxStore } from "@/lib/inbox-store"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/primitives"

function fmtHora(iso: string){
  return new Date(iso).toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
}
function proximaEm(iso?: string){
  if(!iso) return ""
  const d = new Date(iso)
  return d.toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })
}

export function ConversaView(){
  const { conversas, mensagens, selectedId, enviarMensagem, assumirConversa, cancelarFollowUp, marcarRespondido } = useInboxStore()
  const toast = useToast()
  const [texto, setTexto] = useState("")
  const threadRef = useRef<HTMLDivElement>(null)
  const conv = conversas.find(c=>c.id===selectedId) || null
  const thread = selectedId ? (mensagens[selectedId] || []) : []

  useEffect(()=>{ if(threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight }, [thread])

  if(!conv){
    return (
      <div role="main" className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-10 text-center">
        <p className="text-sm text-slate-400">Selecione uma conversa para começar</p>
      </div>
    )
  }

  const handleEnviar = () => {
    if(!texto.trim() || !selectedId) return
    try{
      enviarMensagem(selectedId, texto.trim())
      setTexto("")
    }catch{
      toast("Erro ao enviar resposta","error")
    }
  }

  return (
    <motion.div key={conv.id} initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.2}} role="main" className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      {/* Header breadcrumb + ações */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-100">{conv.leadName} <span className="font-normal text-slate-400">· {conv.status.replace("_"," ")}</span></p>
          <p className="text-xs text-slate-400">{conv.telefone} · {conv.origem}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={()=>assumirConversa(conv.id)} className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-400">Assumir Conversa</button>
          <button onClick={()=>{
            cancelarFollowUp(conv.id)
            // flash vermelho 100ms
            const el = document.getElementById(`banner-${conv.id}`)
            if(el){ el.classList.add("bg-red-500/20"); setTimeout(()=>el.classList.remove("bg-red-500/20"),100)}
          }} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700">Cancelar Follow-up</button>
          <button onClick={()=>marcarRespondido(conv.id)} className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20">Marcar como Respondido</button>
        </div>
      </div>

      {conv.followUpAtivo && (
        <div id={`banner-${conv.id}`} className="border-b border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 transition-colors">
          🤖 Follow-up automático ativo — próxima tentativa em {proximaEm(conv.proximaTentativaISO)} · {conv.tentativasRestantes} tentativas restantes
        </div>
      )}

      {/* Timeline */}
      <div ref={threadRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-950 p-4">
        {thread.length===0 ? (
          <p className="py-10 text-center text-sm text-slate-500">Histórico vazio — primeira mensagem?</p>
        ) : (
          <AnimatePresence initial={false}>
            {thread.map(m=>(
              <motion.div key={m.id} initial={{opacity:0, y:8}} animate={{opacity:1, y:0}} transition={{duration:0.2}} className={cn("flex", m.sender==="você" ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                  m.sender==="você" ? "rounded-br-sm bg-sky-500 text-white" :
                  m.sender==="ia" ? "rounded-bl-sm border border-slate-700 bg-slate-800 text-slate-100" :
                  "rounded-bl-sm bg-slate-800 text-slate-100"
                )}>
                  {m.sender==="ia" && <span className="mr-1">🤖</span>}
                  <span className="whitespace-pre-wrap break-words">{m.content}</span>
                  <p className={cn("mt-1 text-right font-mono text-[10px]", m.sender==="você" ? "text-white/70" : "text-slate-400")}>{fmtHora(m.timestamp)} · {m.sender}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Caixa de resposta */}
      <div className="flex items-end gap-2 border-t border-slate-800 p-3">
        <textarea value={texto} onChange={e=>setTexto(e.target.value)} placeholder="Sua resposta..." rows={2} className="max-h-24 min-h-[44px] flex-1 resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20" />
        <div className="flex gap-2">
          <button onClick={()=>setTexto("")} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700">Cancelar</button>
          <button onClick={handleEnviar} disabled={!texto.trim()} className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-50">Enviar</button>
        </div>
      </div>
    </motion.div>
  )
}

export function ConversaSkeleton(){
  return <div className="flex flex-1 animate-pulse flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="h-10 rounded bg-slate-800" /><div className="h-40 rounded bg-slate-800" /></div>
}
