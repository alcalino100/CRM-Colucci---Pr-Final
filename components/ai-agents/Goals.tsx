"use client"
import { useAIAgentsStore } from "@/lib/ai-agents-store"
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea } from "@/components/ui/primitives"
import { Button } from "@/components/ui/button"

export function Goals({ id }: { id: string }){
  const agent = useAIAgentsStore(s=> s.agents.find(a=>a.id===id))
  const update = useAIAgentsStore(s=> s.updateAgent)
  if(!agent) return null
  return (
    <div className="grid gap-4">
      <Card><CardHeader><CardTitle>Goals</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          {agent.goals.map(g=>(
            <div key={g.id} className="rounded-lg border border-border p-3">
              <p className="text-sm font-medium">{g.name} ({g.type})</p>
              <p className="text-xs text-muted-foreground">{g.prompt}</p>
            </div>
          ))}
          <Button variant="outline" onClick={()=>{
            const nid=`g-${Date.now()}`
            update(id, { goals:[...agent.goals, {id:nid, name:"Novo Goal", type:"qualification", prompt:"Pergunte..."}]})
          }}>+ Novo Goal</Button>
        </CardContent>
      </Card>
    </div>
  )
}
