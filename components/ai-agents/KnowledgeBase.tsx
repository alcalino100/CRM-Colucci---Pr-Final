"use client"
import { useAIAgentsStore } from "@/lib/ai-agents-store"
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea } from "@/components/ui/primitives"
import { Button } from "@/components/ui/button"
import { FileText, Globe, HelpCircle, Upload, Trash2 } from "lucide-react"

export function KnowledgeBase({ id }: { id: string }){
  const agent = useAIAgentsStore(s=> s.agents.find(a=>a.id===id))
  const update = useAIAgentsStore(s=> s.updateAgent)
  if(!agent) return null
  const docs = agent.knowledgeBase?.documents || []
  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600"><FileText className="size-5" /></div>
        <div><h3 className="font-display text-base font-bold">Base de Conhecimento</h3><p className="text-xs text-muted-foreground">Alimente a IA com PDFs, sites e FAQs para respostas precisas (RAG)</p></div>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><FileText className="size-4" /> Documentos ({docs.length})</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4">
            {docs.length===0 ? <p className="py-4 text-center text-sm text-muted-foreground">Nenhum documento. Faça upload de tabela de imóveis, scripts de vendas, etc.</p> :
              <div className="grid gap-2">{docs.map(d=>(
                <div key={d.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
                  <span className="flex items-center gap-2"><FileText className="size-4 text-muted-foreground" /> {d.name} <span className="text-xs text-muted-foreground">({d.type})</span></span>
                  <Button variant="outline" size="sm" onClick={()=>{
                    const next = docs.filter(x=>x.id!==d.id)
                    update(id, { knowledgeBase: { ...(agent.knowledgeBase as any), documents: next } as any })
                  }}><Trash2 className="size-3" /></Button>
                </div>
              ))}</div>
            }
          </div>
          <div className="flex gap-2">
            <label className="flex-1">
              <input type="file" className="hidden" onChange={e=>{
                const f=e.target.files?.[0]; if(!f) return
                const next=[...docs, {id:`doc_${Date.now()}`, name:f.name, type:f.type||"pdf"}]
                update(id, { knowledgeBase: { id: agent.knowledgeBase?.id || `kb_${Date.now()}`, name: agent.knowledgeBase?.name || "Base Colucci", documents: next } as any })
              }} />
              <span className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm hover:bg-muted"><Upload className="size-4" /> Upload PDF / DOCX</span>
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Globe className="size-4" /> Websites</CardTitle></CardHeader>
        <CardContent className="grid gap-2">
          <div className="flex gap-2"><Input placeholder="https://colucciimoveis.com.br" /><Button variant="outline">Adicionar</Button></div>
          <p className="text-xs text-muted-foreground">A IA vai raspar o conteúdo para RAG (em Fase 3)</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><HelpCircle className="size-4" /> FAQs</CardTitle></CardHeader>
        <CardContent className="grid gap-2">
          <div className="grid gap-1.5"><Label>Pergunta</Label><Input placeholder="Ex: Qual o horário de atendimento?" /></div>
          <div className="grid gap-1.5"><Label>Resposta</Label><Textarea rows={2} placeholder="Atendemos de segunda a sexta..." /></div>
          <Button variant="outline">+ Adicionar FAQ</Button>
        </CardContent>
      </Card>
    </div>
  )
}
