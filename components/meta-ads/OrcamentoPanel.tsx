"use client"

import { useState } from "react"
import useSWR from "swr"
import { Wallet, TrendingUp, TriangleAlert, SlidersHorizontal } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { Card, CardContent, Badge, Skeleton, Input, Dialog, Label } from "@/components/ui/primitives"
import { cn } from "@/lib/utils"
import { fetcher, brl2, fmt } from "@/lib/meta-ads-utils"

export function OrcamentoPanel() {
  const { user } = useAuth()
  const { data, mutate } = useSWR("/api/meta/orcamento", fetcher, { refreshInterval: 300_000 })
  const { data: contasData } = useSWR("/api/meta?op=accounts", fetcher)
  const [open, setOpen] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [form, setForm] = useState<{
    tetoMensal: string
    custoInicial: string
    veiculacaoInicio: string
    veiculacaoFim: string
    contas: string[]
  } | null>(null)

  const cfg = data?.config
  const calc = data?.calc

  function abrirEdicao() {
    if (!cfg) return
    setForm({
      tetoMensal: String(cfg.tetoMensal),
      custoInicial: String(cfg.custoInicial),
      veiculacaoInicio: String(cfg.veiculacaoInicio),
      veiculacaoFim: String(cfg.veiculacaoFim),
      contas: [...cfg.contas],
    })
    setMsg(null)
    setOpen(true)
  }

  async function salvar() {
    if (!form || !user) return
    setSalvando(true)
    setMsg(null)
    try {
      const r = await fetch("/api/meta/orcamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: user.id,
          tetoMensal: Number(form.tetoMensal),
          custoInicial: Number(form.custoInicial),
          veiculacaoInicio: Number(form.veiculacaoInicio),
          veiculacaoFim: Number(form.veiculacaoFim),
          contas: form.contas,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "Erro ao salvar")
      setOpen(false)
      mutate()
    } catch (e: any) {
      setMsg(e.message)
    } finally {
      setSalvando(false)
    }
  }

  const usadoPct =
    cfg && calc && cfg.tetoMensal > 0 ? Math.min(100, (calc.usado / cfg.tetoMensal) * 100) : 0
  const projPct =
    cfg && calc && cfg.tetoMensal > 0 ? Math.min(100, (calc.projecao / cfg.tetoMensal) * 100) : 0

  return (
    <Card className="rounded-2xl overflow-hidden">
      <CardContent className="p-4 sm:p-5">
        {!data ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : (
          <div className="flex flex-col gap-4">
            {/* Linha 1: título + badges + editar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/25 shadow-[0_0_16px_rgb(178_34_34/0.35)]">
                  <Wallet className="size-4.5" />
                </span>
                <div>
                  <p className="font-display text-sm font-bold tracking-tight">Verba mensal — Meta Ads</p>
                  <p className="text-xs text-muted-foreground">
                    {data.source === "mock"
                      ? "Sem token: gasto real não carregado."
                      : `Gasto real do mês (${calc.mesReferencia}): ${brl2(
                          calc.diasVeiculados > 0 ? data.gastoReal : 0
                        )} · Média ${brl2(calc.mediaDiaria)}/dia`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={calc.dentroLimite ? "green" : "red"} className="gap-1 px-2.5 py-1">
                  {calc.dentroLimite ? <TrendingUp className="size-3" /> : <TriangleAlert className="size-3" />}
                  {calc.dentroLimite ? "Dentro do limite" : `Estoura em ${brl2(calc.estouro)}`}
                </Badge>
                <button
                  type="button"
                  onClick={abrirEdicao}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground"
                >
                  <SlidersHorizontal className="size-3.5" /> Ajustar verba
                </button>
              </div>
            </div>

            {/* Linha 2: KPIs */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <OrcKpi label="Teto mensal" value={brl2(cfg.tetoMensal)} sub="limite do mês" />
              <OrcKpi
                label="Já usado"
                value={brl2(calc.usado)}
                sub={`cartão ${brl2(cfg.custoInicial)} + Meta ${brl2(data.gastoReal)}`}
                accent={usadoPct > 80}
              />
              <OrcKpi
                label="Quanto falta"
                value={brl2(calc.restante)}
                sub={
                  calc.diasRestantes > 0
                    ? `${brl2(calc.verbaDiaRestante)}/dia até dia ${cfg.veiculacaoFim}`
                    : "sem dias restantes"
                }
              />
              <OrcKpi
                label="Projeção do mês"
                value={brl2(calc.projecao)}
                sub={`padrão dia ${cfg.veiculacaoInicio}–${cfg.veiculacaoFim}`}
                accent={!calc.dentroLimite}
              />
            </div>

            {/* Linha 3: barra de progresso */}
            <div>
              <div className="relative h-3.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
                  style={{ width: `${usadoPct}%` }}
                />
                {projPct > 0 && (
                  <div
                    className="absolute top-0 h-full w-[3px] bg-foreground/70"
                    style={{ left: `calc(${projPct}% - 1.5px)` }}
                    title={`Projeção: ${brl2(calc.projecao)}`}
                  />
                )}
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  {brl2(calc.usado)} ({fmt(usadoPct, 1)}% do teto)
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block size-1.5 rounded-full bg-foreground/70" /> projeção{" "}
                  {brl2(calc.projecao)}
                </span>
                <span>{brl2(cfg.tetoMensal)}</span>
              </div>
            </div>

            {/* Alerta de estouro */}
            {!calc.dentroLimite && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                No ritmo atual, o mês fecha com estouro de {brl2(calc.estouro)} em relação ao teto de{" "}
                {brl2(cfg.tetoMensal)}. Reduza o orçamento dos conjuntos ou o número de criativos ativos.
              </p>
            )}
          </div>
        )}
      </CardContent>

      {/* Modal de edição */}
      <Dialog open={open} onClose={() => setOpen(false)} title="Ajustar verba mensal">
        {form && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="orc-teto">Teto mensal (R$)</Label>
                <Input
                  id="orc-teto"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.tetoMensal}
                  onChange={(e) => setForm({ ...form, tetoMensal: e.target.value })}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="orc-custo">Já comprometido no início do mês (R$)</Label>
                <Input
                  id="orc-custo"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.custoInicial}
                  onChange={(e) => setForm({ ...form, custoInicial: e.target.value })}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="orc-ini">Veiculação — de (dia)</Label>
                <Input
                  id="orc-ini"
                  type="number"
                  min="1"
                  max="31"
                  value={form.veiculacaoInicio}
                  onChange={(e) => setForm({ ...form, veiculacaoInicio: e.target.value })}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="orc-fim">Veiculação — até (dia)</Label>
                <Input
                  id="orc-fim"
                  type="number"
                  min="1"
                  max="31"
                  value={form.veiculacaoFim}
                  onChange={(e) => setForm({ ...form, veiculacaoFim: e.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Contas incluídas no gasto real</Label>
              <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-muted/30 p-3">
                {(contasData?.data ?? []).map((c: any) => {
                  const ativa = form.contas.includes(c.id)
                  return (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground transition hover:text-foreground"
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={ativa}
                        onChange={() =>
                          setForm({
                            ...form,
                            contas: ativa
                              ? form.contas.filter((x) => x !== c.id)
                              : [...form.contas, c.id],
                          })
                        }
                      />
                      <span className="truncate">{c.name}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                        {c.id}
                      </span>
                    </label>
                  )
                })}
                {(contasData?.data ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground">Carregando contas…</p>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">O gasto real é somado nas contas marcadas.</p>
            </div>

            {msg && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                {msg}
              </p>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvar}
                disabled={salvando}
                className="shine inline-flex items-center gap-2 rounded-lg bg-gradient-to-b from-primary to-primary/90 px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-[0_8px_24px_-6px_rgb(178_34_34/0.5)] transition hover:brightness-110 disabled:opacity-60"
              >
                {salvando ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </Card>
  )
}

function OrcKpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 truncate font-display text-lg font-bold tabular-nums tracking-tight",
          accent ? "text-red-600" : "text-foreground"
        )}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={sub}>
          {sub}
        </p>
      )}
    </div>
  )
}
