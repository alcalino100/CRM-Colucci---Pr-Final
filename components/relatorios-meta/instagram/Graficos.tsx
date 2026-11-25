"use client"
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives"
import { cn } from "@/lib/utils"
import { inteiro, pct } from "../util"
import { COR_FORMATO, type DadosInstagram } from "./types"

const eixo = { fontSize: 11, fill: "#78716c" }
const dia = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7)

const Painel = ({ titulo, sub, children, className }: { titulo: string; sub?: string; children: React.ReactNode; className?: string }) => (
  <Card className={className}>
    <CardHeader className="pb-2"><CardTitle className="text-base">{titulo}</CardTitle>{sub && <p className="text-xs text-muted-foreground">{sub}</p>}</CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
)

const Vazio = ({ texto }: { texto: string }) => <p className="py-10 text-center text-sm text-muted-foreground">{texto}</p>

/** Alcance diário e novos seguidores por dia. */
export function GraficoSerie({ d }: { d: DadosInstagram }) {
  const dados = d.serie.map((p) => ({ ...p, rotulo: dia(p.data) }))
  return (
    <Painel titulo="Alcance e crescimento por dia" sub="Alcance diário da conta (área) e novos seguidores (barras)">
      {dados.length === 0 ? <Vazio texto="A Meta não devolveu a série diária para este período." /> : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dados} margin={{ left: -10, right: 4, top: 4 }}>
              <defs><linearGradient id="gAlc" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#dc2626" stopOpacity={0.35} /><stop offset="95%" stopColor="#dc2626" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
              <XAxis dataKey="rotulo" tick={eixo} interval="preserveStartEnd" minTickGap={24} />
              <YAxis yAxisId="a" tick={eixo} tickFormatter={(v) => inteiro(v)} />
              <YAxis yAxisId="s" orientation="right" tick={eixo} />
              <Tooltip formatter={(v, n) => [inteiro(Number(v)), n === "alcance" ? "Alcance" : "Novos seguidores"]} labelFormatter={(l) => `Dia ${l}`} />
              <Area yAxisId="a" type="monotone" dataKey="alcance" stroke="#dc2626" strokeWidth={2} fill="url(#gAlc)" />
              <Bar yAxisId="s" dataKey="novosSeguidores" fill="#059669" radius={[3, 3, 0, 0]} maxBarSize={10} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Painel>
  )
}

