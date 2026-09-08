"use client"
import { useEffect, useState } from "react"
import { useAIAgentsStore } from "@/lib/ai-agents-store"
import { Card, CardContent, CardHeader, CardTitle, Label, Textarea } from "@/components/ui/primitives"
import { Button } from "@/components/ui/button"
import { Target, Save } from "lucide-react"
import { useToast } from "@/components/ui/primitives"

export function Goals({ id }: { id: string }){
  const agent = useAIAgentsStore(s=> s.agents.find(a=>a.id===id))
  const updateLocal = useAIAgentsStore(s=> s.updateAgent)
  const toast = useToast()
  const [texto, setTexto] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(()=>{
    if(!agent) return
    // Unifica goals existentes em um único prompt (separados por linha)
    const unico = agent.goals.map(g=> `- ${g.name}: ${g.prompt}`).join("\n") || agent.goals[0]?.prompt || ""
    setTexto(unico)
  }, [agent?.id])

  if(!agent) return null

  const salvar = async()=>{
    setSaving(true)
    const goals = texto.split("\n").filter(Boolean).map((line,i)=> ({
      id: agent.goals[i]?.id || `g_${Date.now()}_${i}`,
      name: line.split(":")[0]?.replace("-","").trim() || `Meta ${i+1}`,
      type: "goal",
      prompt: line
    }))
    try{
      await fetch(`/api/ai/${id}/goals`, { method:"PUT", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ goals })})
      updateLocal(id, { goals } as any)
      toast("Metas salvas com sucesso")
    }catch(e:any){ toast(e.message, "error") }
    setSaving(false)
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600"><Target className="size-5" /></div>
        <div><h3 className="font-display text-base font-bold">Metas da IA</h3><p className="text-xs text-muted-foreground">Descreva em um único prompt todas as metas que a IA deve perseguir (qualificação, agendamento, informação)</p></div>
      </div>
      <Card className="border-blue-500/20">
        <CardHeader><CardTitle className="text-sm">Prompt de Metas (único)</CardTitle><p className="text-xs text-muted-foreground">Ex: "1. Qualificar budget - Perguntar renda e se tem entrada. 2. Agendar visita - Oferecer 2 horários. 3. Informar condomínio..."</p></CardHeader>
        <CardContent className="grid gap-3">
          <Textarea rows={10} value={texto} onChange={e=>setTexto(e.target.value)} placeholder="- Qualificar: Pergunte ..." className="font-mono text-sm" />
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">{texto.length} caracteres · {texto.split("\n").filter(Boolean).length} metas</span>
            <Button onClick={salvar} disabled={saving} className="gap-2"><Save className="size-4" /> {saving?"Salvando...":"Salvar Metas"}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
