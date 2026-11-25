"use client"
import { RefreshCw, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/primitives"
import { dataBR, inteiro } from "../util"
import type { Conta, DadosInstagram } from "./types"

/** Cabeçalho: perfil da conta (foto, bio, números), seletor de conta/período e ações. */
export function Perfil({ d, contas, conta, setConta, dias, setDias, aoAnalisar, analisando, aoAtualizar }: {
  d: DadosInstagram; contas: Conta[]; conta: string; setConta: (v: string) => void; dias: string; setDias: (v: string) => void
  aoAnalisar: () => void; analisando: boolean; aoAtualizar: () => void
}) {
  const c = d.conta
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-rose-600 via-pink-600 to-orange-500 text-white shadow-md">
      <div className="flex flex-wrap items-center gap-4 p-5">
        {c.foto ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={c.foto} alt="" className="size-20 rounded-full border-4 border-white/70 object-cover shadow" /> : <div className="size-20 rounded-full border-4 border-white/70 bg-white/20" />}
        <div className="min-w-0 flex-1">
          <p className="text-xl font-bold leading-tight">{c.nome ?? c.username}</p>
          <p className="text-sm text-white/85">@{c.username}{c.paginaNome ? ` · Página ${c.paginaNome}` : ""}</p>
          {c.biografia && <p className="mt-1 line-clamp-2 max-w-2xl whitespace-pre-line text-xs text-white/80">{c.biografia}</p>}
        </div>
        <dl className="flex gap-5 text-center">
          {[["Seguidores", c.seguidores], ["Seguindo", c.seguindo], ["Publicações", c.midias]].map(([k, v]) => (
            <div key={k as string}><dd className="text-2xl font-bold">{inteiro(v as number)}</dd><dt className="text-[11px] uppercase tracking-wide text-white/75">{k}</dt></div>
          ))}
        </dl>
      </div>
      <div className="flex flex-wrap items-center gap-2 bg-black/20 px-5 py-3">
        {contas.length > 1 && <Select value={conta} onChange={(e) => setConta(e.target.value)} className="h-9 w-auto border-white/30 bg-white/15 text-white" aria-label="Conta">{contas.map((x) => <option key={x.igId} value={x.igId} className="text-black">@{x.username}</option>)}</Select>}
        <Select value={dias} onChange={(e) => setDias(e.target.value)} className="h-9 w-auto border-white/30 bg-white/15 text-white" aria-label="Período">{["7", "30", "60", "90", "180"].map((x) => <option key={x} value={x} className="text-black">Últimos {x} dias</option>)}</Select>
        <span className="text-xs text-white/85">{dataBR(d.periodo.since)} a {dataBR(d.periodo.until)}{d.anterior ? ` · comparando com ${dataBR(d.anterior.periodo.since)} a ${dataBR(d.anterior.periodo.until)}` : ""}</span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={aoAtualizar} className="border-white/40 bg-white/10 text-white hover:bg-white/20"><RefreshCw className="size-4" />Atualizar</Button>
          <Button size="sm" onClick={aoAnalisar} disabled={analisando} className="bg-white text-rose-700 hover:bg-white/90"><Sparkles className="size-4" />{analisando ? "Analisando…" : "Analisar com IA"}</Button>
        </div>
      </div>
    </div>
  )
}
