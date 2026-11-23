"use client"
import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { ArrowLeft, CheckCheck, SendHorizontal } from "lucide-react"
import { useInboxStore } from "@/lib/inbox-store"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/primitives"
import { safeSetInterval } from "@/hooks/use-safe-interval"
import { logger } from "@/lib/logger"
import { supabase } from "@/lib/supabase/client"
import { MidiaBolha } from "./MidiaBolha"
import { Avatar } from "./Avatar"

function fmtHora(iso: string){
  return new Date(iso).toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
}
function timeAgoShort(iso: string){
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff/60000)
  if(m<1) return "agora"
  if(m<60) return `há ${m}min`
  const h=Math.floor(m/60)
  if(h<24) return `há ${h}h`
  return `há ${Math.floor(h/24)}d`
}
function rotuloDia(iso: string){
  const fmt = (d: Date) => d.toLocaleDateString("sv-SE")
  const d = new Date(iso)
  const hoje = new Date()
  const ontem = new Date(Date.now() - 86400000)
  if(fmt(d) === fmt(hoje)) return "Hoje"
  if(fmt(d) === fmt(ontem)) return "Ontem"
  return d.toLocaleDateString("pt-BR", { day:"2-digit", month:"long", year:"numeric" })
}
function proximaEm(iso?: string){
  if(!iso) return ""
  const d = new Date(iso)
  return d.toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })
}

