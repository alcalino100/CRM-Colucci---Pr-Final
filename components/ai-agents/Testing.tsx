"use client"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea, Badge } from "@/components/ui/primitives"
import { Button } from "@/components/ui/button"
import { FlaskConical, Send } from "lucide-react"

export function Testing({ id }: { id: string }){
  const [msg, setMsg] = useState("Olá, qual o valor do imóvel?")
  const [resp, setResp] = useState<string | null>(null)
  const [meta, setMeta] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const testar = async()=>{
    setLoading(true); setResp(null); setMeta(null)
    try{
      const convRes = await fetch("/api/conversations", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ aiId: id, contactId: "test_contact", channel:"web"}) })
      if(convRes.ok){
        const conv = await convRes.json()
        const r = await fetch(`/api/conversations/${conv.id}/messages`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ message: msg, aiId: id }) })
        const j = await r.json()
        if(r.ok){ setResp(j.aiMessage?.content); setMeta({tokens:j.aiMessage?.metadata?.tokensUsed, escalated:j.escalated}); setLoading(false); return }
        throw new Error(j.error)
      }
    }catch(e:any){ setResp(`Erro: ${e.message} — usando mock`)}
    await new Promise(r=>setTimeout(r,600))
    setResp(`[Mock IA ${id}] Olá! O imóvel está por R$ 480.000, 2 quartos, 68m². Quer agendar visita? (em resposta a: "${msg}")`)
    setLoading(false)
  }
  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600"><FlaskConical className="size-5" /></div>
        <div><h3 className="font-display text-base font-bold">Teste Rápido</h3><p className="text-xs text-muted-foreground">Simule uma mensagem do lead e veja a resposta com RAG</p></div>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-sm">Entrada</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1.5"><Label>Mensagem do lead</Label><Textarea rows={2} value={msg} onChange={e=>setMsg(e.target.value)} placeholder="Ex: Olá, ainda tem aquele apê?" /></div>
          <Button onClick={testar} disabled={loading} className="gap-2"><Send className="size-4" /> {loading?"Gerando com IA...":"Testar Resposta"}</Button>
        </CardContent>
      </Card>
      {resp && (
        <Card className="border-cyan-500/20 bg-cyan-500/5">
          <CardContent className="pt-4">
            <p className="text-sm whitespace-pre-wrap">{resp}</p>
            {meta && <div className="mt-2 flex gap-2"><Badge variant="outline">tokens: {meta.tokens??0}</Badge>{meta.escalated && <Badge className="bg-red-500 text-white">escalado</Badge>}</div>}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
