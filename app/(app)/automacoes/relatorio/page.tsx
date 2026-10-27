"use client"

import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { supabase } from "@/lib/supabase/client"
import { isGestorNivel } from "@/lib/roles"
import { Badge, Card, CardContent, CardHeader, CardTitle, Input, Table, TD, TH, THead, TR } from "@/components/ui/primitives"
import { BarChart3, Download, RefreshCw, Send, MessageCircle, Users, Bot, Sparkles, TrendingUp, Calendar } from "lucide-react"
import { cn } from "@/lib/utils"
import { AutomationSubNav } from "@/components/automation/AutomationSubNav"

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
      const d0 = new Date(`${iniArg ?? inicio}T12:00:00Z`)
      const d1 = new Date(`${fimArg ?? fim}T12:00:00Z`)
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
  const totalEnviadas = tot("enviadas") as number
  const totalRespondidas = tot("respondidas") as number
  const taxaGeral = totalEnviadas ? Math.round((totalRespondidas / totalEnviadas) * 1000) / 10 : 0

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

  if (loading || !user) return <div className="py-16 text-center text-muted-foreground animate-pulse">Carregando relatório...</div>
  if (!permitido) return null

  return (
    <div className="space-y-6">
      {/* 1. Subnavegação Unificada */}
      <AutomationSubNav />

      {/* 2. Header & Ações de Exportação */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BarChart3 className="size-4" />
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Relatório Diário de Automações & IA
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhamento dia a dia: envios de reativação e follow-up, taxas de conversão, transições para IA e custos.
          </p>
        </div>

        <button
          onClick={csv}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground transition hover:bg-muted"
        >
          <Download className="size-3.5" /> Exportar Planilha (CSV)
        </button>
      </div>

      {/* 3. Filtro de Período Limpo */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
              <Calendar className="size-3.5" /> Período:
            </span>
            {(["hoje", "ontem", "7d", "30d"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => preset(p)}
                className="rounded-lg border border-border/70 bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition"
              >
                {p === "hoje" ? "Hoje" : p === "ontem" ? "Ontem" : p === "7d" ? "Últimos 7 dias" : "Últimos 30 dias"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              className="h-8 w-auto text-xs"
              aria-label="Data inicial"
            />
            <span className="text-xs text-muted-foreground">até</span>
            <Input
              type="date"
              value={fim}
              onChange={(e) => setFim(e.target.value)}
              className="h-8 w-auto text-xs"
              aria-label="Data final"
            />
            <button
              type="button"
              onClick={() => carregar()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            >
              <RefreshCw className={cn("size-3", busy && "animate-spin")} />
              {busy ? "Filtrando..." : "Filtrar"}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* 4. Cards de Resumo Executivo */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Total Enviadas</span>
              <Send className="size-4 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{totalEnviadas}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Mensagens no período</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Total Respondidas</span>
              <MessageCircle className="size-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{totalRespondidas}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Retornos obtidos</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Taxa Média Resposta</span>
              <TrendingUp className="size-4 text-primary" />
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-primary">{taxaGeral}%</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Conversão da esteira</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Assumidos pela IA</span>
              <Bot className="size-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-indigo-600 dark:text-indigo-400">{tot("viraram_ia")}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Atendimentos automáticos</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Custo IA Total</span>
              <Sparkles className="size-4 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">${(tot("custo") as number).toFixed(3)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Tokens consumidos</p>
          </CardContent>
        </Card>
      </div>

      {/* 5. Tabela Detalhada por Dia */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3 border-b border-border/60">
          <CardTitle className="text-base font-bold">Progressão Diária</CardTitle>
        </CardHeader>

        <Table>
          <THead>
            <TR>
              <TH>Data (BRT)</TH>
              <TH>Enviadas</TH>
              <TH>Respondidas</TH>
              <TH>Taxa de Resposta</TH>
              <TH>Viraram IA</TH>
              <TH>Handoffs Corretores</TH>
              <TH>Tokens IA</TH>
              <TH className="text-right">Custo USD</TH>
            </TR>
          </THead>
          <tbody>
            {linhas.length === 0 ? (
              <TR>
                <TD colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                  Nenhum registro encontrado no período selecionado.
                </TD>
              </TR>
            ) : (
              linhas.map((l) => (
                <TR key={l.dia} className="hover:bg-muted/30 transition-colors">
                  <TD className="font-semibold text-foreground text-xs whitespace-nowrap">
                    {br(l.dia)}
                  </TD>
                  <TD className="tabular-nums text-xs font-medium">{l.enviadas}</TD>
                  <TD className="tabular-nums text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    {l.respondidas}
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold tabular-nums min-w-[38px]">{l.taxa}%</span>
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${Math.min(100, l.taxa)}%` }}
                        />
                      </div>
                    </div>
                  </TD>
                  <TD className="tabular-nums text-xs">{l.viraram_ia}</TD>
                  <TD className="tabular-nums text-xs">{l.handoffs}</TD>
                  <TD className="tabular-nums text-xs font-mono text-muted-foreground">
                    {l.tokens.toLocaleString("pt-BR")}
                  </TD>
                  <TD className="tabular-nums text-xs font-mono text-right text-muted-foreground">
                    ${l.custo.toFixed(4)}
                  </TD>
                </TR>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </div>
  )
}
