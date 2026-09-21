"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { supabase } from "@/lib/supabase/client"
import { isGestorNivel } from "@/lib/roles"
import { Badge, Card, CardContent, CardHeader, CardTitle, Input, Select, Table, TD, TH, THead, TR } from "@/components/ui/primitives"

interface Dia {
  dia: string
  enviadas: number
  respondidas: number
  taxa: number
  viraram_ia: number
  handoffs: number
  triagens: number
  tokens: number
  custo: number
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function br(isoDia: string): string {
  return isoDia.split("-").reverse().join("/")
}

export default function RelatorioAutomacoesPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [inicio, setInicio] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 13)
    return iso(d)
  })
  const [fim, setFim] = useState(() => iso(new Date()))
  const [linhas, setLinhas] = useState<Dia[]>([])
  const [busy, setBusy] = useState(false)

  const permitido = !!user && isGestorNivel(user.role)
  useEffect(() => {
    if (!loading && !permitido) router.replace("/painel-corretor")
  }, [loading, permitido, router])

  const carregar = async (iniArg?: string, fimArg?: string) => {
    setBusy(true)
    try {
      // Fronteiras em BRT (00:00 BRT = 03:00Z), para o "dia" bater com o real.
      const ini = `${iniArg ?? inicio}T03:00:00Z`
      const fdt = new Date(`${fimArg ?? fim}T12:00:00Z`)
      fdt.setDate(fdt.getDate() + 1)
      const fimX = `${fdt.toISOString().slice(0, 10)}T03:00:00Z`
      const [jobs, logs, anal] = await Promise.all([
        supabase.from("automation_jobs").select("status,sent_at,responded_at,created_at").gte("created_at", ini).lte("created_at", fimX).limit(10000),
        supabase.from("automation_logs").select("event_type,created_at").gte("created_at", ini).lte("created_at", fimX).limit(10000),
        supabase.from("conversation_analytics").select("tokens_used,api_cost_usd,created_at").gte("created_at", ini).lte("created_at", fimX).limit(10000),
      ])
      const J = ((jobs.data ?? []) as { status: string; sent_at: string | null; responded_at: string | null; created_at: string }[])
      const L = ((logs.data ?? []) as { event_type: string; created_at: string }[])
      const A = ((anal.data ?? []) as { tokens_used: number | null; api_cost_usd: number | null; created_at: string }[])
      const dias: string[] = []
      const d0 = new Date(`${inicio}T12:00:00Z`)
      const d1 = new Date(`${fim}T12:00:00Z`)
      for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) dias.push(iso(d))
      const rows: Dia[] = dias.map((dia) => {
        const env = J.filter((j) => (j.sent_at ?? "").slice(0, 10) === dia).length
        const resp = J.filter((j) => (j.responded_at ?? "").slice(0, 10) === dia).length
        const viraram = L.filter((l) => l.event_type === "lead_respondeu_atendimento_ia" && l.created_at.slice(0, 10) === dia).length
        const hand = L.filter((l) => l.event_type === "ia_handoff_humano" && l.created_at.slice(0, 10) === dia).length
        const tria = L.filter((l) => l.event_type === "lead_followup_sem_resposta_triagem" && l.created_at.slice(0, 10) === dia).length
        const toks = A.filter((a) => String(a.created_at ?? "").slice(0, 10) === dia)
        return {
          dia,
          enviadas: env,
          respondidas: resp,
          taxa: env ? Math.round((resp / env) * 1000) / 10 : 0,
          viraram_ia: viraram,
          handoffs: hand,
          triagens: tria,
          tokens: toks.reduce((s, a) => s + (a.tokens_used ?? 0), 0),
          custo: Math.round(toks.reduce((s, a) => s + Number(a.api_cost_usd ?? 0), 0) * 100000) / 100000,
        }
      })
      setLinhas(rows.reverse())
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (permitido) carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permitido])

  const preset = (op: "hoje" | "ontem" | "7d" | "30d") => {
    const hoje = new Date()
    const f = (d: Date) => iso(d)
    if (op === "hoje") {
      setInicio(f(hoje)); setFim(f(hoje)); void carregar(f(hoje), f(hoje))
    } else if (op === "ontem") {
      const d = new Date(hoje)
      d.setDate(d.getDate() - 1)
      setInicio(f(d)); setFim(f(d)); void carregar(f(d), f(d))
    } else {
      const d = new Date(hoje)
      d.setDate(d.getDate() - (op === "7d" ? 6 : 29))
      setInicio(f(d)); setFim(f(hoje)); void carregar(f(d), f(hoje))
    }
  }
  const tot = (k: keyof Dia) => (typeof linhas[0]?.[k] === "number" ? linhas.reduce((s, l) => s + (l[k] as number), 0) : 0)
  const taxaGeral = (tot("enviadas") as number) ? Math.round(((tot("respondidas") as number) / (tot("enviadas") as number)) * 1000) / 10 : 0

  const csv = () => {
    const head = "dia,enviadas,respondidas,taxa_%,viraram_ia,handoffs,triagens,tokens,custo_usd"
    const body = linhas.map((l) => [br(l.dia), l.enviadas, l.respondidas, l.taxa, l.viraram_ia, l.handoffs, l.triagens, l.tokens, l.custo].join(",")).join("\n")
    const blob = new Blob([head + "\n" + body], { type: "text/csv" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `relatorio-automacoes-${inicio}-${fim}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (loading || !user) return <div className="py-16 text-center text-muted-foreground">Carregando...</div>
  if (!permitido) return null

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-xl font-bold">Relatório diário <Badge>automações + IA</Badge></h1>
          <p className="text-xs text-muted-foreground">Dia a dia: envios, respostas, taxas, IA, triagem e custo. Exporte em CSV para compartilhar.</p>
        </div>
        <div className="flex items-center gap-2">
          {(["hoje", "ontem", "7d", "30d"] as const).map((p) => (
            <button key={p} type="button" onClick={() => preset(p)} className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
              {p === "hoje" ? "Hoje" : p === "ontem" ? "Ontem" : p === "7d" ? "7 dias" : "30 dias"}
            </button>
          ))}
          <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="h-9 w-auto text-xs" aria-label="Data inicial" />
          <span className="text-xs text-muted-foreground">→</span>
          <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="h-9 w-auto text-xs" aria-label="Data final" />
          <button type="button" onClick={() => carregar()} disabled={busy} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">
            {busy ? "..." : "Buscar"}
          </button>
          <button type="button" onClick={csv} className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-muted">CSV</button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-5">
        {[["Enviadas", tot("enviadas")], ["Respondidas", tot("respondidas")], ["Taxa resposta %", taxaGeral], ["Viraram IA", tot("viraram_ia")], ["Custo US$", tot("custo")]].map(([label, v]) => (
          <Card key={label as string}>
            <CardContent>
              <p className="text-2xl font-bold">{String(v)}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Por dia</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>Dia</TH><TH>Enviadas</TH><TH>Respondidas</TH><TH>Taxa %</TH><TH>Viraram IA</TH><TH>Handoffs</TH><TH>Triagens</TH><TH>Tokens</TH><TH>US$</TH></TR></THead>
            <tbody>
              {linhas.map((l) => (
                <TR key={l.dia}>
                  <TD>{br(l.dia)}</TD>
                  <TD>{l.enviadas}</TD>
                  <TD>{l.respondidas}</TD>
                  <TD>{l.taxa}%</TD>
                  <TD>{l.viraram_ia}</TD>
                  <TD>{l.handoffs}</TD>
                  <TD>{l.triagens}</TD>
                  <TD>{l.tokens.toLocaleString("pt-BR")}</TD>
                  <TD>{l.custo.toFixed(5)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
