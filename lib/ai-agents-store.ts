"use client"
import { create } from "zustand"
import { mockAgents, type AIAgent } from "./ai-agents-mock"

type Store = {
  agents: AIAgent[]
  selectedId: string | null
  setSelected: (id:string|null)=>void
  createAgent: (a: AIAgent)=>void
  updateAgent: (id:string, patch:Partial<AIAgent>)=>void
  deleteAgent: (id:string)=>void
}

export const useAIAgentsStore = create<Store>(set=>({
  agents: mockAgents,
  selectedId: null,
  setSelected: (id)=> set({selectedId:id}),
  createAgent: (a)=> set(s=>({ agents:[...s.agents, a]})),
  updateAgent: (id,patch)=> set(s=>({ agents: s.agents.map(a=> a.id===id ? {...a, ...patch}:a)})),
  deleteAgent: (id)=> set(s=>({ agents: s.agents.filter(a=>a.id!==id)})),
}))
