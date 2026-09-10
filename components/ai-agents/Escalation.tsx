"use client"
import { useCallback, useEffect, useState } from "react"
import { Badge, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Skeleton, Textarea, useToast } from "@/components/ui/primitives"
import { Button } from "@/components/ui/button"
import { AlertTriangle, ArrowUpCircle, Bell, Plus, Trash2 } from "lucide-react"
import type { EscalationAction, EscalationChannel, EscalationCondition, EscalationTrigger } from "@/lib/ai/types"

const CONDITIONS: { value: EscalationCondition; label: string }[] = [
  { value: "keyword", label: "Palavra-chave (keyword)" },
  { value: "max_turns", label: "Limite de turnos (max_turns)" },
  { value: "sentiment", label: "Sentimento/frustração (sentiment)" },
]

const ACTIONS: { value: EscalationAction; label: string }[] = [
  { value: "notify_team", label: "Avisar equipe (notify_team)" },
  { value: "immediate_handoff", label: "Transferir na hora (immediate_handoff)" },
  { value: "escalate_specialist", label: "Escalar p/ especialista (escalate_specialist)" },
]

const CHANNELS: { value: EscalationChannel; label: string }[] = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "slack", label: "Slack" },
  { value: "email", label: "E-mail" },
]

export function Escalation({ id }: { id: string }) {
  const toast = useToast()
  const [triggers, setTriggers] = useState<EscalationTrigger[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [condition, setCondition] = useState<EscalationCondition>("keyword")
  const [keywords, setKeywords] = useState("")
  const [action, setAction] = useState<EscalationAction>("notify_team")
  const [channels, setChannels] = useState<EscalationChannel[]>(["whatsapp"])

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/ai/${encodeURIComponent(id)}/escalation`)
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || "falha ao carregar")
      setTriggers(Array.isArray(j.triggers) ? j.triggers : [])
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Erro ao carregar triggers", "error")
    } finally {
      setLoading(false)
    }
  }, [id, toast])

  useEffect(() => {
    void carregar()
  }, [carregar])

  function toggleChannel(c: EscalationChannel) {
    setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  }

  async function adicionar() {
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      const r = await fetch(`/api/ai/${encodeURIComponent(id)}/escalation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          condition,
          detection_keywords: keywords.split("\n").map((k) => k.trim()).filter(Boolean),
          action,
          notification_channels: channels,
        }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || "falha ao criar")
      setTriggers((prev) => [j.trigger, ...prev])
      setName("")
      setKeywords("")
      toast("Trigger criado")
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Erro ao criar trigger", "error")
    } finally {
      setSaving(false)
    }
  }

  async function excluir(triggerId: string) {
    if (deletingId) return
    setDeletingId(triggerId)
    try {
      const r = await fetch(`/api/ai/${encodeURIComponent(id)}/escalation/${encodeURIComponent(triggerId)}`, { method: "DELETE" })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || "falha ao excluir")
      setTriggers((prev) => prev.filter((t) => t.id !== triggerId))
      toast("Trigger excluído")
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Erro ao excluir trigger", "error")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600"><AlertTriangle className="size-5" /></div>
        <div><h3 className="font-display text-base font-bold">Escalation &amp; Handoff</h3><p className="text-xs text-muted-foreground">Quando a IA passa para humano e como avisa ({triggers.length} trigger(s) ativo(s))</p></div>
      </div>

      <Card className="border-amber-500/20">
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><ArrowUpCircle className="size-4" /> Triggers configurados</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          {loading ? (
            <div className="grid gap-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
          ) : triggers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum trigger ainda. Crie o primeiro abaixo — sem triggers, a IA nunca escala sozinha.</p>
          ) : (
            triggers.map((t) => (
              <div key={t.id} className="rounded-xl border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{t.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">condição: {t.condition} · ação: {t.action} · canais: {(t.notification_channels || []).join(", ") || "—"}</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" disabled={deletingId === t.id} onClick={() => excluir(t.id)} aria-label={`Excluir ${t.name}`}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
                {(t.detection_keywords || []).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {t.detection_keywords.map((k) => <Badge key={k} variant="outline" className="text-xs">{k}</Badge>)}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Bell className="size-4" /> Novo trigger</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="esc-name">Nome (obrigatório)</Label>
            <Input id="esc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Frustração detectada" maxLength={100} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="esc-condition">Condição</Label>
            <Select id="esc-condition" value={condition} onChange={(e) => setCondition(e.target.value as EscalationCondition)}>
              {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="esc-keywords">Palavras de detecção (uma por linha)</Label>
            <Textarea id="esc-keywords" rows={3} value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder={"humano\natendente\ncancelar"} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="esc-action">Ação</Label>
            <Select id="esc-action" value={action} onChange={(e) => setAction(e.target.value as EscalationAction)}>
              {ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Canais de notificação</Label>
            <div className="flex flex-wrap gap-3">
              {CHANNELS.map((c) => (
                <label key={c.value} className="flex cursor-pointer items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={channels.includes(c.value)} onChange={() => toggleChannel(c.value)} className="size-4 accent-current" />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Button type="button" disabled={!name.trim() || saving} onClick={adicionar}>
              <Plus className="size-4" /> {saving ? "Salvando…" : "Adicionar trigger"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
