"use client"
import { useAIAgentsStore } from "@/lib/ai-agents-store"
import { Card, CardContent, CardHeader, CardTitle, Input, Label } from "@/components/ui/primitives"
import { Button } from "@/components/ui/button"

export function KnowledgeBase({ id }: { id: string }){
  const agent = useAIAgentsStore(s=> s.agents.find(a=>a.id===id))
  if(!agent) return null
  return (
    <div className="grid gap-4">
      <Card><CardHeader><CardTitle>Base de Conhecimento</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-sm text-muted-foreground">Documentos, sites e FAQs para RAG. Reaproveita `whatsapp-midia` e `leads` existentes.</p>
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {agent.knowledgeBase?.documents.map(d=> <div key={d.id} className="text-left">{d.name} ({d.type})</div>) || "Nenhum documento"}
          </div>
          <div className="flex gap-2"><Input placeholder="https://site.com" /><Button variant="outline">Adicionar site</Button></div>
          <Button>Upload PDF</Button>
        </CardContent>
      </Card>
    </div>
  )
}
