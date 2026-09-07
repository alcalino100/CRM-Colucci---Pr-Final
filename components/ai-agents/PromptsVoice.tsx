"use client"
import { useAIAgentsStore } from "@/lib/ai-agents-store"
import { Card, CardContent, CardHeader, CardTitle, Label, Textarea, Input } from "@/components/ui/primitives"

export function PromptsVoice({ id }: { id: string }){
  const agent = useAIAgentsStore(s=> s.agents.find(a=>a.id===id))
  const update = useAIAgentsStore(s=> s.updateAgent)
  if(!agent) return null
  return (
    <div className="grid gap-4">
      <Card><CardHeader><CardTitle>System Prompt</CardTitle></CardHeader>
        <CardContent className="grid gap-2">
          <Label>Prompt Principal</Label><Textarea rows={6} value={agent.systemPrompt} onChange={e=>update(id,{systemPrompt:e.target.value})} />
          <Label>Instruções Adicionais</Label><Textarea rows={3} value={agent.additionalInstructions} onChange={e=>update(id,{additionalInstructions:e.target.value})} />
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle>Voz da Marca</CardTitle></CardHeader>
        <CardContent className="grid gap-2">
          <Label>Brand Voice</Label><Input value={agent.brandVoice} onChange={e=>update(id,{brandVoice:e.target.value})} />
          <p className="text-xs text-muted-foreground">Ex: Profissional, acolhedora, objetiva — usado para guiar tom da IA</p>
        </CardContent>
      </Card>
    </div>
  )
}