export function ConversaView(){
  const { conversas, mensagens, selectedId, setSelected, enviarMensagem, assumirConversa, cancelarFollowUp, marcarRespondido, modoReal, instanciaSelecionada } = useInboxStore() as any
  const toast = useToast()
  const [texto, setTexto] = useState("")
  const [carregandoReal, setCarregandoReal] = useState(false)
  const [recarga, setRecarga] = useState(0)
  const threadRef = useRef<HTMLDivElement>(null)
  const conv = conversas.find((c: any) => c.id === selectedId) || null
  const thread = selectedId ? (mensagens[selectedId] || []) : []

  useEffect(()=>{ if(threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight }, [thread])

  // Carrega mensagens reais da instância selecionada sob demanda + polling leve.
// Só atualiza o thread quando chega mensagem nova (evita pular o scroll).
  useEffect(()=>{
    if(!modoReal || !selectedId || !conv) return
    const leadId = (conv as any).leadId
    const telefone = (conv as any).telefone
    if(!leadId && !telefone) return
    const inst = instanciaSelecionada || "patricia-6c2875b4"
    const params = leadId ? `leadId=${encodeURIComponent(leadId)}` : `telefone=${encodeURIComponent(telefone)}`
    const chave = selectedId
    let cancelled = false
    setCarregandoReal(true)
    async function carregarThread(silencioso: boolean){
      try{
        const r = await fetch(`/api/whatsapp/chat/mensagens?instanceName=${inst}&${params}`)
        const j = await r.json()
        if(cancelled) return
        const msgs = (j.mensagens || []) as any[]
        // mapeia para InboxMessage
        const mapped = msgs.map((m:any)=>({
          id: m.id,
          conversationId: chave,
          timestamp: m.criado_em,
          sender: m.de_mim ? "você" as const : "lead" as const,
          origem: m.de_mim ? "outbound" as const : "inbound" as const,
          content: m.corpo || "",
          tipoMidia: m.tipo_midia ?? null,
          midiaUrl: m.midia_url ?? null,
          nomeArquivo: m.nome_arquivo ?? null,
          viaAnuncio: !!m.veio_de_anuncio,
          anuncioTitulo: m.anuncio_titulo ?? null,
        }))
        const store = useInboxStore.getState() as any
        const atual = (store.mensagens[chave] || []) as any[]
        const ultimaAtual = atual.length ? atual[atual.length-1]?.id : null
        const ultimaNova = mapped.length ? mapped[mapped.length-1]?.id : null
        const midiaMudou = mapped.some((m, i) => atual[i] && (m as any).midiaUrl !== (atual[i] as any).midiaUrl)
        if(mapped.length !== atual.length || ultimaNova !== ultimaAtual || midiaMudou){
          store.setMensagens({ ...store.mensagens, [chave]: mapped })
        }
      }catch(err){
        logger.warn("Falha ao sincronizar mensagens da conversa do WhatsApp", { chatId: selectedId, error: err instanceof Error ? err.message : String(err) })
      }
      finally{ if(!silencioso) setCarregandoReal(false) }
    }
    void carregarThread(false)
    const stopInterval = safeSetInterval(() => void carregarThread(true), 10000)
    // Tempo real: mensagem nova (ou mídia que terminou de baixar) desta conversa atualiza o thread na hora.
    const canal = supabase
      .channel(`inbox-thread-${chave}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_mensagens" }, (payload) => {
        const row: any = payload.new
        if (row?.instance_name !== inst) return
        if (leadId ? row?.lead_id === leadId : row?.telefone === telefone) void carregarThread(true)
      })
      .subscribe()
    return () => {
      cancelled = true
      stopInterval()
      supabase.removeChannel(canal)
    }
  }, [selectedId, modoReal, conv, recarga])

  if(!conv){
    return (
      <div role="main" className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center dark:border-slate-700 dark:bg-slate-900/50">
        <p className="text-sm text-slate-600 dark:text-slate-400">Selecione uma conversa para começar</p>
      </div>
    )
  }

  const handleEnviar = async () => {
    if(!texto.trim() || !selectedId || !conv) return
    const content = texto.trim()
    if(modoReal){
      try{
        const inst = instanciaSelecionada || "patricia-6c2875b4"
        const r = await fetch("/api/whatsapp/send", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ instanceName: inst, telefone: (conv as any).telefone, texto: content }) })
        const j = await r.json()
        if(!j.ok) throw new Error(j.erro || "falha")
        enviarMensagem(selectedId, content)
        setTexto("")
        // Busca a mensagem já gravada (troca a versão provisória pela real)
        setTimeout(() => setRecarga(n => n + 1), 600)
      }catch(e:any){
        toast(e.message || "Erro ao enviar via WhatsApp","error")
      }
      return
    }
    try{
      enviarMensagem(selectedId, content)
      setTexto("")
    }catch{
      toast("Erro ao enviar resposta","error")
    }
  }

  const aoDigitar = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if(e.key === "Enter" && !e.shiftKey){ e.preventDefault(); void handleEnviar() }
  }
  const statusTexto = String(conv.status).replace("_"," ")
  // Agrupa por dia para os separadores
  let diaAnterior = ""

  return (
    <motion.div key={conv.id} initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.15}} role="main" className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#efeae2] dark:bg-[#0b141a]">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#f0f2f5] px-3 py-2 dark:bg-[#202c33]">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={() => setSelected(null)} className="md:hidden -ml-1 rounded-full p-1.5 text-slate-600 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10" aria-label="Voltar à lista de conversas">
            <ArrowLeft className="size-5" />
          </button>
          <Avatar nome={conv.leadName} chave={conv.telefone} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-slate-900 dark:text-slate-100">{conv.leadName}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{conv.telefone} · {conv.origem} · {statusTexto}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={()=>assumirConversa(conv.id)} className="rounded-full bg-[#00a884] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#008f72]">Assumir conversa</button>
          <button onClick={()=>{
            cancelarFollowUp(conv.id)
            const el = document.getElementById(`banner-${conv.id}`)
            if(el){ el.classList.add("bg-red-500/20"); setTimeout(()=>el.classList.remove("bg-red-500/20"),100)}
          }} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-transparent dark:text-slate-200 dark:hover:bg-white/10">Cancelar follow-up</button>
          <button onClick={()=>marcarRespondido(conv.id)} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-transparent dark:text-slate-200 dark:hover:bg-white/10">Marcar respondido</button>
        </div>
      </div>

      {(conv as any).status==="escalated" && (
        <div className="bg-red-100 px-3 py-2 text-xs text-red-800 dark:bg-red-950/60 dark:text-red-300">🚨 Escalado para humano — IA pausada. Assuma a conversa.</div>
      )}
      {conv.followUpAtivo && (
        <div id={`banner-${conv.id}`} className="bg-amber-100 px-3 py-2 text-xs text-amber-900 transition-colors dark:bg-amber-950/60 dark:text-amber-300">
          🤖 Follow-up automático ativo — próxima tentativa em {proximaEm(conv.proximaTentativaISO)} · {conv.tentativasRestantes} tentativas restantes
        </div>
      )}

      {/* Mensagens */}
      <div ref={threadRef} className="flex-1 overflow-y-auto px-3 py-4 sm:px-[8%]">
        {thread.length===0 ? (
          <p className="mx-auto mt-10 w-fit rounded-lg bg-white/80 px-4 py-2 text-center text-sm text-slate-600 shadow-sm dark:bg-[#202c33] dark:text-slate-300">
            {carregandoReal ? "Carregando mensagens…" : "Nenhuma mensagem ainda."}
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {thread.map((m: any) => {
              const dia = rotuloDia(m.timestamp)
              const novoDia = dia !== diaAnterior
              diaAnterior = dia
              const minha = m.sender==="você"
              return (
                <div key={m.id} className="flex flex-col">
                  {novoDia && (
                    <span className="mx-auto my-3 rounded-lg bg-white/90 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-600 shadow-sm dark:bg-[#182229] dark:text-slate-300">{dia}</span>
                  )}
                  <div className={cn("flex", minha ? "justify-end" : "justify-start")}>
                    <div className={cn("relative max-w-[85%] rounded-lg px-2.5 py-1.5 text-[14.5px] leading-snug shadow-sm sm:max-w-[70%]",
                      minha ? "rounded-tr-none bg-[#d9fdd3] text-slate-900 dark:bg-[#005c4b] dark:text-slate-50"
                            : "rounded-tl-none bg-white text-slate-900 dark:bg-[#202c33] dark:text-slate-100"
                    )}>
                      {m.sender==="ia" && <p className="mb-0.5 text-[11px] font-semibold text-[#00a884]">🤖 Assistente IA</p>}
                      {m.viaAnuncio && (
                        <p className="mb-1 w-fit rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                          Via anúncio{m.anuncioTitulo ? ` · ${String(m.anuncioTitulo).slice(0, 40)}` : ""}
                        </p>
                      )}
                      {m.tipoMidia && <MidiaBolha midia={{ tipo: m.tipoMidia, url: m.midiaUrl, nome: m.nomeArquivo }} />}
                      {m.content && <span className="whitespace-pre-wrap break-words">{m.content}</span>}
                      <span className={cn("float-right ml-3 mt-1 flex items-center gap-0.5 text-[11px] leading-none", minha ? "text-slate-500 dark:text-slate-300/80" : "text-slate-500 dark:text-slate-400")}>
                        {fmtHora(m.timestamp)}
                        {minha && <CheckCheck className="size-3.5 text-sky-500" aria-label="Enviada" />}
                      </span>
                      <span className="clear-both block" />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Compositor */}
      <div className="flex items-end gap-2 bg-[#f0f2f5] px-3 py-2 dark:bg-[#202c33]">
        <textarea value={texto} onChange={e=>setTexto(e.target.value)} onKeyDown={aoDigitar} placeholder="Digite uma mensagem" aria-label="Mensagem" rows={1} className="max-h-32 min-h-[42px] flex-1 resize-none rounded-3xl border-0 bg-white px-4 py-2.5 text-[15px] text-slate-900 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-[#00a884]/40 dark:bg-[#2a3942] dark:text-slate-100 dark:placeholder:text-slate-400" />
        <button onClick={handleEnviar} disabled={!texto.trim()} aria-label="Enviar mensagem" className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white transition hover:bg-[#008f72] disabled:opacity-40">
          <SendHorizontal className="size-5" />
        </button>
      </div>
    </motion.div>
  )
}

export function ConversaSkeleton(){
  return <div className="flex flex-1 animate-pulse flex-col gap-3 bg-[#efeae2] p-4 dark:bg-[#0b141a]"><div className="h-10 rounded bg-black/10" /><div className="h-40 rounded bg-black/10" /></div>
}
