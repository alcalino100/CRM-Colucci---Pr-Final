"use client"
import { useCallback, useEffect, useState } from "react"
import { Badge, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Skeleton, Textarea, useToast } from "@/components/ui/primitives"
import { Button } from "@/components/ui/button"
import { Pencil, Plus, Save, Target, Trash2, X } from "lucide-react"
import type { Goal, GoalType } from "@/lib/ai/types"

const TYPES: { value: GoalType; label: string }[] = [
  { value: "qualification", label: "Qualificação" },
  { value: "booking", label: "Agendamento" },
  { value: "info", label: "Informação" },
  { value: "custom", label: "Personalizada" },
]

function template(tipo: GoalType, stamp: number): Goal {
  const base = {
    id: `goal_${stamp}`,
    ai_id: "",
    created_at: new Date().toISOString(),
  }
  if (tipo === "booking") {
    return {
      ...base,
      name: "Agendamento de visita",
      type: "booking",
      description: "Agendar demo ou visita",
      questions: ["Você tem disponibilidade esta semana?", "Prefere manhã ou tarde?"],
      success_criteria: { questionsAnswered: 2 },
      fallback: "send_email",
      prompt: "Ofereça 2-3 horários esta semana",
    }
  }
  if (tipo === "info") {
    return {
      ...base,
      name: "Informações do imóvel",
      type: "info",
      description: "Responder dúvidas sobre o imóvel",
      questions: ["Qual sua principal dúvida sobre o imóvel?"],
      success_criteria: { questionsAnswered: 1 },
      fallback: "escalate",
      prompt: "Responda com dados da base de conhecimento; se não souber, escale",
    }
  }
  return {
    ...base,
    name: "Qualificação do lead",
    type: "qualification",
    description: "Entender budget e timing do cliente",
    questions: ["Qual sua faixa de budget?", "Para quando precisa?", "Qual sua principal necessidade?"],
    success_criteria: { questionsAnswered: 3, budget_min: 0 },
    next_step: "booking",
    fallback: "escalate",
    prompt: "Pergunte sobre budget, timing e necessidades",
  }
}

const TIPOS_VALIDOS: GoalType[] = ["qualification", "booking", "info", "custom"]
const normalizar = (g: Goal): Goal => ({
  ...g,
  type: (TIPOS_VALIDOS as string[]).includes(g.type) ? g.type : "custom",
  questions: Array.isArray(g.questions) ? g.questions : [],
  description: g.description ?? "",
  prompt: g.prompt ?? "",
})

const vazio = (): Goal => ({
  id: `goal_${Date.now()}`,
  ai_id: "",
  name: "",
  type: "custom",
  description: "",
  questions: [],
  prompt: "",
  created_at: new Date().toISOString(),
})

