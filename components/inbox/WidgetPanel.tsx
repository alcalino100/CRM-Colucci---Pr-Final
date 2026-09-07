"use client"
import { useInboxStore } from "@/lib/inbox-store"
import { useToast } from "@/components/ui/primitives"

export function WidgetPanel(){
  const { conversas, selectedId, criarFollowUp, cancelarFollowUp } = useInboxStore()
  const toast = useToast()
  const conv = conversas.find(c=>c.id===selectedId) || null
  if(!conv){
    return <div className="hidden w-[240px] shrink-0 flex-col gap-3 lg:flex"><div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">Selecione um lead</div></div>
  }
  const proxima = conv.proximaTentativaISO ? new Date(conv.proximaTentativaISO).toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit"}) : "-"
  return (
    <div className="flex w-full shrink-0 flex-col gap-3 lg:w-[240px]">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-2 font-display text-sm font-bold text-slate-100">Lead Details</h3>
        <p className="text-sm font-medium text-slate-100">{conv.leadName}</p>
        <p className="text-xs text-slate-400">{conv.telefone}</p>
        <p className="text-xs text-slate-400">{conv.email}</p>
        <p className="mt-2 text-xs text-slate-400">Responsável: <span className="text-slate-200">{conv.responsavel}</span></p>
        <p className="text-xs text-slate-400">Origem: <span className="text-slate-200">{conv.origem}</span></p>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-2 font-display text-sm font-bold text-slate-100">Follow-up Status</h3>
        {conv.followUpAtivo ? (
          <>
            <p className="text-xs text-amber-300">🤖 IA respondendo</p>
            <p className="text-xs text-slate-400">Tentativas restantes: <span className="text-slate-100">{conv.tentativasRestantes}</span></p>
            <p className="text-xs text-slate-400">Próxima em: <span className="text-slate-100">{proxima}</span></p>
          </>
        ) : <p className="text-xs text-slate-400">Sem follow-up ativo</p>}
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-2 font-display text-sm font-bold text-slate-100">Ações Rápidas</h3>
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
