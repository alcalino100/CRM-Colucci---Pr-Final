"use client"
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea } from "@/components/ui/primitives"
import { Button } from "@/components/ui/button"
import { useAIAgentsStore } from "@/lib/ai-agents-store"

export function Escalation({ id }: { id: string }){
  const agent = useAIAgentsStore(s=> s.agents.find(a=>a.id===id))
  if(!agent) return null
  return (
    <div className="grid gap-4">
      <Card><CardHeader><CardTitle>Escalation & Handoff</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <Label>Regras de Handoff</Label><Textarea rows={4} placeholder="Ex: se lead disser 'quero falar com humano' ou detectar frustração..." defaultValue="Se detectar 'humano', 'atendente', ou 10+ turnos, escalar para Patricia" />
          <Label>Notificar em</Label><Input placeholder="Slack, Email, WhatsApp da Patrícia" />
          <Button variant="outline">Adicionar Trigger</Button>
        </CardContent>
      </Card>
    </div>
  )
}
