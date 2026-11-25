"use client"
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

export const brl = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }))
export const inteiro = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("pt-BR"))
export const pct = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`)
export const dataBR = (iso: string) => iso.split("-").reverse().join("/")
export const nomeMes = (mes: string) => new Date(`${mes}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })

export async function api(url: string, metodo = "GET", corpo?: unknown): Promise<{ ok: boolean; erro?: string; [k: string]: any }> {
  try {
    const r = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) })
    return await r.json()
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha de rede" }
  }
}

/** Cartão de indicador com variação vs período anterior (verde = melhora; `menorMelhor` inverte, p.ex. custo por lead). */
export function Kpi({ rotulo, valor, variacao, menorMelhor }: { rotulo: string; valor: string; variacao?: number | null; menorMelhor?: boolean }) {
  const bom = variacao == null ? null : menorMelhor ? variacao < 0 : variacao > 0
  const Seta = variacao == null || variacao === 0 ? Minus : variacao > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="mt-0.5 text-xl font-bold">{valor}</p>
      {variacao !== undefined && (
        <p className={cn("mt-0.5 flex items-center gap-0.5 text-xs font-medium", bom === null || variacao === 0 ? "text-muted-foreground" : bom ? "text-emerald-600" : "text-red-600")}>
          <Seta className="size-3.5" />{variacao == null ? "sem base de comparação" : `${variacao > 0 ? "+" : ""}${variacao.toLocaleString("pt-BR")}% vs. período anterior`}
        </p>
      )}
    </div>
  )
}

/** Renderiza o markdown simples da IA (## títulos, listas, **negrito**) sem HTML bruto. */
export function TextoIA({ texto }: { texto: string }) {
  const negrito = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p))
  return (
    <div className="flex flex-col gap-1.5 text-sm leading-relaxed">
      {texto.split("\n").map((l, i) => {
        const t = l.trim()
        if (!t) return null
        if (t.startsWith("#")) return <h4 key={i} className="mt-2 text-sm font-bold">{t.replace(/^#+\s*/, "")}</h4>
        if (/^(\d+[.)]|[-*•])\s/.test(t)) return <p key={i} className="pl-4 -indent-4">{negrito(t.replace(/^[-*•]\s/, "• "))}</p>
        return <p key={i}>{negrito(t)}</p>
      })}
    </div>
  )
}

export function Tabela({ colunas, linhas }: { colunas: string[]; linhas: (React.ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr>{colunas.map((c) => <th key={c} className="px-3 py-2 font-medium">{c}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">{linhas.map((l, i) => <tr key={i}>{l.map((c, j) => <td key={j} className="px-3 py-2">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}