/** Engajamento de cada post ao longo do tempo, colorido pelo formato. */
export function GraficoPosts({ d }: { d: DadosInstagram }) {
  const dados = [...d.lista].filter((p) => p.taxaEngajamento !== null).sort((a, b) => a.publicadoEm.localeCompare(b.publicadoEm)).map((p) => ({ rotulo: new Date(p.publicadoEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), taxa: p.taxaEngajamento, formato: p.formato, alcance: p.alcance }))
  return (
    <Painel titulo="Engajamento por post" sub="Cada barra é um post (cor = formato)">
      {dados.length === 0 ? <Vazio texto="Sem posts com alcance no período." /> : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados} margin={{ left: -10, right: 4, top: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
              <XAxis dataKey="rotulo" tick={eixo} />
              <YAxis tick={eixo} tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(v) => [pct(Number(v)), "Engajamento"]} labelFormatter={(l, p) => `${l} · ${p?.[0]?.payload?.formato ?? ""} · alcance ${inteiro(p?.[0]?.payload?.alcance)}`} />
              <Bar dataKey="taxa" radius={[4, 4, 0, 0]} maxBarSize={28}>{dados.map((x, i) => <Cell key={i} fill={COR_FORMATO[x.formato] ?? "#64748b"} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Painel>
  )
}

/** Distribuição de posts e desempenho por formato. */
export function PainelFormatos({ d }: { d: DadosInstagram }) {
  const g = d.analise.porFormato
  const total = g.reduce((a, x) => a + x.posts, 0)
  return (
    <Painel titulo="Formatos" sub="Quantidade de posts e engajamento médio de cada formato">
      {g.length === 0 ? <Vazio texto="Sem posts no período." /> : (
        <div className="grid items-center gap-3 sm:grid-cols-[160px_1fr]">
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart><Pie data={g} dataKey="posts" nameKey="rotulo" innerRadius={38} outerRadius={64} paddingAngle={2}>{g.map((x) => <Cell key={x.rotulo} fill={COR_FORMATO[x.rotulo] ?? "#64748b"} />)}</Pie><Tooltip formatter={(v, n) => [`${v} posts`, n]} /></PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex flex-col gap-2">
            {g.map((x) => (
              <li key={x.rotulo} className="flex items-center gap-2 text-sm">
                <span className="size-3 shrink-0 rounded-full" style={{ background: COR_FORMATO[x.rotulo] ?? "#64748b" }} />
                <span className="w-20 font-medium">{x.rotulo}</span>
                <span className="text-muted-foreground">{x.posts} ({Math.round((x.posts / total) * 100)}%)</span>
                <span className="ml-auto text-right text-xs"><b>{pct(x.taxaEngajamentoMedia)}</b> engaj. · alcance {inteiro(x.alcanceMedio)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Painel>
  )
}

const FAIXAS = ["Madrugada", "Manhã", "Tarde", "Noite"]
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

/** Mapa de calor: onde os posts tiveram mais engajamento (dia da semana × parte do dia). */
export function MapaCalor({ d }: { d: DadosInstagram }) {
  const cel = d.analise.mapaCalor
  const max = Math.max(0, ...cel.map((c) => c.taxa ?? 0))
  const get = (dia: number, faixa: number) => cel.find((c) => c.dia === dia && c.faixa === faixa)!
  return (
    <Painel titulo="Melhores momentos para postar" sub="Engajamento médio por dia e parte do dia (horário de Brasília). Mais escuro = melhor.">
      {max === 0 ? <Vazio texto="Poucos posts para montar o mapa." /> : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-1 text-center text-xs">
            <thead><tr><th />{DIAS.map((x) => <th key={x} className="font-medium text-muted-foreground">{x}</th>)}</tr></thead>
            <tbody>
              {FAIXAS.map((f, fi) => (
                <tr key={f}>
                  <th className="pr-1 text-right font-medium text-muted-foreground">{f}</th>
                  {DIAS.map((_, di) => {
                    const c = get(di, fi)
                    const intens = c.taxa ? Math.max(0.12, c.taxa / max) : 0
                    return <td key={di} title={c.posts ? `${c.posts} post(s) · ${pct(c.taxa)}` : "sem posts"} className={cn("h-9 min-w-10 rounded-md", c.posts ? "font-semibold text-white" : "bg-muted/40 text-transparent")} style={c.posts ? { background: `rgba(220,38,38,${0.25 + intens * 0.75})` } : undefined}>{c.posts ? pct(c.taxa).replace("%", "") : "·"}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Painel>
  )
}

/** Barras horizontais genéricas (demografia, hashtags). */
export function BarrasLista({ itens, formato = inteiro, cor = "#dc2626" }: { itens: { rotulo: string; valor: number; extra?: string }[]; formato?: (n: number) => string; cor?: string }) {
  const max = Math.max(1, ...itens.map((i) => i.valor))
  return (
    <ul className="flex flex-col gap-1.5">
      {itens.map((i) => (
        <li key={i.rotulo} className="text-xs">
          <div className="flex justify-between gap-2"><span className="truncate font-medium">{i.rotulo}</span><span className="shrink-0 text-muted-foreground">{formato(i.valor)}{i.extra ? ` · ${i.extra}` : ""}</span></div>
          <div className="mt-0.5 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${(i.valor / max) * 100}%`, background: cor }} /></div>
        </li>
      ))}
    </ul>
  )
}
export { Painel, Vazio }
