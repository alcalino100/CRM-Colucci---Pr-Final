"use client"
import { useEffect, useState, useCallback } from "react"
import { Plus, Pencil, Check, X, Trash2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input, Label, useToast } from "@/components/ui/primitives"
import { cn } from "@/lib/utils"
import type { AgentRules } from "@/lib/ai/rules"

type TagItem = { name: string; color: string; responderIA?: boolean; followUp?: boolean; emUso: number }

// sincroniza rules.target.tags do agente com as tags marcadas como "IA responde"
function mergeRulesTagsAtras(rules: AgentRules, nomesIA: string[]): AgentRules {
  const target = { ...rules.target }
  if (nomesIA.length === 0) {
    target.tags = []
    target.tagsModo = "none"
  } else {
    target.tags = [...nomesIA]
    target.tagsModo = target.tagsModo === "all" ? "all" : "any"
  }
  return { ...rules, target }
}

export function TagsPanel({ id }: { id: string }) {
  const toast = useToast()
  const [tags, setTags] = useState<TagItem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [novaTag, setNovaTag] = useState("")
  const [novaCor, setNovaCor] = useState("#8b5cf6")
  const [editando, setEditando] = useState<string | null>(null)
  const [edNome, setEdNome] = useState("")
  const [edCor, setEdCor] = useState("")

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/tags")
      const j = await r.json()
      if (j.ok) setTags(j.tags ?? [])
    } catch { /* silent */ } finally { setCarregando(false) }
  }, [])

  async function salvarRules(tagsComIA: string[]) {
    const r = await fetch(`/api/ai/${id}/dashboard?days=1`)
    const j = await r.json()
    if (!j.regras) return
    const atualizadas = mergeRulesTagsAtras(j.regras, tagsComIA)
    const put = await fetch(`/api/ai/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: atualizadas }),
    })
    const pj = await put.json()
    if (!put.ok || pj.error) throw new Error(pj.error || "Não foi possível sincronizar as regras da IA")
  }

  async function persistir(novas: TagItem[]) {
    setSalvando(true)
    try {
      const body = novas.map(({ name, color, responderIA, followUp }) => ({ name, color, responderIA, followUp }))
      const sn = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _bulk: true, _tags: body }),
      })
      const sj = await sn.json()
      if (!sn.ok || !sj.ok) throw new Error(sj.erro || "Falha ao salvar catálogo")
      setTags(novas)
      await salvarRules(novas.filter((t) => t.responderIA).map((t) => t.name))
      toast("Catálogo salvo e sincronizado com a IA")
    } catch (e: any) {
      toast(e.message || "Erro ao salvar", "error")
    } finally { setSalvando(false) }
  }

  useEffect(() => { void carregar() }, [carregar])

  function criarTag() {
    const nome = novaTag.trim().toLowerCase()
    if (nome.length < 2) { toast("Digite um nome com pelo menos 2 caracteres", "error"); return }
    if (tags.some((t) => t.name === nome)) { toast(`A tag "${nome}" já existe`, "error"); return }
    void persistir([...tags, { name: nome, color: novaCor, emUso: 0 }])
    setNovaTag("")
  }

  function toggle(prop: "responderIA" | "followUp", tag: TagItem) {
    const novas = tags.map((t) => t.name === tag.name ? { ...t, [prop]: !t[prop] } : t)
    void persistir(novas)
  }

  function remover(tag: TagItem) {
    const novas = tags.filter((t) => t.name !== tag.name)
    void persistir(novas)
  }

  function iniciarEdicao(tag: TagItem) {
    setEditando(tag.name)
    setEdNome(tag.name)
    setEdCor(tag.color)
  }

  function salvarEdicao() {
    const novoNome = edNome.trim().toLowerCase()
    if (novoNome.length < 2) { toast("Nome inválido", "error"); return }
    const novas = tags.map((t) => t.name === editando ? { ...t, name: novoNome, color: edCor } : t)
    void persistir(novas)
    setEditando(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="font-display text-sm font-bold">Etiquetas / Tags — catálogo único</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Esta lista é a fonte de tags usada no Kanban, Inbox, Follow-ups e IA conversacional.
          Tags em uso nos leads aparecem aqui automaticamente; configure cor e comportamento da IA/follow-up.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="novatag">Nova tag</Label>
            <Input id="novatag" value={novaTag} onChange={(e) => setNovaTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") criarTag() }} placeholder="ex: urgente, novo lead…" className="w-44" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Cor</Label>
            <input type="color" value={novaCor} onChange={(e) => setNovaCor(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent" />
          </div>
          <Button type="button" onClick={criarTag} disabled={salvando}><Plus className="size-4" /> Criar</Button>
        </div>
      </div>

      {carregando ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando catálogo…</div>
      ) : tags.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">Nenhuma tag ainda. Crie a primeira acima.</div>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
          {tags.map((tag) => (
            <div key={tag.name} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
              {editando === tag.name ? (
                <>
                  <Input value={edNome} onChange={(e) => setEdNome(e.target.value)} className="w-40" autoFocus />
                  <input type="color" value={edCor} onChange={(e) => setEdCor(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent" />
                  <Button type="button" size="sm" variant="default" onClick={salvarEdicao}><Check className="size-3.5" /> Salvar</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setEditando(null)}><X className="size-3.5" /></Button>
                </>
              ) : (
                <>
                  <span className="font-display text-sm font-semibold">{tag.name}</span>
                  <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{tag.emUso} lead(s)</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => iniciarEdicao(tag)}><Pencil className="size-3.5" /></Button>
                </>
              )}

              <div className="ml-auto flex items-center gap-4">
                <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={!!tag.responderIA} onChange={() => toggle("responderIA", tag)} disabled={salvando} className="size-4 accent-cyan-600" />
                  <span className="text-cyan-600">IA responde</span>
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={!!tag.followUp} onChange={() => toggle("followUp", tag)} disabled={salvando} className="size-4 accent-amber-600" />
                  <span className="text-amber-600">Follow-up</span>
                </label>
                <button type="button" onClick={() => remover(tag)} disabled={salvando} className="rounded-md p-1 text-destructive hover:bg-destructive/10 disabled:opacity-40" title="Remover do catálogo">
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={cn("rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground", salvando && "opacity-60")}>
        <p><span className="font-semibold text-cyan-600">IA responde</span> — leads com esta tag passam a ser elegíveis para resposta automática (sincroniza com Regras → QUEM responder → Tags).</p>
        <p><span className="font-semibold text-amber-600">Follow-up</span> — leads com esta tag entram na fila de follow-up automático independente da origem (além do padrão Tráfego Pago).</p>
      </div>
    </div>
  )
}