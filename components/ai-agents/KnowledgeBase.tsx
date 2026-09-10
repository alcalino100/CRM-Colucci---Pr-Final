"use client"
import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Skeleton, Textarea, useToast } from "@/components/ui/primitives"
import { Button } from "@/components/ui/button"
import { FileText, Globe, HelpCircle, Trash2, Upload } from "lucide-react"

type Doc = { id: string; name: string; type: string; file_size?: number; uploaded_at?: string; chunks_count?: number }

export function KnowledgeBase({ id }: { id: string }){
  const toast = useToast()
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [colando, setColando] = useState(false)
  const [nomeColado, setNomeColado] = useState("")
  const [textoColado, setTextoColado] = useState("")

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/ai/${encodeURIComponent(id)}/knowledge-base/documents`)
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || "falha ao carregar")
      setDocs(j.documents ?? [])
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Erro ao carregar documentos", "error")
    } finally {
      setLoading(false)
    }
  }, [id, toast])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function salvarDoc(name: string, type: string, content: string) {
    setEnviando(true)
    try {
      const r = await fetch(`/api/ai/${encodeURIComponent(id)}/knowledge-base/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, content }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || "falha ao salvar")
      toast(j.indexed?.chunks ? `Documento indexado (${j.indexed.chunks} trechos)` : "Documento salvo (sem texto para indexar)")
      await carregar()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Erro ao salvar documento", "error")
    } finally {
      setEnviando(false)
    }
  }

  function onArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ""
    if (!f) return
    const ehTexto = /\.(txt|md|csv|json)$/i.test(f.name) || (f.type || "").startsWith("text/")
    if (!ehTexto) {
      toast("Por enquanto envie .txt/.md/.csv — ou cole o conteúdo abaixo.", "error")
      return
    }
    const reader = new FileReader()
    reader.onload = () => void salvarDoc(f.name, f.type || "text/plain", String(reader.result || ""))
    reader.onerror = () => toast("Falha ao ler o arquivo.", "error")
    reader.readAsText(f)
  }

  async function excluir(docId: string) {
    try {
      const r = await fetch(`/api/ai/${encodeURIComponent(id)}/knowledge-base/documents?docId=${encodeURIComponent(docId)}`, { method: "DELETE" })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || "falha ao excluir")
      setDocs((prev) => prev.filter((d) => d.id !== docId))
      toast("Documento excluído")
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Erro ao excluir documento", "error")
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600"><FileText className="size-5" /></div>
        <div><h3 className="font-display text-base font-bold">Base de Conhecimento</h3><p className="text-xs text-muted-foreground">Textos indexados com busca semântica (RAG) — a IA usa os trechos mais relevantes</p></div>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><FileText className="size-4" /> Documentos ({docs.length})</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          {loading ? (
            <><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></>
          ) : docs.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhum documento. Envie .txt/.md/.csv ou cole o conteúdo (tabela de imóveis, scripts de vendas, etc).</p>
          ) : (
            <div className="grid gap-2">{docs.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
                <span className="flex items-center gap-2"><FileText className="size-4 text-muted-foreground" /> {d.name} <span className="text-xs text-muted-foreground">({d.chunks_count ?? 0} trechos)</span></span>
                <Button variant="outline" size="sm" onClick={() => excluir(d.id)}><Trash2 className="size-3" /></Button>
              </div>
            ))}</div>
          )}
          <div className="flex flex-wrap gap-2">
            <label className="flex-1">
              <input type="file" accept=".txt,.md,.csv,.json" className="hidden" disabled={enviando} onChange={onArquivo} />
              <span className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm hover:bg-muted"><Upload className="size-4" /> {enviando ? "Enviando…" : "Upload .txt / .md / .csv"}</span>
            </label>
            <Button type="button" variant="outline" onClick={() => setColando((v) => !v)}>Colar texto</Button>
          </div>
          {colando && (
            <div className="grid gap-2 rounded-xl border border-border p-3">
              <div className="grid gap-1.5"><Label>Nome do documento</Label><Input value={nomeColado} onChange={(e) => setNomeColado(e.target.value)} placeholder="Ex.: Tabela de imóveis Centro" /></div>
              <div className="grid gap-1.5"><Label>Conteúdo</Label><Textarea rows={5} value={textoColado} onChange={(e) => setTextoColado(e.target.value)} placeholder="Cole aqui o conteúdo…" /></div>
              <div><Button type="button" size="sm" disabled={enviando || !nomeColado.trim() || !textoColado.trim()} onClick={() => { void salvarDoc(nomeColado.trim(), "text/plain", textoColado).then(() => { setNomeColado(""); setTextoColado(""); setColando(false) }) }}>Salvar e indexar</Button></div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Globe className="size-4" /> Websites</CardTitle></CardHeader>
        <CardContent className="grid gap-2">
          <div className="flex gap-2"><Input placeholder="https://colucciimoveis.com.br" /><Button variant="outline">Adicionar</Button></div>
          <p className="text-xs text-muted-foreground">Raspagem de sites entra numa próxima fase — por ora, use documentos de texto.</p>
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
