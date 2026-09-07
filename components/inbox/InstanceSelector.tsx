"use client"
import { useEffect, useState } from "react"
import { useInboxStore } from "@/lib/inbox-store"
import { Select } from "@/components/ui/primitives"

type Inst = { instance_name: string; corretorNome: string; status: string }

export function InstanceSelector(){
  const instancia = useInboxStore(s=>s.instanciaSelecionada)
  const setInstancia = useInboxStore(s=>s.setInstancia)
  const [lista, setLista] = useState<Inst[]>([])

  useEffect(()=>{
    // restaura do localStorage
    try{
      const saved = localStorage.getItem("inbox-instancia")
      if(saved && saved!==instancia) setInstancia(saved)
    }catch{}
    fetch("/api/whatsapp/instancias")
      .then(r=>r.json())
      .then(j=>{
        const data: Inst[] = (j.data || []).filter((x:any)=> x.status==="conectado")
        // filtra só quem tem vendas (mantém patricia sempre)
        setLista(data)
        if(data.length && !data.find(d=>d.instance_name===instancia)){
          // se instancia salva não existe mais, volta para patricia
          // não força, só mantém
        }
      }).catch(()=>{})
  },[])

  if(lista.length===0) return null
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900">
      <span className="font-medium text-slate-600 dark:text-slate-300">Instância:</span>
      <Select value={instancia} onChange={e=>setInstancia(e.target.value)} className="h-8 w-auto min-w-[180px] text-xs">
        {lista.map(i=> <option key={i.instance_name} value={i.instance_name}>{i.corretorNome} — {i.instance_name}</option>)}
      </Select>
    </div>
  )
}
