"use client"
import { useCallback, useEffect, useState } from "react"
import { Pause, Play, Loader2, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/primitives"

type Estado = {
  pausado: boolean
  active_automations: number
  paused_automations: number
  pending_jobs: number
  active_ai_agents: number
  total_automations: number
  total_ai_agents: number
}

const ESTADO_INICIAL: Estado = { pausado: false, active_automations: 0, paused_automations: 0, pending_jobs: 0, active_ai_agents: 0, total_automations: 0, total_ai_agents: 0 }

// Botão redondo de parada de emergência: pausa TODAS as automações e a IA de uma vez.
export function EmergencyPauseButton({ compact = false }: { compact?: boolean }) {
  const toast = useToast()
  const [estado, setEstado] = useState<Estado>(ESTADO_INICIAL)
  const [carregando, setCarregando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  const carregar = useCallback(() => {
    fetch("/api/automation/global-pause")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setEstado(d) })
      .catch(() => {})
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function alternar() {
    if (!estado.pausado && !confirmando) { setConfirmando(true); return }
    setConfirmando(false)
    setCarregando(true)
    try {
      const r = await fetch("/api/automation/global-pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pausado: !estado.pausado }),
      })
      const d = await r.json()
      if (!d.ok) throw new Error(d.erro || "Falha")
      setEstado({ ...estado, pausado: d.pausado })
      toast(d.pausado ? "TUDO pausado — automações, fila e IA paradas" : "Automações e IA retomadas")
    } catch (e: any) {
      toast(e.message || "Erro ao alternar pausa", "error")
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={alternar}
        disabled={carregando}
        className={cn(
          "inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition disabled:opacity-50",
          estado.pausado
            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
            : "border-red-500/50 bg-red-500/15 text-red-400 hover:bg-red-500/25",
        )}
      >
        {carregando ? <Loader2 className="size-4 animate-spin" /> : estado.pausado ? <Play className="size-4" /> : <Pause className="size-4" />}
        {compact ? (estado.pausado ? "Retomar" : "Pausar") : (estado.pausado ? "Retomar tudo" : "Pausar tudo (STOP)")}
      </button>
      {estado.pausado ? (
        !compact && (
          <p className="text-center text-[11px] text-emerald-500/80">
            Tudo pausado. Nada será enviado até retomar.
          </p>
        )
      ) : (
        !compact && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-red-500" />{estado.active_automations} automações ativas</span>
            <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-amber-500" />{estado.pending_jobs} jobs na fila</span>
            {estado.active_ai_agents > 0 && <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-cyan-500" />{estado.active_ai_agents} IA(s) ativa(s)</span>}
          </div>
        )
      )}
      {confirmando && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3">
          <p className="flex items-start gap-2 text-xs text-red-200">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            Confirma a parada TOTAL? Automações serão pausadas, a fila cancelada e a IA desligada. Para retomar, clique de novo.
          </p>
          <div className="mt-2 flex gap-2">
            <button onClick={alternar} className="flex-1 rounded-md bg-red-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-600">Confirmar STOP</button>
            <button onClick={() => setConfirmando(false)} className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}