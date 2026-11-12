"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { LEAD_STATUSES } from "@/lib/labels"
import {
  listStages,
  saveStage,
  createStage,
  renameStageKey,
  SYSTEM_STAGE_KEYS,
  type StageRow,
} from "@/lib/pipeline-stages"
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Select, useToast } from "@/components/ui/primitives"
import { btn } from "./MasterUiAtoms"

const VARIANTS = [
  "blue",
  "indigo",
  "sky",
  "cyan",
  "violet",
  "orange",
  "slate",
  "teal",
  "purple",
  "amber",
  "accent",
  "green",
  "gray",
  "red",
]

export function PipelinesSection() {
  const toast = useToast()
  const [rows, setRows] = useState<StageRow[]>([])
  const [faltaTabela, setFaltaTabela] = useState(false)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [novaEtapa, setNovaEtapa] = useState("")
  const [novaChave, setNovaChave] = useState<Record<string, string>>({})
  const [aberta, setAberta] = useState<string | null>(null)

  const carregar = async () => {
    const r = await listStages()
    setRows(r.rows)
    setFaltaTabela(r.faltaTabela)
    const out: Record<string, number> = {}
    await Promise.all(
      LEAD_STATUSES.map(async (s) => {
        try {
          const q = await supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("status", s)
          out[s] = (q as { count: number | null }).count ?? 0
        } catch {
          out[s] = -1
        }
      })
    )
    setCounts(out)
  }
  useEffect(() => {
    carregar()
  }, [])

  const salvar = async (row: StageRow) => {
    setSaving(row.key)
    const r = await saveStage(row)
    setSaving(null)
    if (!r.ok) {
      toast(`Falha: ${r.erro}`, "error")
      return
    }
    toast(`Etapa "${row.label}" salva — recarregando para aplicar.`)
    setTimeout(() => window.location.reload(), 800)
  }

  const set = (key: string, patch: Partial<StageRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline de vendas (editável)</CardTitle>
      </CardHeader>
      <CardContent>
        {faltaTabela && (
          <p className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
            Rode <code>scripts/027_pipeline_stages.sql</code> no Supabase e recarregue. Sem a tabela,
            valem os valores do código.
          </p>
        )}
        <p className="mb-2 text-xs text-muted-foreground">
          Etapas de sistema têm a chave travada (automações dependem delas) — rótulo/cor/ordem
          liberados. Etapas custom valem como vitrine (kanban/filtros).
        </p>
        <div className="mb-2 flex flex-wrap gap-2">
          <Input
            placeholder="Nova etapa (ex.: Pós-venda)"
            value={novaEtapa}
            onChange={(e) => setNovaEtapa(e.target.value)}
            className="h-8 max-w-56 text-xs"
          />
          <button
            type="button"
            className={btn(true)}
            onClick={async () => {
              if (!novaEtapa.trim()) {
                toast("Dê um nome.", "error")
                return
              }
              const r = await createStage(novaEtapa.trim())
              if (!r.ok) {
                toast(`Falha: ${r.erro}`, "error")
                return
              }
              toast(`Etapa criada.`)
              setNovaEtapa("")
              carregar()
            }}
          >
            Criar etapa
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {rows.map((r) => {
            const open = aberta === r.key
            const n = counts[r.key]
            return (
              <div key={r.key} className="rounded-xl border border-border">
                <button
                  type="button"
                  onClick={() => setAberta(open ? null : r.key)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: r.accent }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{r.label}</span>
                    <span className="block font-mono text-[11px] text-muted-foreground">
                      {r.key} · ordem {r.ordem}
                    </span>
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">
                    {n === undefined ? "…" : n < 0 ? "?" : n}
                  </span>
                  <span className="flex gap-1 text-[11px]">
                    {!r.visivel_corretor && (
                      <span className="rounded-full border border-border px-1.5 py-0.5 text-muted-foreground">
                        gestor
                      </span>
                    )}
                    {!r.ativo && (
                      <span className="rounded-full border border-dashed border-border px-1.5 py-0.5 text-muted-foreground">
                        off
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground">{open ? "▾" : "▸"}</span>
                </button>
                {open && (
                  <div className="grid gap-2 border-t border-border p-3 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label>Rótulo</Label>
                      <Input
                        value={r.label}
                        onChange={(e) => set(r.key, { label: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>
                        Chave{" "}
                        {SYSTEM_STAGE_KEYS.has(r.key)
                          ? "(sistema: travada)"
                          : "(muda etapa + leads)"}
                      </Label>
                      {SYSTEM_STAGE_KEYS.has(r.key) ? (
                        <span className="font-mono text-[11px] text-muted-foreground">{r.key} 🔒</span>
                      ) : (
                        <div className="flex gap-1">
                          <Input
                            value={novaChave[r.key] ?? r.key}
                            onChange={(e) =>
                              setNovaChave({ ...novaChave, [r.key]: e.target.value })
                            }
                            className="h-8 font-mono text-xs"
                          />
                          <button
                            type="button"
                            className={btn()}
                            onClick={async () => {
                              const nk = (novaChave[r.key] ?? "").trim()
                              if (!nk || nk === r.key) return
                              const res = await renameStageKey(r.key, nk)
                              if (!res.ok) {
                                toast(`Falha: ${res.erro}`, "error")
                                return
                              }
                              toast("Chave renomeada — recarregando.")
                              setTimeout(() => window.location.reload(), 800)
                            }}
                          >
                            Mudar
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Ordem</Label>
                      <Input
                        type="number"
                        value={r.ordem}
                        onChange={(e) => set(r.key, { ordem: Number(e.target.value) })}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Cor</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={r.accent}
                          onChange={(e) => set(r.key, { accent: e.target.value })}
                          className="h-8 w-10 cursor-pointer rounded border border-input bg-background"
                        />
                        <Select
                          value={r.variant}
                          onChange={(e) => set(r.key, { variant: e.target.value })}
                          className="h-8 text-xs"
                        >
                          {VARIANTS.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>
                    <div className="flex items-end gap-4 pb-1">
                      <label className="flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={r.visivel_corretor}
                          onChange={(e) => set(r.key, { visivel_corretor: e.target.checked })}
                          className="size-4"
                        />{" "}
                        Corretor vê
                      </label>
                      <label className="flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={r.ativo}
                          onChange={(e) => set(r.key, { ativo: e.target.checked })}
                          className="size-4"
                        />{" "}
                        Ativa
                      </label>
                      <button
                        type="button"
                        disabled={saving === r.key}
                        onClick={() => salvar(r)}
                        className={btn(true)}
                      >
                        Salvar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
