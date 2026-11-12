"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/lib/auth-context"
import { Card, CardContent, CardHeader, CardTitle, useToast } from "@/components/ui/primitives"
import { cn } from "@/lib/utils"
import { btn } from "./MasterUiAtoms"

export function AutomacoesSection() {
  const toast = useToast()
  const { user } = useAuth()
  const [status, setStatus] = useState<Record<string, unknown> | null>(null)
  const [dry, setDry] = useState("")
  const [busy, setBusy] = useState(false)
  const [runOut, setRunOut] = useState("")
  const [resumo, setResumo] = useState("")
  const [saude, setSaude] = useState<{
    instancias?: { instance: string; state: string }[]
    automacoes?: { name: string; status: string; conectada: boolean }[]
    backlog?: { na_fila?: number; falhou_7d?: number }
    ultima_rodada?: { em?: string; resumo?: string } | null
  } | null>(null)

  const carregarSaude = async () => {
    try {
      const r = await fetch("/api/automation/worker-run")
      setSaude(await r.json())
    } catch {
      setSaude(null)
    }
  }

  const carregar = async () => {
    try {
      const r = await fetch("/api/automation/worker")
      setStatus(await r.json())
    } catch {
      setStatus(null)
    }
  }
  useEffect(() => {
    carregar()
    carregarSaude()
  }, [])

  const pausar = async (pausado: boolean) => {
    setBusy(true)
    try {
      const r = await fetch("/api/automation/global-pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pausado }),
      })
      if (!r.ok) throw new Error("falha")
      toast(pausado ? "Tudo pausado." : "Tudo retomado.")
      carregar()
    } catch {
      toast("Falha.", "error")
    }
    setBusy(false)
  }

  const simular = async () => {
    setDry("...")
    try {
      const r = await fetch("/api/automation/regressao-inatividade?dry=1")
      const j = await r.json()
      setDry(JSON.stringify(j, null, 1).slice(0, 2000))
    } catch {
      setDry("falha (verifique CRON_SECRET/login)")
    }
  }

  const executar = async () => {
    setBusy(true)
    setRunOut("executando (até ~4 min, não feche)...")
    try {
      const r = await fetch("/api/automation/worker-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user?.email ?? "" }),
      })
      const j = await r.json()
      setRunOut(JSON.stringify(j, null, 1).slice(0, 2000))
      if (j.ok) toast("Rodada concluída.")
      else toast(`Falha: ${j.erro ?? j.error ?? "?"}`, "error")
      carregar()
    } catch {
      setRunOut("falha de rede")
      toast("Falha.", "error")
    }
    setBusy(false)
  }

  const s = (status ?? {}) as Record<string, unknown>
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Motor de automações</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Ativas: {String(s.active_automations ?? "?")} · Pausadas:{" "}
            {String(s.paused_automations ?? "?")} · Jobs pendentes:{" "}
            {String(s.pending_jobs ?? "?")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={executar} className={btn(true)}>
              Executar agora
            </button>
            <button type="button" disabled={busy} onClick={() => pausar(true)} className={btn()}>
              Pausar tudo
            </button>
            <button type="button" disabled={busy} onClick={() => pausar(false)} className={btn()}>
              Retomar tudo
            </button>
            <Link href="/automacoes" className={btn()}>
              Abrir automações
            </Link>
            <Link href="/automacoes/logs" className={btn()}>
              Ver logs
            </Link>
          </div>
          {runOut && (
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted p-2 text-[11px]">
              {runOut}
            </pre>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Contingência (quedas de WhatsApp)</CardTitle>
        </CardHeader>
        <CardContent>
          {!saude ? (
            <p className="text-xs text-muted-foreground">Carregando saúde...</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {(saude.instancias ?? []).map((i) => (
                  <span
                    key={i.instance}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px]",
                      i.state === "open"
                        ? "border-green-600/40 bg-green-600/10"
                        : "border-red-600/40 bg-red-600/10"
                    )}
                  >
                    {i.instance}: {i.state === "open" ? "conectada" : i.state}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Fila agora: <b>{saude.backlog?.na_fila ?? "?"}</b> · Falharam (7d):{" "}
                <b>{saude.backlog?.falhou_7d ?? "?"}</b>
                {saude.ultima_rodada?.em
                  ? ` · Última rodada: ${saude.ultima_rodada.em.slice(0, 16).replace("T", " ")}`
                  : " · Sem rodada recente"}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {(saude.automacoes ?? []).map((a) => (
                  <span
                    key={a.name}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px]",
                      a.status === "active" && a.conectada
                        ? "border-green-600/40 bg-green-600/10"
                        : "border-red-600/40 bg-red-600/10"
                    )}
                  >
                    {a.name.slice(0, 28)}:{" "}
                    {a.status !== "active"
                      ? "pausada"
                      : a.conectada
                        ? "conectada"
                        : "SEM CONEXÃO"}
                  </span>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  className={btn()}
                  onClick={async () => {
                    setBusy(true)
                    try {
                      const r = await fetch("/api/automation/worker-run", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          email: user?.email ?? "",
                          action: "requeue-falhas",
                        }),
                      })
                      const j = await r.json()
                      toast(
                        j.ok
                          ? `Recolocados: ${j.recolocados}. Saem nas próximas rodadas.`
                          : `Falha: ${j.erro}`,
                        j.ok ? undefined : "error"
                      )
                      carregarSaude()
                    } catch {
                      toast("Falha.", "error")
                    }
                    setBusy(false)
                  }}
                >
                  Recolocar falhas da queda
                </button>
                <button type="button" onClick={carregarSaude} className={btn()}>
                  Atualizar
                </button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Resumo das 18h (Kleber)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-xs text-muted-foreground">
            Prévia exata do que a IA enviará hoje às 18h (seg–sex). Não envia nada.
          </p>
          <button
            type="button"
            disabled={busy}
            className={btn(true)}
            onClick={async () => {
              setBusy(true)
              try {
                const r = await fetch("/api/automation/resumo-diario?dry=1")
                const j = await r.json()
                setResumo(j.ok ? String(j.texto ?? "") : `Falha: ${j.erro ?? "?"}`)
              } catch {
                setResumo("Falha de rede.")
              }
              setBusy(false)
            }}
          >
            Pré-visualizar resumo de hoje
          </button>
          {resumo && (
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted p-3 text-xs">
              {resumo}
            </pre>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Simular regressão (dry-run, não move nada)</CardTitle>
        </CardHeader>
        <CardContent>
          <button type="button" onClick={simular} className={btn(true)}>
            Rodar simulação
          </button>
          {dry && (
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted p-2 text-[11px]">
              {dry}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
