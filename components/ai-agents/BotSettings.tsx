"use client"
import { useAIAgentsStore } from "@/lib/ai-agents-store"
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Select } from "@/components/ui/primitives"
import { Button } from "@/components/ui/button"

export function BotSettings({ id }: { id: string }){
  const agent = useAIAgentsStore(s=> s.agents.find(a=>a.id===id))
  const update = useAIAgentsStore(s=> s.updateAgent)
  if(!agent) return null
  return (
    <div className="grid gap-4">
      <Card><CardHeader><CardTitle>Identidade</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div><Label>Nome</Label><Input value={agent.name} onChange={e=>update(id,{name:e.target.value})} /></div>
          <div><Label>Descrição</Label><Input value={agent.description||""} onChange={e=>update(id,{description:e.target.value})} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Template</Label><Select value={agent.botTemplate} onChange={e=>update(id,{botTemplate:e.target.value as any})}><option value="vendas">Vendas</option><option value="locacao">Locação</option><option value="suporte">Suporte</option></Select></div>
            <div><Label>Modo</Label><Select value={agent.responseMode} onChange={e=>update(id,{responseMode:e.target.value as any})}><option value="auto">Auto</option><option value="sugestao">Sugestão</option></Select></div>
          </div>
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle>Canais & Limites</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-3 gap-3">
          <div><Label>Wait (ms)</Label><Input type="number" value={agent.waitTimeMs} onChange={e=>update(id,{waitTimeMs: parseInt(e.target.value)||0})} /></div>
          <div><Label>Cap Mensagens</Label><Input type="number" value={agent.messageCap} onChange={e=>update(id,{messageCap: parseInt(e.target.value)||0})} /></div>
          <div className="flex items-end"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={agent.isActive} onChange={e=>update(id,{isActive:e.target.checked})} /> Ativo</label></div>
        </CardContent>
      </Card>
    </div>
  )
}
