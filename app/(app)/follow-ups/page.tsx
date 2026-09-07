"use client"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { isGestorNivel, podeVendas } from "@/lib/roles"
import { supabase } from "@/lib/supabase/client"
import { useInboxStore } from "@/lib/inbox-store"
import { InstanceSelector } from "@/components/inbox/InstanceSelector"

export default function FollowUpsPage(){
  const { user } = useAuth()
  const instancia = useInboxStore(s=>s.instanciaSelecionada)
  const isGestorVendas = !!user && isGestorNivel(user.role) && podeVendas(user.role)
  const [leads, setLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(()=>{
    if(!isGestorVendas) { setLoading(false); return}
    fetch("/api/whatsapp/instancias").then(r=>r.json()).then(async j=>{
      const inst = (j.data||[]).find((x:any)=>x.instance_name===instancia)
      const corretorId = inst?.corretor_id
      if(!corretorId) { setLeads([]); setLoading(false); return}
      const { data } = await supabase.from("leads").select("id,nome,telefone,origem,status,atualizado_em").eq("corretor_id", corretorId).eq("origem","Tráfego Pago").eq("status","em_followup").limit(100)
      setLeads(data||[])
      setLoading(false)
    }).catch(()=>setLoading(false))
  }, [instancia, isGestorVendas])

  if(!isGestorVendas) return <div className="p-8 text-center text-sm text-muted-foreground">Acesso restrito a gestores de Vendas</div>
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">Follow-ups — {instancia}</h1>
        <InstanceSelector />
      </div>
      <p className="text-sm text-muted-foreground">Histórico de follow-ups automáticos (status em_followup) da instância selecionada</p>
      {loading ? <div className="h-32 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /> : leads.length===0 ? <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhum follow-up ativo com Tráfego Pago nesta instância</div> : (
        <div className="flex flex-col gap-2">
          {leads.map(l=>(
            <div key={l.id} className="flex items-center justify-between rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{l.nome} — {l.telefone}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Origem: {l.origem} · Atualizado: {new Date(l.atualizado_em).toLocaleDateString("pt-BR")}</p>
              </div>
              <span className="rounded-full bg-amber-500 px-2 py-1 text-xs font-bold text-white">🤖 {l.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