export function Goals({ id }: { id: string }) {
  const toast = useToast()
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [novaPergunta, setNovaPergunta] = useState("")

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/ai/${encodeURIComponent(id)}/goals`)
      const j = await r.json()
      if (r.ok && j.ok) setGoals((j.goals as Goal[]).map(normalizar))
      else if (Array.isArray(j)) {
        // compat: formato antigo retornava array cru
        setGoals((j as Goal[]).map(normalizar))
      } else throw new Error(j.error || "falha ao carregar")
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Erro ao carregar metas", "error")
    } finally {
      setLoading(false)
    }
  }, [id, toast])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function persistir(lista: Goal[], msg: string) {
    setSaving(true)
    try {
      const r = await fetch(`/api/ai/${encodeURIComponent(id)}/goals`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goals: lista }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || "falha ao salvar")
      setGoals(j.goals)
      toast(msg)
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Erro ao salvar metas", "error")
    } finally {
      setSaving(false)
    }
  }

  function criarDoTemplate(tipo: GoalType) {
    setEditing(template(tipo, Date.now()))
    setIsNew(true)
  }

  function salvarEdicao() {
    if (!editing || !editing.name.trim() || editing.prompt.trim().length < 10 || saving) {
      if (editing && editing.prompt.trim().length < 10) toast("Prompt precisa de ao menos 10 caracteres.", "error")
      return
    }
    const lista = isNew ? [...goals, editing] : goals.map((g) => (g.id === editing.id ? editing : g))
    void persistir(lista, isNew ? "Meta criada" : "Meta atualizada").then(() => {
      setEditing(null)
    })
  }

  function excluir(goalId: string) {
    void persistir(goals.filter((g) => g.id !== goalId), "Meta excluída")
  }

  const ed = editing
  const setEd = (patch: Partial<Goal>) => setEditing((prev) => (prev ? { ...prev, ...patch } : prev))

  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600"><Target className="size-5" /></div>
        <div><h3 className="font-display text-base font-bold">Metas da IA</h3><p className="text-xs text-muted-foreground">Metas estruturadas: tipo, perguntas, critérios de sucesso e fallback ({goals.length})</p></div>
      </div>

      <Card className="border-blue-500/20">
        <CardHeader><CardTitle className="text-sm">Criar a partir de template</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => criarDoTemplate("qualification")}><Plus className="size-3" /> Qualificação</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => criarDoTemplate("booking")}><Plus className="size-3" /> Agendamento</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => criarDoTemplate("info")}><Plus className="size-3" /> Informação</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => { setEditing(vazio()); setIsNew(true) }}>Em branco</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Metas existentes</CardTitle></CardHeader>
        <CardContent className="grid gap-2">
          {loading ? (
            <><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></>
          ) : goals.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma meta. Crie a partir de um template acima.</p>
          ) : (
            goals.map((g) => (
              <div key={g.id} className="flex items-start justify-between gap-2 rounded-xl border border-border p-3">
                <div>
                  <p className="text-sm font-semibold">{g.name} <Badge variant="outline" className="ml-1 text-[10px]">{g.type}</Badge></p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{g.description || "—"} · {(g.questions || []).length} pergunta(s){g.next_step ? ` · depois: ${g.next_step}` : ""}{g.fallback ? ` · fallback: ${g.fallback}` : ""}</p>
                </div>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon" onClick={() => { setEditing({ ...g, questions: [...(g.questions || [])] }); setIsNew(false) }} aria-label={`Editar ${g.name}`}><Pencil className="size-4" /></Button>
                  <Button type="button" variant="ghost" size="icon" disabled={saving} onClick={() => excluir(g.id)} aria-label={`Excluir ${g.name}`}><Trash2 className="size-4 text-destructive" /></Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {ed && (
        <Card className="border-blue-500/30">
          <CardHeader><CardTitle className="text-sm">{isNew ? "Nova meta" : "Editar meta"}</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Nome</Label>
              <Input value={ed.name} onChange={(e) => setEd({ name: e.target.value })} placeholder="Ex.: Qualificação do lead" maxLength={200} />
            </div>
            <div className="grid gap-1.5">
              <Label>Tipo</Label>
              <Select value={ed.type} onChange={(e) => setEd({ type: e.target.value as GoalType })}>
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Descrição</Label>
              <Input value={ed.description} onChange={(e) => setEd({ description: e.target.value })} placeholder="O que essa meta persegue" />
            </div>
            <div className="grid gap-1.5">
              <Label>Perguntas ({(ed.questions || []).length})</Label>
              <div className="grid gap-1.5">
                {(ed.questions || []).map((q, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-sm">
                    <span className="flex-1">{q}</span>
                    <button type="button" onClick={() => setEd({ questions: (ed.questions || []).filter((_, x) => x !== i) })} aria-label="Remover pergunta"><X className="size-3.5 text-muted-foreground" /></button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={novaPergunta} onChange={(e) => setNovaPergunta(e.target.value)} placeholder="Nova pergunta…" onKeyDown={(e) => { if (e.key === "Enter" && novaPergunta.trim()) { setEd({ questions: [...(ed.questions || []), novaPergunta.trim()] }); setNovaPergunta("") } }} />
                <Button type="button" variant="outline" size="sm" onClick={() => { if (novaPergunta.trim()) { setEd({ questions: [...(ed.questions || []), novaPergunta.trim()] }); setNovaPergunta("") } }}><Plus className="size-3" /></Button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="grid gap-1.5">
                <Label>Perguntas p/ sucesso</Label>
                <Input type="number" min={0} value={ed.success_criteria?.questionsAnswered ?? ""} onChange={(e) => setEd({ success_criteria: { ...(ed.success_criteria || {}), questionsAnswered: e.target.value === "" ? undefined : Number(e.target.value) } })} placeholder="Ex.: 3" />
              </div>
              <div className="grid gap-1.5">
                <Label>Budget mín (R$)</Label>
                <Input type="number" min={0} value={ed.success_criteria?.budget_min ?? ""} onChange={(e) => setEd({ success_criteria: { ...(ed.success_criteria || {}), budget_min: e.target.value === "" ? undefined : Number(e.target.value) } })} placeholder="Ex.: 300000" />
              </div>
              <div className="grid gap-1.5">
                <Label>Prazo (dias)</Label>
                <Input type="number" min={0} value={ed.success_criteria?.timeline_days ?? ""} onChange={(e) => setEd({ success_criteria: { ...(ed.success_criteria || {}), timeline_days: e.target.value === "" ? undefined : Number(e.target.value) } })} placeholder="Ex.: 30" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label>Próximo passo</Label>
                <Input value={ed.next_step ?? ""} onChange={(e) => setEd({ next_step: e.target.value })} placeholder="Ex.: booking" />
              </div>
              <div className="grid gap-1.5">
                <Label>Fallback</Label>
                <Input value={ed.fallback ?? ""} onChange={(e) => setEd({ fallback: e.target.value })} placeholder="Ex.: escalate" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Prompt (mín. 10 chars)</Label>
              <Textarea rows={3} value={ed.prompt} onChange={(e) => setEd({ prompt: e.target.value })} placeholder="Como a IA deve perseguir essa meta" />
            </div>
            <div className="flex gap-2">
              <Button type="button" disabled={saving || !ed.name.trim() || ed.prompt.trim().length < 10} onClick={salvarEdicao}><Save className="size-4" /> {saving ? "Salvando…" : "Salvar"}</Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
