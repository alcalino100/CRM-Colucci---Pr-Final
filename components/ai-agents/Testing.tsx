"use client"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea, Badge, Select } from "@/components/ui/primitives"
import { Button } from "@/components/ui/button"
import { FlaskConical, Send, RotateCcw, CheckCircle, XCircle, Smile, Trash2, Plus } from "lucide-react"
import { useAIAgentsStore } from "@/lib/ai-agents-store"

type Turn = { role:"lead"|"ia"; content:string; meta?:{ tokens?:number; model?:string; escalated?:boolean; reason?:string; severity?:string; ms?:number } }

export function Testing({ id }: { id: string }){
  const agent = useAIAgentsStore(s=> s.agents.find(a=>a.id===id))
  const update = useAIAgentsStore(s=> s.updateAgent)
  const [convId, setConvId] = useState<string|null>(null)
  const [historico, setHistorico] = useState<Turn[]>([])
  const [msg, setMsg] = useState("Olá, ainda tem aquele apê de 2 quartos?")
  const [loading, setLoading] = useState(false)
  const [validado, setValidado] = useState<null|"aprovado"|"reprovado">(null)
  const [diversao, setDiversao] = useState(30) // 0 sério, 100 divertido
  const [infoExtra, setInfoExtra] = useState("")

  if(!agent) return null

  const enviar = async()=>{
    if(!msg.trim()) return
    const textoEnviado = msg
    const novoLead: Turn = { role:"lead", content: textoEnviado }
    setHistorico(h=> [...h, novoLead])
    setMsg("")
    setLoading(true)
    setValidado(null)
    try{
      let cId = convId
      if(!cId){
        const r = await fetch("/api/conversations", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ aiId: id, contactId: "test_"+Date.now(), channel:"test", testMode: true }) })
        if(!r.ok) throw new Error("falha ao criar conversa")
        const j=await r.json(); cId=j.id; setConvId(cId)
      }
      const t0 = Date.now()
      const r = await fetch(`/api/conversations/${cId}/messages`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ message: textoEnviado, aiId: id }) })
      const j = await r.json()
      if(!r.ok) throw new Error(j.error || "IA falhou")
      const ms = j.executionTimeMs ?? (Date.now() - t0)
      // usa modelo real retornado para fixação
      setHistorico(h=> [...h, { role:"ia", content: j.aiMessage?.content, meta:{ tokens: j.aiMessage?.metadata?.tokensUsed, model: j.aiMessage?.metadata?.model, escalated: j.escalated, reason: j.escalationReason ?? j.aiMessage?.metadata?.trigger, severity: j.severity ?? j.aiMessage?.metadata?.severity, ms }}])
    }catch(e:any){
      // não faz fallback silencioso para mock quando já houve resposta real antes — mostra erro real
      const isFirstTurn = historico.length===1 // só lead + falha = primeiro turno
      if(isFirstTurn){
        const tom = diversao>60 ? "😄 super descontraída e divertida" : diversao>30 ? "acolhedora e leve" : "profissional e objetiva"
        const extra = infoExtra ? `\n[Info extra considerada: ${infoExtra}]` : ""
        setHistorico(h=> [...h, { role:"ia", content:`[Mock IA ${agent.name} - ${tom}] Olá! Entendi: "${textoEnviado}". Posso te ajudar com visita?${extra} (erro real: ${e.message})`, meta:{tokens:42, model:"mock"}}])
      } else {
        setHistorico(h=> [...h, { role:"ia", content:`[Erro IA] ${e.message} — tente novamente ou troque o modelo em Bot Settings.`, meta:{tokens:0, model:"erro"}}])
      }
    }finally{
      setLoading(false)
    }
  }

  const reset = async ()=>{
    if(convId){
      try { await fetch(`/api/conversations/${convId}`, { method:"DELETE" }) } catch { /* limpeza best-effort */ }
    }
    setHistorico([]); setConvId(null); setValidado(null)
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600"><FlaskConical className="size-5" /></div>
          <div><h3 className="font-display text-base font-bold">Teste de Fluxo Completo</h3><p className="text-xs text-muted-foreground">Simule toda a conversa, ajuste e valide antes de ir para WhatsApp</p></div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={reset}><RotateCcw className="size-3" /> Resetar</Button>
          {historico.length>0 && (
            <>
              <Button variant="outline" size="sm" onClick={()=>setValidado("aprovado")} className="border-emerald-500/20 text-emerald-600"><CheckCircle className="size-3" /> Validar ✓</Button>
              <Button variant="outline" size="sm" onClick={()=>setValidado("reprovado")} className="border-red-500/20 text-red-600"><XCircle className="size-3" /> Reprovar</Button>
            </>
          )}
        </div>
      </div>

      {validado && <div className={`rounded-lg border p-3 text-sm ${validado==="aprovado"?"border-emerald-500/20 bg-emerald-500/10 text-emerald-700":"border-red-500/20 bg-red-500/10 text-red-700"}`}>{validado==="aprovado"?"✅ Fluxo validado! Pode promover para instância de teste.":"❌ Fluxo reprovado. Ajuste prompts/voz/base e teste novamente."}</div>}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="grid gap-4">
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Smile className="size-4" /> Tom & Diversão</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              <Label>Nível divertido: {diversao}%</Label><input type="range" min={0} max={100} value={diversao} onChange={e=>setDiversao(parseInt(e.target.value))} className="w-full" />
              <div className="flex justify-between text-xs text-muted-foreground"><span>Sério/profissional</span><span>Divertido</span></div>
              <div className="rounded-lg bg-muted p-2 text-xs">Atual: {diversao>60?"Muito divertida, com emojis": diversao>30?"Equilibrada":"Séria e objetiva"} — reflete em `brandVoice` e `temperature`</div>
              <Button variant="outline" size="sm" onClick={()=> update(id,{brandVoice: diversao>60 ? "Divertida, leve, com emojis" : diversao>30 ? "Acolhedora, leve" : "Profissional, objetiva" } as any)}>Aplicar ao Brand Voice</Button>
            </CardContent>
          </Card>

          <Card><CardHeader><CardTitle className="text-sm">Ajuste Rápido</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              <Label>Adicionar info temporária (para teste)</Label><Input value={infoExtra} onChange={e=>setInfoExtra(e.target.value)} placeholder="Ex: Falar que condomínio é R$ 350" />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={()=>{
                  if(!infoExtra) return
                  const cur = agent.additionalInstructions || ""
                  update(id, { additionalInstructions: cur + "\n" + infoExtra })
                  setInfoExtra("")
                }}><Plus className="size-3" /> Injetar no agente</Button>
                <Button variant="outline" size="sm" onClick={()=>{ update(id,{additionalInstructions:""}); setInfoExtra("")}}><Trash2 className="size-3" /> Limpar</Button>
              </div>
              <p className="text-xs text-muted-foreground">Use para testar variações sem salvar definitivo. Depois aplique no `Prompts & Voz`.</p>
            </CardContent>
          </Card>

          <Card><CardHeader><CardTitle className="text-sm">Contextos de Teste</CardTitle></CardHeader>
            <CardContent className="grid gap-1.5">
              {[
                "Olá, qual o valor?",
                "Ainda tem o apê da Vila Mariana?",
                "Quero falar com humano",
                "QUERO FALAR COM ALGUEM!!!",
                "Não tenho interesse",
                "Me manda mais fotos",
                "Qual o valor do condomínio?"
              ].map(ex=>(
                <button key={ex} onClick={()=>setMsg(ex)} className="rounded-lg border border-border bg-card px-2 py-1.5 text-left text-xs hover:bg-muted">{ex}</button>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="flex flex-col">
          <CardHeader><CardTitle className="text-sm">Conversa Simulada — Fluxo Completo</CardTitle><p className="text-xs text-muted-foreground">Envie como lead, veja a IA responder, valide o fluxo inteiro antes do WhatsApp</p></CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
            <div className="flex max-h-[420px] flex-1 flex-col gap-2 overflow-y-auto rounded-lg border border-border bg-muted/20 p-3">
              {historico.length===0 ? <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma mensagem ainda. Envie a primeira como lead.</p> :
                historico.map((t,i)=>(
                  <div key={i} className={`flex ${t.role==="lead"?"justify-start":"justify-end"}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${t.role==="lead"?"bg-slate-800 text-white rounded-bl-sm":t.meta?.escalated?"bg-amber-500 text-slate-950 rounded-br-sm":"bg-cyan-500 text-slate-950 rounded-br-sm"}`}>
                      <p className="whitespace-pre-wrap">{t.content}</p>
                      {t.meta && <p className="mt-1 text-[10px] opacity-70">
                        {t.meta.ms != null ? `⏱️ ${(t.meta.ms/1000).toFixed(1)}s · ` : ""}💬 {t.meta.tokens ?? 0} tokens{t.meta.model ? ` · ${t.meta.model}` : ""}{t.meta.escalated ? ` · ⚠️ ESCALADO${t.meta.severity ? ` (${t.meta.severity})` : ""}${t.meta.reason ? ` — ${t.meta.reason}` : ""}` : " · ✅ sem escalação"}
                      </p>}
                    </div>
                  </div>
                ))}
              {loading && <p className="text-center text-xs text-muted-foreground">IA digitando...</p>}
            </div>
            <div className="flex gap-2">
              <Input value={msg} onChange={e=>setMsg(e.target.value)} placeholder="Escreva como lead..." onKeyDown={e=> e.key==="Enter" && enviar()} />
              <Button onClick={enviar} disabled={loading || !msg.trim()} className="gap-2"><Send className="size-4" /> Enviar</Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={reset}>Limpar conversa</Button>
              <span className="ml-auto text-xs text-muted-foreground">{historico.length} turnos · {historico.filter(h=>h.role==="ia").length} respostas IA</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
