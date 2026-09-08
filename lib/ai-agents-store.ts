"use client"
import { create } from "zustand"
import { mockAgents, type AIAgent } from "./ai-agents-mock"

type Store = {
  agents: AIAgent[]
  selectedId: string | null
  loaded: boolean
  setSelected: (id:string|null)=>void
  createAgent: (a: AIAgent)=>void
  updateAgent: (id:string, patch:Partial<AIAgent>)=>void
  deleteAgent: (id:string)=>void
  loadAgents: ()=>Promise<void>
}

async function persist(id:string, patch:Partial<AIAgent>){
  try{
    // goals vai para tabela própria
    if((patch as any).goals){
      await fetch(`/api/ai/${id}/goals`, { method:"PUT", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ goals: (patch as any).goals })})
      const { goals, ...rest } = patch as any
      if(Object.keys(rest).length===0) return
      await fetch(`/api/ai/${id}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body: JSON.stringify(rest)})
      return
    }
    await fetch(`/api/ai/${id}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body: JSON.stringify(patch)})
  }catch{}
}

export const useAIAgentsStore = create<Store>((set, get)=>({
  agents: mockAgents,
  selectedId: null,
  loaded: false,
  setSelected: (id)=> set({selectedId:id}),
  createAgent: async (a)=> {
    set(s=>({ agents:[...s.agents, a]}))
    try{ await fetch("/api/ai", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(a)}) }catch{}
  },
  updateAgent: (id,patch)=> {
    set(s=>({ agents: s.agents.map(a=> a.id===id ? {...a, ...patch}:a)}))
    // persiste em background (não bloqueia UI, mas garante que refresh mantém)
    persist(id, patch)
  },
  deleteAgent: (id)=> {
    set(s=>({ agents: s.agents.filter(a=>a.id!==id)}))
    fetch(`/api/ai/${id}`, { method:"DELETE"}).catch(()=>{})
  },
  loadAgents: async ()=>{
    if(get().loaded) return
    try{
      const r = await fetch("/api/ai")
      const j = await r.json()
      if(Array.isArray(j) && j.length>0){
        // busca goals e KB para cada agente
        const mapped: AIAgent[] = await Promise.all(j.map(async (row:any)=>{
          const goalsRes = await fetch(`/api/ai/${row.id}/goals`).then(x=>x.json()).catch(()=>[])
          const goals = Array.isArray(goalsRes) ? goalsRes.map((g:any)=> ({ id:g.id, name:g.name, type:g.type, prompt:g.prompt })) : []
          // KB
          let kb: any = undefined
          try{
            const kbRes = await fetch(`/api/ai/${row.id}/knowledge-base`).then(x=>x.json())
            if(kbRes?.id) kb = { id: kbRes.id, name: kbRes.name, documents: kbRes.documents || [] }
          }catch{}
          return {
            id: row.id,
            name: row.name,
            description: row.description || "",
            botTemplate: row.bot_template || "vendas",
            channels: row.channels || ["whatsapp"],
            responseMode: row.response_mode || "auto",
            waitTimeMs: row.wait_time_ms ?? 2000,
            messageCap: row.message_cap ?? 10,
            isActive: !!row.is_active,
            systemPrompt: row.system_prompt || "",
            additionalInstructions: row.additional_instructions || "",
            brandVoice: row.brand_voice || "",
            goals,
            knowledgeBase: kb,
            apiToken: row.api_token || "",
            apiEndpoint: row.api_endpoint || "",
            modelName: row.model_name || "gemini-1.5-flash",
            testInstance: row.config?.testInstance || "patricia-6c2875b4",
            rules: row.config?.rules || undefined,
          } as any
        }))
        set({ agents: mapped, loaded:true })
      } else {
        set({ loaded:true })
      }
    }catch{
      set({ loaded:true })
    }
  }
}))

if(typeof window!=="undefined"){
  setTimeout(()=> useAIAgentsStore.getState().loadAgents(), 100)
}
