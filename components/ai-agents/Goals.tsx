"use client"
import { useAIAgentsStore } from "@/lib/ai-agents-store"
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea, Select, Badge } from "@/components/ui/primitives"
import { Button } from "@/components/ui/button"
import { Target, Plus, Trash2 } from "lucide-react"

export function Goals({ id }: { id: string }){
  const agent = useAIAgentsStore(s=> s.agents.find(a=>a.id===id))
  const update = useAIAgentsStore(s=> s.updateAgent)
  if(!agent) return null
  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600"><Target className="size-5" /></div>
        <div><h3 className="font-display text-base font-bold">Goals</h3><p className="text-xs text-muted-foreground">O que a IA deve conquistar em cada conversa (qualificação, agendamento...)</p></div>
      </div>
      <div className="grid gap-3">
        {agent.goals.length===0 && <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nenhum goal. Ex: Agendar visita,Qualificar budget...</p>}
        {agent.goals.map(g=>(
          <Card key={g.id} className="border-blue-500/20">
            <CardContent className="grid gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="grid flex-1 gap-1.5"><Label>Nome</Label><Input value={g.name} onChange={e=> update(id,{ goals: agent.goals.map(x=> x.id===g.id ? {...x, name:e.target.value}:x)})} /></div>
                <Button variant="outline" size="sm" onClick={()=> update(id,{ goals: agent.goals.filter(x=>x.id!==g.id)})}><Trash2 className="size-3" /></Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label>Tipo</Label><Select value={g.type} onChange={e=> update(id,{ goals: agent.goals.map(x=> x.id===g.id ? {...x, type:e.target.value}:x)})}><option value="qualification">Qualificação</option><option value="booking">Agendamento</option><option value="information">Informação</option></Select></div>
                <div className="flex items-end"><Badge variant={g.type==="booking"?"default":"outline"}>{g.type}</Badge></div>
              </div>
              <div className="grid gap-1.5"><Label>Prompt do goal</Label><Textarea rows={3} value={g.prompt} onChange={e=> update(id,{ goals: agent.goals.map(x=> x.id===g.id ? {...x, prompt:e.target.value}:x)})} placeholder="Ex: Pergunte disponibilidade para visita e confirme data/horário..." /></div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Button onClick={()=>{
        const nid=`g-${Date.now()}`
        update(id, { goals:[...agent.goals, {id:nid, name:"Novo Goal", type:"booking", prompt:"Pergunte..."}]})
      }}><Plus className="size-4" /> Novo Goal</Button>
    </div>
  )
}
