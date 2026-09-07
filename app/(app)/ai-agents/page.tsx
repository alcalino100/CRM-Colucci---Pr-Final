"use client"
import Link from "next/link"
import { useAIAgentsStore } from "@/lib/ai-agents-store"
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/primitives"
import { Button } from "@/components/ui/button"
import { Bot, Plus } from "lucide-react"

export default function AIAgentsList(){
  const agents = useAIAgentsStore(s=>s.agents)
  const create = useAIAgentsStore(s=>s.createAgent)
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold">IA Conversacional</h1>
          <p className="text-sm text-muted-foreground">Gerencie agentes para reativação e follow-up (Patrícia)</p>
        </div>
        <Button onClick={()=>{
          const id=`ai_${Date.now()}`
          create({ id, name:"Novo Agente", description:"", botTemplate:"vendas", channels:["whatsapp"], responseMode:"auto", waitTimeMs:2000, messageCap:10, isActive:false, systemPrompt:"Você é assistente...", additionalInstructions:"", brandVoice:"Profissional", goals:[], knowledgeBase: undefined })
        }}><Plus className="size-4" /> Novo Agente</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {agents.map(a=>(
          <Link key={a.id} href={`/ai-agents/${a.id}`}>
            <Card className="hover:border-primary/30 transition">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><Bot className="size-4 text-cyan-500" /> {a.name} {a.isActive && <Badge className="bg-emerald-500 text-white">Ativo</Badge>}</CardTitle>
                <p className="text-xs text-muted-foreground">{a.description}</p>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                <p>Template: {a.botTemplate} · Canais: {a.channels.join(", ")} · {a.goals.length} goals</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
