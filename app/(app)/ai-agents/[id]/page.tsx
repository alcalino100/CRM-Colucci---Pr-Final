"use client"
import { useState, use } from "react"
import Link from "next/link"
import { useAIAgentsStore } from "@/lib/ai-agents-store"
import { BotSettings } from "@/components/ai-agents/BotSettings"
import { KnowledgeBase } from "@/components/ai-agents/KnowledgeBase"
import { PromptsVoice } from "@/components/ai-agents/PromptsVoice"
import { Goals } from "@/components/ai-agents/Goals"
import { Escalation } from "@/components/ai-agents/Escalation"
import { Testing } from "@/components/ai-agents/Testing"
import { Analytics } from "@/components/ai-agents/Analytics"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"

const TABS = [
  { id:"bot", label:"Bot Settings" },
  { id:"kb", label:"Knowledge Base" },
  { id:"prompts", label:"Prompts & Voz" },
  { id:"goals", label:"Goals" },
  { id:"escalation", label:"Escalation" },
  { id:"testing", label:"Testing" },
  { id:"analytics", label:"Analytics" },
] as const

export default function AIAgentEditor({ params }: { params: Promise<{id:string}> }){
  const { id } = use(params)
  const agent = useAIAgentsStore(s=> s.agents.find(a=>a.id===id))
  const [tab, setTab] = useState<typeof TABS[number]["id"]>("bot")
  if(!agent) return <div className="p-8 text-center text-sm text-muted-foreground">Agente não encontrado. <Link href="/ai-agents" className="text-cyan-600 underline">Voltar</Link></div>
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link href="/ai-agents" className="rounded-md p-2 hover:bg-muted"><ArrowLeft className="size-4" /></Link>
        <div>
          <h1 className="font-display text-lg font-bold">{agent.name}</h1>
          <p className="text-xs text-muted-foreground">{agent.id} · {agent.isActive ? "Ativo" : "Inativo"}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} className={`px-3 py-2 text-xs font-medium border-b-2 transition ${tab===t.id ? "border-cyan-500 text-cyan-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
        ))}
      </div>
      <div className="pt-2">
        {tab==="bot" && <BotSettings id={id} />}
        {tab==="kb" && <KnowledgeBase id={id} />}
        {tab==="prompts" && <PromptsVoice id={id} />}
        {tab==="goals" && <Goals id={id} />}
        {tab==="escalation" && <Escalation id={id} />}
        {tab==="testing" && <Testing id={id} />}
        {tab==="analytics" && <Analytics id={id} />}
      </div>
    </div>
  )
}
