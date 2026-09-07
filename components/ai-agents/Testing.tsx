"use client"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea } from "@/components/ui/primitives"
import { Button } from "@/components/ui/button"

export function Testing({ id }: { id: string }){
  const [msg, setMsg] = useState("Olá, qual o valor do imóvel?")
  const [resp, setResp] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const testar = async()=>{
    setLoading(true)
    // Mock: simula chamada à API de IA (Fase 3 vai plugar OpenAI)
    await new Promise(r=>setTimeout(r,800))
    setResp(`[Mock IA ${id}] Olá! O imóvel está por R$ 480.000, 2 quartos, 68m². Quer agendar visita? (em resposta a: "${msg}")`)
    setLoading(false)
  }
  return (
    <div className="grid gap-4">
      <Card><CardHeader><CardTitle>Teste Rápido</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <Label>Mensagem do lead</Label><Input value={msg} onChange={e=>setMsg(e.target.value)} />
          <Button onClick={testar} disabled={loading}>{loading?"Gerando...":"Testar Resposta"}</Button>
          {resp && <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-3 text-sm">{resp}</div>}
        </CardContent>
      </Card>
    </div>
  )
}
