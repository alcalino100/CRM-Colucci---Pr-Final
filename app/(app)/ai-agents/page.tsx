"use client"
import Link from "next/link"
import { useAIAgentsStore } from "@/lib/ai-agents-store"
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/primitives"
import { Button } from "@/components/ui/button"
import { Bot, Plus, Pause, Play } from "lucide-react"

export default function AIAgentsList(){
  const agents = useAIAgentsStore(s=>s.agents)
  const create = useAIAgentsStore(s=>s.createAgent)
  const updateAgent = useAIAgentsStore(s=>s.updateAgent)
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
          <Card key={a.id} className="relative overflow-visible transition hover:border-primary/30">
            <CardHeader className="pb-2 pr-24">
              <CardTitle className="flex items-center gap-2 text-base"><Bot className="size-4 text-cyan-500" /> {a.name} {a.isActive && <Badge className="bg-emerald-500 text-white">Ativo</Badge>}</CardTitle>
              <p className="text-xs text-muted-foreground">{a.description}</p>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              <p>Template: {a.botTemplate} · Canais: {a.channels.join(", ")} · {a.goals.length} goals</p>
            </CardContent>
            <div className="absolute right-3 top-3 flex gap-1.5">
              <Button
                size="sm"
                variant={a.isActive ? "outline" : "default"}
                className={a.isActive ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100" : "bg-emerald-600 text-white hover:bg-emerald-700"}
                onClick={(e)=>{ e.stopPropagation(); updateAgent(a.id, { isActive: !a.isActive }) }}
              >
                {a.isActive ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                {a.isActive ? "Pausar" : "Retomar"}
              </Button>
              <Link href={`/ai-agents/${a.id}`}>
                <Button size="sm" variant="outline">Editar</Button>
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}