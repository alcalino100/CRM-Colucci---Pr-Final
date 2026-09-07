"use client"
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea, Badge } from "@/components/ui/primitives"
import { Button } from "@/components/ui/button"
import { useAIAgentsStore } from "@/lib/ai-agents-store"
import { AlertTriangle, ArrowUpCircle, Bell } from "lucide-react"

export function Escalation({ id }: { id: string }){
  const agent = useAIAgentsStore(s=> s.agents.find(a=>a.id===id))
  if(!agent) return null
  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600"><AlertTriangle className="size-5" /></div>
        <div><h3 className="font-display text-base font-bold">Escalation & Handoff</h3><p className="text-xs text-muted-foreground">Quando a IA passa para humano (Patrícia) e como avisa</p></div>
      </div>
      <Card className="border-amber-500/20">
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><ArrowUpCircle className="size-4" /> Regras de Handoff</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1.5"><Label>Mensagem de handoff</Label><Textarea rows={3} defaultValue="Se detectar 'humano', 'atendente', frustração ou 10+ turnos, escalar para Patrícia com: 'Deixe-me conectar você com a Patrícia...'" /></div>
          <div className="flex flex-wrap gap-1.5">
            {["humano","atendente","frustrado","10+ turnos","palavrão"].map(k=> <Badge key={k} variant="outline" className="text-xs">{k}</Badge>)}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Bell className="size-4" /> Notificação</CardTitle></CardHeader>
        <CardContent className="grid gap-2">
          <Label>Notificar em</Label><Input placeholder="WhatsApp da Patrícia, Slack #vendas, e-mail" defaultValue="WhatsApp Patrícia (5518991976332)" />
          <p className="text-xs text-muted-foreground">Quando escalar, a conversa no Inbox fica com badge vermelho `escalado` e IA pausa.</p>
          <Button variant="outline">+ Adicionar Trigger (ex: keyword 'cancelar')</Button>
        </CardContent>
      </Card>
    </div>
  )
}
