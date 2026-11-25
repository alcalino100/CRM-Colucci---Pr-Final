"use client"
import { ArrowDownRight, ArrowUpRight, Bookmark, Eye, Heart, MessageCircle, Minus, MousePointerClick, Share2, Sparkles, TrendingUp, UserPlus, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { inteiro, pct } from "../util"
import type { DadosInstagram } from "./types"

const Chip = ({ v }: { v: number | null | undefined }) => {
  if (v == null) return <span className="text-[11px] text-muted-foreground">sem comparação</span>
  const Seta = v === 0 ? Minus : v > 0 ? ArrowUpRight : ArrowDownRight
  return <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold", v === 0 ? "bg-muted text-muted-foreground" : v > 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}><Seta className="size-3" />{v > 0 ? "+" : ""}{v.toLocaleString("pt-BR")}%</span>
}

function Cartao({ icone: Icone, cor, rotulo, valor, delta, dica }: { icone: React.ComponentType<{ className?: string }>; cor: string; rotulo: string; valor: string; delta?: number | null; dica?: string }) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm transition hover:shadow-md" title={dica}>
      <div className={cn("absolute -right-6 -top-6 size-20 rounded-full opacity-10 transition group-hover:opacity-20", cor)} />
      <div className="flex items-center gap-2">
        <span className={cn("flex size-8 items-center justify-center rounded-lg text-white", cor)}><Icone className="size-4" /></span>
        <p className="text-xs font-medium text-muted-foreground">{rotulo}</p>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight">{valor}</p>
      <div className="mt-1 min-h-5">{delta !== undefined && <Chip v={delta} />}</div>
    </div>
  )
}

/** Indicadores principais com variação em relação ao período anterior de mesma duração. */
export function Indicadores({ d }: { d: DadosInstagram }) {
  const r = d.analise.resumo
  const i = d.insights
  const c = d.comparativo
  const novos = i.novosSeguidores
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Cartao icone={Users} cor="bg-rose-600" rotulo="Alcance (contas únicas)" valor={inteiro(i.alcance)} delta={c?.alcance} dica="Quantas contas diferentes viram seu conteúdo" />
      <Cartao icone={Eye} cor="bg-violet-600" rotulo="Visualizações" valor={inteiro(i.visualizacoes)} delta={c?.visualizacoes} dica="Total de vezes que o conteúdo foi exibido" />
      <Cartao icone={MousePointerClick} cor="bg-sky-600" rotulo="Visitas ao perfil" valor={inteiro(i.visitasPerfil)} delta={c?.visitasPerfil} />
      <Cartao icone={UserPlus} cor="bg-emerald-600" rotulo="Novos seguidores" valor={novos == null ? "—" : `${novos > 0 ? "+" : ""}${inteiro(novos)}`} delta={c?.novosSeguidores} />
      <Cartao icone={TrendingUp} cor="bg-amber-600" rotulo="Engajamento médio por post" valor={pct(r.taxaEngajamentoMedia)} delta={c?.engajamento} dica="(curtidas + comentários + salvamentos + compartilhamentos) ÷ alcance" />
      <Cartao icone={Heart} cor="bg-pink-600" rotulo="Curtidas" valor={inteiro(r.curtidas)} />
      <Cartao icone={MessageCircle} cor="bg-indigo-600" rotulo="Comentários" valor={inteiro(r.comentarios)} />
      <Cartao icone={Bookmark} cor="bg-teal-600" rotulo="Salvamentos" valor={inteiro(r.salvamentos)} delta={c?.salvamentos} dica="Variação considera salvamentos + compartilhamentos" />
      <Cartao icone={Share2} cor="bg-orange-600" rotulo="Compartilhamentos" valor={inteiro(r.compartilhamentos)} />
      <Cartao icone={Sparkles} cor="bg-fuchsia-600" rotulo="Posts publicados" valor={`${inteiro(r.totalPosts)}`} delta={c?.posts} dica={`${r.postsPorSemana} por semana`} />
      <Cartao icone={Users} cor="bg-cyan-600" rotulo="Contas engajadas" valor={inteiro(i.contasEngajadas)} />
      <Cartao icone={Eye} cor="bg-lime-600" rotulo="Interações totais (conta)" valor={inteiro(i.interacoes)} />
    </div>
  )
}
