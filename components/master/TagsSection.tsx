"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { TAGS_FLUXO } from "@/lib/labels"
import { Badge, Card, CardContent, CardHeader, CardTitle, Input, useToast } from "@/components/ui/primitives"
import { btn } from "./MasterUiAtoms"

export function TagsSection() {
  const toast = useToast()
  const [agentes, setAgentes] = useState<{ id: string; name: string; tags: string[] }[]>([])
  const [novo, setNovo] = useState<Record<string, string>>({})

  const carregar = async () => {
    try {
      const { data } = await supabase.from("ai_agents").select("id,name,config")
      const rows = ((data ?? []) as { id: string; name: string; config: unknown }[]).map((a) => {
        const c = typeof a.config === "string" ? JSON.parse(a.config) : (a.config ?? {})
        const t = ((c as { rules?: { target?: { tags?: unknown } } }).rules?.target?.tags ?? []) as unknown[]
        return { id: a.id, name: a.name, tags: t.map((x) => String(x)) }
      })
      setAgentes(rows)
    } catch {
      setAgentes([])
    }
  }
  useEffect(() => {
    carregar()
  }, [])

  const salvarTags = async (id: string, tags: string[]) => {
    try {
      const { data } = await supabase.from("ai_agents").select("config").eq("id", id).maybeSingle()
      const raw = (data as { config: unknown } | null)?.config
      const cfg = (typeof raw === "string" ? JSON.parse(raw) : (raw ?? {})) as {
        rules?: { target?: Record<string, unknown> }
      }
      cfg.rules = cfg.rules ?? {}
      cfg.rules.target = { ...(cfg.rules.target ?? {}), tags }
      const r = await fetch(`/api/ai/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: cfg.rules }),
      })
      if (!r.ok) throw new Error("falha")
      toast("Tags salvas.")
      carregar()
    } catch {
      toast("Falha ao salvar tags.", "error")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Tags do ciclo (a IA atende quem tem)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {TAGS_FLUXO.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            automacao → entra · respondeu-automacao → respondeu · nao-respondeu-automacao + followup
            → follow-up · saem todas no handoff/perdido.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Tags-alvo por agente</CardTitle>
        </CardHeader>
        <CardContent>
          {agentes.map((a) => (
            <div key={a.id} className="mb-3 rounded-lg border border-border p-2">
              <p className="text-sm font-semibold">{a.name}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {a.tags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    title="remover"
                    onClick={() => salvarTags(a.id, a.tags.filter((x) => x !== t))}
                    className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs hover:border-destructive/50 hover:text-destructive"
                  >
                    {t} ×
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <Input
                  placeholder="nova tag"
                  value={novo[a.id] ?? ""}
                  onChange={(e) => setNovo({ ...novo, [a.id]: e.target.value })}
                  className="h-8 text-xs"
                />
                <button
                  type="button"
                  className={btn()}
                  onClick={() => {
                    const v = (novo[a.id] ?? "").trim().toLowerCase()
                    if (!v) return
                    salvarTags(a.id, [...a.tags, v])
                    setNovo({ ...novo, [a.id]: "" })
                  }}
                >
                  Adicionar
                </button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
