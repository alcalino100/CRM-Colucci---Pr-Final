"use client"
import { useMemo, useState } from "react"
import { Bookmark, Clock, Download, ExternalLink, Eye, Heart, LayoutGrid, List, MessageCircle, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge, Dialog, Select } from "@/components/ui/primitives"
import { cn } from "@/lib/utils"
import { inteiro, pct } from "../util"
import { COR_FORMATO, type Post } from "./types"

const ORDENS: Record<string, { rotulo: string; chave: (p: Post) => number }> = {
  engajamento: { rotulo: "Engajamento", chave: (p) => p.taxaEngajamento ?? -1 },
  alcance: { rotulo: "Alcance", chave: (p) => p.alcance ?? -1 },
  curtidas: { rotulo: "Curtidas", chave: (p) => p.curtidas },
  comentarios: { rotulo: "Comentários", chave: (p) => p.comentarios },
  salvamentos: { rotulo: "Salvamentos", chave: (p) => p.salvamentos },
  compartilhamentos: { rotulo: "Compartilhamentos", chave: (p) => p.compartilhamentos },
  visualizacoes: { rotulo: "Visualizações", chave: (p) => p.visualizacoes ?? -1 },
  recentes: { rotulo: "Mais recentes", chave: (p) => new Date(p.publicadoEm).getTime() },
}

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
const mm = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`

function exportarCsv(posts: Post[]) {
  const cab = ["Data", "Formato", "Link", "Alcance", "Visualizações", "Curtidas", "Comentários", "Salvamentos", "Compartilhamentos", "Engajamento %", "Legenda"]
  const linhas = posts.map((p) => [new Date(p.publicadoEm).toLocaleString("pt-BR"), p.formato, p.permalink, p.alcance ?? "", p.visualizacoes ?? "", p.curtidas, p.comentarios, p.salvamentos, p.compartilhamentos, p.taxaEngajamento ?? "", `"${p.legenda.replace(/"/g, '""').replace(/\n/g, " ")}"`])
  const csv = [cab.join(";"), ...linhas.map((l) => l.join(";"))].join("\n")
  const a = document.createElement("a")
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }))
  a.download = `instagram-posts-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function Metrica({ icone: Icone, v }: { icone: React.ComponentType<{ className?: string }>; v: string }) {
  return <span className="inline-flex items-center gap-1"><Icone className="size-3.5 text-muted-foreground" />{v}</span>
}

function Cartao({ p, melhor, onClick }: { p: Post; melhor: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-square bg-muted">
        {p.miniatura ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.miniatura} alt="" className="size-full object-cover" loading="lazy" /> : <div className="flex size-full items-center justify-center text-xs text-muted-foreground">sem prévia</div>}
        <span className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white shadow" style={{ background: COR_FORMATO[p.formato] ?? "#64748b" }}>{p.formato}</span>
        {melhor && <span className="absolute right-2 top-2 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-amber-950 shadow">★ Destaque</span>}
        <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">{pct(p.taxaEngajamento)}</span>
      </div>
      <div className="flex flex-col gap-1.5 p-3 text-xs">
        <p className="text-muted-foreground">{dataCurta(p.publicadoEm)}</p>
        <p className="line-clamp-2 min-h-8 text-[13px]">{p.legenda || "(sem legenda)"}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
          <Metrica icone={Eye} v={inteiro(p.alcance)} />
          <Metrica icone={Heart} v={inteiro(p.curtidas)} />
          <Metrica icone={MessageCircle} v={inteiro(p.comentarios)} />
          <Metrica icone={Bookmark} v={inteiro(p.salvamentos)} />
          <Metrica icone={Share2} v={inteiro(p.compartilhamentos)} />
        </div>
      </div>
    </button>
  )
}

/** Galeria de publicações: filtro por formato, ordenação, grade/lista, detalhe e exportação CSV. */
export function Publicacoes({ posts, melhores }: { posts: Post[]; melhores: Post[] }) {
  const [formato, setFormato] = useState("Todos")
  const [ordem, setOrdem] = useState("engajamento")
  const [modo, setModo] = useState<"grade" | "lista">("grade")
  const [aberto, setAberto] = useState<Post | null>(null)
  const formatos = useMemo(() => ["Todos", ...Array.from(new Set(posts.map((p) => p.formato)))], [posts])
  const visiveis = useMemo(() => posts.filter((p) => formato === "Todos" || p.formato === formato).sort((a, b) => ORDENS[ordem].chave(b) - ORDENS[ordem].chave(a)), [posts, formato, ordem])
  const idsMelhores = new Set(melhores.slice(0, 3).map((p) => p.id))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Formato">
          {formatos.map((f) => (
            <button key={f} onClick={() => setFormato(f)} aria-pressed={formato === f} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition", formato === f ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground")}>
              {f}{f !== "Todos" && <span className="ml-1 opacity-70">{posts.filter((p) => p.formato === f).length}</span>}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Select value={ordem} onChange={(e) => setOrdem(e.target.value)} className="h-9 w-auto text-xs" aria-label="Ordenar">{Object.entries(ORDENS).map(([k, o]) => <option key={k} value={k}>Ordenar: {o.rotulo}</option>)}</Select>
          <div className="flex overflow-hidden rounded-lg border border-border">
            <button onClick={() => setModo("grade")} aria-pressed={modo === "grade"} aria-label="Grade" className={cn("p-2", modo === "grade" ? "bg-primary text-primary-foreground" : "bg-card")}><LayoutGrid className="size-4" /></button>
            <button onClick={() => setModo("lista")} aria-pressed={modo === "lista"} aria-label="Lista" className={cn("p-2", modo === "lista" ? "bg-primary text-primary-foreground" : "bg-card")}><List className="size-4" /></button>
          </div>
          <Button size="sm" variant="outline" onClick={() => exportarCsv(visiveis)}><Download className="size-4" />CSV</Button>
        </div>
      </div>

      {visiveis.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma publicação neste período.</p> : modo === "grade" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{visiveis.map((p) => <Cartao key={p.id} p={p} melhor={idsMelhores.has(p.id)} onClick={() => setAberto(p)} />)}</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr>{["", "Publicação", "Formato", "Alcance", "Visual.", "Curtidas", "Coment.", "Salv.", "Compart.", "Engaj."].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {visiveis.map((p) => (
                <tr key={p.id} onClick={() => setAberto(p)} className="cursor-pointer hover:bg-muted/40">
                  <td className="px-3 py-2">{p.miniatura ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.miniatura} alt="" className="size-10 rounded object-cover" loading="lazy" /> : <div className="size-10 rounded bg-muted" />}</td>
                  <td className="max-w-xs px-3 py-2"><p className="text-xs text-muted-foreground">{dataCurta(p.publicadoEm)}</p><p className="line-clamp-1">{p.legenda || "(sem legenda)"}</p></td>
                  <td className="px-3 py-2"><span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: COR_FORMATO[p.formato] ?? "#64748b" }}>{p.formato}</span></td>
                  <td className="px-3 py-2">{inteiro(p.alcance)}</td><td className="px-3 py-2">{inteiro(p.visualizacoes)}</td><td className="px-3 py-2">{inteiro(p.curtidas)}</td><td className="px-3 py-2">{inteiro(p.comentarios)}</td><td className="px-3 py-2">{inteiro(p.salvamentos)}</td><td className="px-3 py-2">{inteiro(p.compartilhamentos)}</td>
                  <td className="px-3 py-2 font-semibold">{pct(p.taxaEngajamento)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!aberto} onClose={() => setAberto(null)} title={aberto ? `${aberto.formato} · ${new Date(aberto.publicadoEm).toLocaleString("pt-BR")}` : ""}>
        {aberto && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              {aberto.miniatura ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={aberto.miniatura} alt="" className="size-32 shrink-0 rounded-lg object-cover" /> : <div className="size-32 shrink-0 rounded-lg bg-muted" />}
              <div className="grid flex-1 grid-cols-2 gap-2 text-sm">
                {[["Alcance", inteiro(aberto.alcance)], ["Visualizações", inteiro(aberto.visualizacoes)], ["Curtidas", inteiro(aberto.curtidas)], ["Comentários", inteiro(aberto.comentarios)], ["Salvamentos", inteiro(aberto.salvamentos)], ["Compartilhamentos", inteiro(aberto.compartilhamentos)]].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-muted/50 px-2 py-1.5"><p className="text-[11px] text-muted-foreground">{k}</p><p className="font-semibold">{v}</p></div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2"><Badge variant="amber">Engajamento {pct(aberto.taxaEngajamento)}</Badge>{aberto.tempoMedioSeg != null && <Badge variant="violet"><Clock className="mr-1 size-3" />Tempo médio assistido {mm(aberto.tempoMedioSeg)}</Badge>}</div>
            <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm">{aberto.legenda || "(sem legenda)"}</p>
            <a href={aberto.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary underline">Abrir no Instagram <ExternalLink className="size-3.5" /></a>
          </div>
        )}
      </Dialog>
    </div>
  )
}
