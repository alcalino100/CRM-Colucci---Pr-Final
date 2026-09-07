"use client"
import { useInboxStore } from "@/lib/inbox-store"
import { useToast } from "@/components/ui/primitives"

export function WidgetPanel(){
  const { conversas, mensagens, selectedId, criarFollowUp, cancelarFollowUp } = useInboxStore()
  const toast = useToast()
  const conv = conversas.find(c=>c.id===selectedId) || null
  if(!conv){
    // IA: mostra próximos da reativação quando nada selecionado
    const statusPeso: Record<string,number> = { aguardando_resposta:0, em_follow_up:1, respondido:2 }
    const prioritarios = [...conversas].sort((a,b)=>{
      const pa=(statusPeso[a.status]??9)*100000 + (a.unread? -10000:0)
      const pb=(statusPeso[b.status]??9)*100000 + (b.unread? -10000:0)
      if(pa!==pb) return pa-pb
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    }).slice(0,3)
    return (
      <div className="hidden w-[240px] shrink-0 flex-col gap-3 lg:flex">
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Selecione um lead</div>
        {prioritarios.length>0 && (
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3">
            <h4 className="mb-2 text-xs font-bold text-cyan-700 dark:text-cyan-300">🤖 IA — atender primeiro</h4>
            <div className="flex flex-col gap-1.5">
              {prioritarios.map(p=>(
                <div key={p.id} className="rounded-lg bg-white px-2 py-1.5 text-xs dark:bg-slate-800">
                  <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{p.leadName}</p>
                  <p className="text-[11px] text-slate-500">{p.status.replace("_"," ")} · {p.origem} · {new Date(p.timestamp).toLocaleDateString("pt-BR")}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-400">Ordenado por funil + recência + histórico</p>
          </div>
        )}
      </div>
    )
  }
  const proxima = conv.proximaTentativaISO ? new Date(conv.proximaTentativaISO).toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit"}) : "-"
  return (
    <div className="flex w-full shrink-0 flex-col gap-3 lg:w-[240px]">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-2 font-display text-sm font-bold text-slate-900 dark:text-slate-100" style={{fontFamily:"var(--font-inter)"}}>Lead Details</h3>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{conv.leadName}</p>
        <p className="text-xs text-slate-600 dark:text-slate-400">{conv.telefone}</p>
        <p className="text-xs text-slate-600 dark:text-slate-400">{conv.email}</p>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Responsável: <span className="text-slate-700 dark:text-slate-200">{conv.responsavel}</span></p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Origem: <span className="text-slate-700 dark:text-slate-200">{conv.origem}</span></p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-2 font-display text-sm font-bold text-slate-900 dark:text-slate-100" style={{fontFamily:"var(--font-inter)"}}>Follow-up Status</h3>
        {conv.followUpAtivo ? (
          <>
            <p className="text-xs text-amber-300">🤖 IA respondendo</p>
            <p className="text-xs text-slate-400">Tentativas restantes: <span className="text-slate-100">{conv.tentativasRestantes}</span></p>
            <p className="text-xs text-slate-400">Próxima em: <span className="text-slate-100">{proxima}</span></p>
          </>
        ) : <p className="text-xs text-slate-400">Sem follow-up ativo</p>}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-2 font-display text-sm font-bold text-slate-900 dark:text-slate-100" style={{fontFamily:"var(--font-inter)"}}>Ações Rápidas</h3>
        <div className="flex flex-col gap-2">
          <button onClick={()=>{
            if(conv.followUpAtivo){ cancelarFollowUp(conv.id); toast("Follow-up cancelado")}
            else { criarFollowUp(conv.id); toast("Follow-up criado")}
          }} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-slate-700 border border-slate-700">
            {conv.followUpAtivo ? "Cancelar Follow-up Manual" : "Criar Follow-up Manual"}
          </button>
          <button onClick={()=> toast("Transferência simulada", "error")} className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-400 hover:bg-cyan-500/20">Transferir para vendedora</button>
        </div>
      </div>
    </div>
  )
}
