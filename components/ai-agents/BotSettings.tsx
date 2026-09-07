"use client"
import { useAIAgentsStore } from "@/lib/ai-agents-store"
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Textarea } from "@/components/ui/primitives"
import { Bot, Zap, MessageCircle, Clock } from "lucide-react"

export function BotSettings({ id }: { id: string }){
  const agent = useAIAgentsStore(s=> s.agents.find(a=>a.id===id))
  const update = useAIAgentsStore(s=> s.updateAgent)
  if(!agent) return null
  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600"><Bot className="size-5" /></div>
        <div>
          <h3 className="font-display text-base font-bold">Identidade do Agente</h3>
          <p className="text-xs text-muted-foreground">Defina quem é sua IA e como ela se apresenta para reativação da Patrícia</p>
        </div>
      </div>

      <Card className="border-cyan-500/20">
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Bot className="size-4" /> Perfil</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5"><Label>Nome da IA *</Label><Input value={agent.name} onChange={e=>update(id,{name:e.target.value})} placeholder="Ex: Patrícia - Reativação" className="font-medium" /></div>
          <div className="grid gap-1.5"><Label>Descrição curta</Label><Textarea rows={2} value={agent.description||""} onChange={e=>update(id,{description:e.target.value})} placeholder="Ex: IA para reativar base fria de Tráfego Pago via WhatsApp" /></div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="grid gap-1.5"><Label>Template</Label><Select value={agent.botTemplate} onChange={e=>update(id,{botTemplate:e.target.value as any})}><option value="vendas">Vendas</option><option value="locacao">Locação</option><option value="suporte">Suporte</option></Select></div>
            <div className="grid gap-1.5"><Label>Modo de resposta</Label><Select value={agent.responseMode} onChange={e=>update(id,{responseMode:e.target.value as any})}><option value="auto">Automático (responde sozinha)</option><option value="sugestao">Sugestão (humano aprova)</option></Select></div>
            <div className="grid gap-1.5"><Label>Status</Label><label className="flex h-10 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm"><input type="checkbox" checked={agent.isActive} onChange={e=>update(id,{isActive:e.target.checked})} className="rounded text-cyan-500" /> <span className={agent.isActive?"text-emerald-600 font-medium":"text-muted-foreground"}>{agent.isActive?"Ativa - respondendo":"Pausada"}</span></label></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><MessageCircle className="size-4" /> Canais & Comportamento</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="grid gap-1.5"><Label className="flex items-center gap-1.5"><Clock className="size-3" /> Espera antes de responder (ms)</Label><Input type="number" value={agent.waitTimeMs} onChange={e=>update(id,{waitTimeMs: parseInt(e.target.value)||0})} /></div>
            <div className="grid gap-1.5"><Label>Limite de mensagens por conversa</Label><Input type="number" value={agent.messageCap} onChange={e=>update(id,{messageCap: parseInt(e.target.value)||0})} /></div>
            <div className="grid gap-1.5"><Label>Instância WhatsApp para teste</Label><Select value={(agent as any).testInstance || "patricia-6c2875b4"} onChange={e=>update(id,{testInstance:e.target.value} as any)}><option value="patricia-6c2875b4">Patrícia (5518991976332)</option><option value="teste-separada">Instância de teste (separada)</option></Select></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["whatsapp","instagram","site"] as const).map(ch=>(
              <label key={ch} className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs">
                <input type="checkbox" checked={agent.channels.includes(ch)} onChange={e=>{
                  const next = e.target.checked ? [...agent.channels, ch] : agent.channels.filter(c=>c!==ch)
                  update(id,{channels: next as any})
                }} /> {ch}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Zap className="size-4 text-amber-500" /> API da IA (para teste real)</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1.5"><Label>Modelo</Label><Select value={(agent as any).modelName || "gpt-4o-mini"} onChange={e=>update(id,{modelName:e.target.value} as any)}><option value="gpt-4o-mini">gpt-4o-mini (barato, rápido)</option><option value="gpt-4o">gpt-4o</option><option value="claude-3-5-sonnet">claude-3-5-sonnet</option></Select></div>
          <div className="grid gap-1.5"><Label>API Endpoint (opcional)</Label><Input value={(agent as any).apiEndpoint || ""} onChange={e=>update(id,{apiEndpoint:e.target.value} as any)} placeholder="https://api.openai.com/v1 (deixe vazio para OpenAI)" /></div>
          <div className="grid gap-1.5"><Label>API Token / Chave *</Label><Input type="password" value={(agent as any).apiToken || ""} onChange={e=>update(id,{apiToken:e.target.value} as any)} placeholder="sk-... ou GEMINI_API_KEY" /><p className="text-xs text-muted-foreground">Criptografado com AES-256 antes de salvar. Deixe vazio para usar GEMINI_API_KEY do servidor.</p></div>
        </CardContent>
      </Card>
    </div>
  )
}
