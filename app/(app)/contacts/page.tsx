"use client"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { isGestorNivel, podeVendas } from "@/lib/roles"
import { supabase } from "@/lib/supabase/client"
import { useInboxStore } from "@/lib/inbox-store"
import { InstanceSelector } from "@/components/inbox/InstanceSelector"
import { isTelefoneBloqueado } from "@/lib/telefones-bloqueados"

export default function ContactsPage(){
  const { user } = useAuth()
  const instancia = useInboxStore(s=>s.instanciaSelecionada)
  const isGestorVendas = !!user && isGestorNivel(user.role) && podeVendas(user.role)
  const [leads, setLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(()=>{
    if(!isGestorVendas) { setLoading(false); return}
    // mapeia instance -> corretor_id
    fetch("/api/whatsapp/instancias").then(r=>r.json()).then(async j=>{
      const inst = (j.data||[]).find((x:any)=>x.instance_name===instancia)
      const corretorId = inst?.corretor_id
      if(!corretorId) { setLeads([]); setLoading(false); return}
      const { data } = await supabase.from("leads").select("id,nome,telefone,email,origem,status").eq("corretor_id", corretorId).eq("origem","Tráfego Pago").limit(200)
      const filtrados = (data||[]).filter(l=> !isTelefoneBloqueado(l.telefone||""))
      setLeads(filtrados)
      setLoading(false)
    }).catch(()=>setLoading(false))
  }, [instancia, isGestorVendas])

  if(!isGestorVendas) return <div className="p-8 text-center text-sm text-muted-foreground">Acesso restrito a gestores de Vendas</div>
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">Contacts — {instancia}</h1>
        <InstanceSelector />
      </div>
      <p className="text-sm text-muted-foreground">Somente Tráfego Pago da instância selecionada (para IA não ver outras pessoas)</p>
      {loading ? <div className="h-32 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /> : leads.length===0 ? <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhum contato com Tráfego Pago nesta instância</div> : (
        <div className="grid gap-2 md:grid-cols-2">
          {leads.map(l=>(
            <div key={l.id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{l.nome}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">{l.telefone} · {l.email}</p>
              <p className="text-xs text-slate-500">{l.origem} · {l.status}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
