"use client"
import { useRef, useState } from "react"
import { CheckCheck, ListFilter, Search } from "lucide-react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useInboxStore } from "@/lib/inbox-store"
import { cn } from "@/lib/utils"
import { Avatar } from "./Avatar"
import type { InboxConversation } from "@/lib/inbox-mock"

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
  aguardando_resposta: "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400",
  respondido: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400",
  em_follow_up: "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400",
  escalated: "bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400",
}
const badgeLabel: Record<string,string> = {
  aguardando_resposta: "aguardando resposta",
  respondido: "respondido",
  em_follow_up: "em follow-up",
  escalated: "escalado • humano",
}

function Linha({ c, ativa, onClick, style }: { c: InboxConversation; ativa: boolean; onClick: () => void; style?: React.CSSProperties }) {
  const naoLida = c.unread > 0
  const previa = c.ultimaMensagem.replace(/^Você:\s*/, "")
  const tags = (c.tags || []).map((t: any) => (typeof t === "string" ? t : t?.ref ?? "")).filter(Boolean)
  return (
    <button onClick={onClick} aria-pressed={ativa} style={style} className={cn("flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-left transition hover:bg-[#f5f6f6] dark:border-slate-800/70 dark:hover:bg-[#202c33]", ativa && "bg-[#f0f2f5] dark:bg-[#2a3942]")}>
      <Avatar nome={c.leadName} chave={c.telefone} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn("truncate text-[15px] text-slate-900 dark:text-slate-100", naoLida ? "font-semibold" : "font-normal")}>{c.leadName}</span>
          <span className={cn("shrink-0 text-[11px]", naoLida ? "font-medium text-[#00a884]" : "text-slate-500 dark:text-slate-400")}>{timeAgo(c.timestamp)}</span>
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span className={cn("flex min-w-0 items-center gap-1 truncate text-[13px]", naoLida ? "text-slate-800 dark:text-slate-200" : "text-slate-500 dark:text-slate-400")}>
            {c.ultimaDeMim && <CheckCheck className="size-4 shrink-0 text-sky-500" aria-label="Enviada" />}
            <span className="truncate">{previa || "—"}</span>
          </span>
          {naoLida && <span aria-label="Mensagem não lida" className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-[11px] font-bold text-white">{c.unread > 9 ? "9+" : c.unread}</span>}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1">
          <span className={cn("w-fit rounded-full border px-1.5 py-px text-[10px] font-medium", badgeStyles[c.status])}>{badgeLabel[c.status]}</span>
          {c.ia && <span title={c.ia.responde ? `IA responde: ${c.ia.motivo}` : `IA não responde: ${c.ia.motivo}`} className={cn("w-fit rounded-full border px-1.5 py-px text-[10px] font-medium", c.ia.responde ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-slate-500/30 bg-slate-500/10 text-slate-500 dark:text-slate-400")}>{c.ia.responde ? "🤖 IA" : "sem IA"}</span>}
          {tags.slice(0, 3).map((nome: string) => <span key={nome} className="w-fit rounded-full border border-violet-500/30 bg-violet-500/10 px-1.5 py-px text-[10px] font-medium text-violet-600 dark:text-violet-300">#{nome.toLowerCase()}</span>)}
        </span>
      </span>
    </button>
  )
}

export function InboxList() {
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const { conversas, selectedId, filtro, ordenacao, filtroOrigem, filtroStatus, filtroCorretor, setSelected, setFiltro, setOrdenacao, setFiltroOrigem, setFiltroStatus, setFiltroCorretor, filtroRapido, setFiltroRapido } = useInboxStore()
  const origensUnicas = Array.from(new Set(conversas.map(c=>c.origem))).filter(Boolean)
  const corretoresUnicos = Array.from(new Set(conversas.map(c=>c.responsavel))).filter(Boolean)
  const naoLidas = conversas.filter(c=> c.unread>0).length

  let filtradas = conversas.filter(c => {
    if(filtro){
      const q = filtro.toLowerCase()
      const soDigitos = filtro.replace(/\D/g,"")
      const achou = c.leadName.toLowerCase().includes(q)
        || (soDigitos.length>0 && c.telefone.replace(/\D/g,"").includes(soDigitos))
        || c.ultimaMensagem.toLowerCase().includes(q)
        || (c.tags||[]).some((t:any)=> String(typeof t==="string" ? t : t?.ref ?? "").toLowerCase().includes(q))
      if(!achou) return false
    }
    if(filtroRapido==="nao_lidas" && !(c.unread>0)) return false
    if(filtroRapido==="sem_ia" && !(c.ia && !c.ia.responde)) return false
    if(filtroOrigem!=="todas" && c.origem!==filtroOrigem) return false
    if(filtroStatus!=="todos" && c.status!==filtroStatus) return false
    if(filtroCorretor!=="todos" && c.responsavel!==filtroCorretor) return false
    return true
  })
  // ordenação
  const statusPeso: Record<string,number> = { aguardando_resposta:0, em_follow_up:1, respondido:2 }
  filtradas = [...filtradas].sort((a,b)=>{
    if(ordenacao==="recente") return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    if(ordenacao==="antigo") return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    if(ordenacao==="status") return (statusPeso[a.status]??9) - (statusPeso[b.status]??9)
    if(ordenacao==="origem") return a.origem.localeCompare(b.origem)
    if(ordenacao==="corretor") return a.responsavel.localeCompare(b.responsavel)
    if(ordenacao==="prioridade_ia"){
      const pa = (statusPeso[a.status]??9)*100000 + (a.unread? -10000:0) + (a.followUpAtivo? -5000:0)
      const pb = (statusPeso[b.status]??9)*100000 + (b.unread? -10000:0) + (b.followUpAtivo? -5000:0)
      if(pa!==pb) return pa - pb
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    }
    return 0
  })
  const parentRef = useRef<HTMLDivElement>(null)
  const shouldVirtualize = filtradas.length > 50
  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? filtradas.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 92,
    overscan: 5,
  })
  const filtrosAtivos = [filtroStatus!=="todos", filtroOrigem!=="todas", filtroCorretor!=="todos"].filter(Boolean).length

  return (
    <div role="navigation" aria-label="Inbox" className="flex h-full w-full flex-col overflow-hidden bg-white dark:bg-[#111b21] lg:w-[340px]">
      <div className="bg-[#f0f2f5] px-3 pb-2 pt-3 dark:bg-[#202c33]">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Conversas</h2>
          <button type="button" onClick={()=>setFiltrosAbertos(v=>!v)} aria-expanded={filtrosAbertos} aria-label="Filtros e ordenação" className={cn("relative rounded-full p-2 text-slate-600 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10", filtrosAbertos && "bg-black/5 dark:bg-white/10")}>
            <ListFilter className="size-5" />
            {filtrosAtivos>0 && <span className="absolute right-1 top-1 size-2 rounded-full bg-[#00a884]" />}
          </button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <input value={filtro} onChange={e=>setFiltro(e.target.value)} placeholder="Pesquisar conversas" aria-label="Buscar conversas" className="h-9 w-full rounded-lg border-0 bg-white pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-[#00a884]/40 dark:bg-[#111b21] dark:text-slate-100" />
        </div>
        <div role="group" aria-label="Filtros rápidos" className="mt-2 flex gap-1.5">
          {([["todas","Todas"],["nao_lidas",`Não lidas${naoLidas>0 ? ` (${naoLidas})` : ""}`],["sem_ia","Sem IA"]] as const).map(([v,l])=>(
            <button key={v} type="button" onClick={()=>setFiltroRapido(v)} aria-pressed={filtroRapido===v} className={cn("rounded-full px-3 py-1 text-xs font-medium transition", filtroRapido===v ? "bg-[#d9fdd3] text-[#005c4b] dark:bg-[#005c4b] dark:text-white" : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-[#111b21] dark:text-slate-300 dark:hover:bg-[#2a3942]")}>{l}</button>
          ))}
        </div>
        {filtrosAbertos && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <select value={ordenacao} onChange={e=>setOrdenacao(e.target.value as any)} aria-label="Ordenar" className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <option value="prioridade_ia">Prioridade IA</option>
              <option value="recente">Mais recente</option>
              <option value="antigo">Mais antigo</option>
              <option value="status">Por status (funil)</option>
              <option value="origem">Por origem</option>
              <option value="corretor">Por corretor</option>
            </select>
            <select value={filtroStatus} onChange={e=>setFiltroStatus(e.target.value)} aria-label="Filtrar status" className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <option value="todos">Status: todos</option>
              <option value="aguardando_resposta">Aguardando</option>
              <option value="em_follow_up">Follow-up</option>
              <option value="respondido">Respondido</option>
            </select>
            <select value={filtroOrigem} onChange={e=>setFiltroOrigem(e.target.value)} aria-label="Filtrar origem" className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <option value="todas">Origem: todas</option>
              {origensUnicas.map(o=> <option key={o} value={o}>{o}</option>)}
            </select>
            <select value={filtroCorretor} onChange={e=>setFiltroCorretor(e.target.value)} aria-label="Filtrar corretor" className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <option value="todos">Corretor: todos</option>
              {corretoresUnicos.map(c=> <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
      </div>
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        {filtradas.length===0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">{conversas.length===0 ? "Nenhuma conversa ainda." : "Nenhuma conversa encontrada."}</p>
        ) : shouldVirtualize ? (
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
            {virtualizer.getVirtualItems().map(v => {
              const c = filtradas[v.index]
              return <Linha key={c.id} c={c} ativa={selectedId===c.id} onClick={()=>setSelected(c.id)} style={{ position:"absolute", top:0, left:0, width:"100%", transform:`translateY(${v.start}px)` }} />
            })}
          </div>
        ) : filtradas.map(c=> <Linha key={c.id} c={c} ativa={selectedId===c.id} onClick={()=>setSelected(c.id)} />)}
      </div>
    </div>
  )
}

export function InboxSkeleton() {
  return (
    <div className="flex h-full w-full flex-col gap-3 bg-white p-3 dark:bg-[#111b21] lg:w-[340px]">
      {[1,2,3].map(i=> <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />)}
    </div>
  )
}
