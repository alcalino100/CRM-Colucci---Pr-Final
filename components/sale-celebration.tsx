"use client"

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import { Sparkles, X } from "lucide-react"
import { brl } from "@/lib/labels"

export type SaleInfo = {
  nome: string
  valor?: number
  ref?: string
  tipo?: string
  corretor?: string
}

type Active = SaleInfo & { id: number }

const TriggerCtx = createContext<(info: SaleInfo) => void>(() => {})

export function useSaleCelebration() {
  return useContext(TriggerCtx)
}

const FLY_EMOJIS = ["🎉", "💰", "🏠", "🎊", "🥳", "💸", "🔑", "🍾", "✨", "🎈", "🕺", "⭐"]

const DURATION = 6500

export function SaleCelebrationProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<Active[]>([])
  const idRef = useRef(0)

  const celebrate = useCallback((info: SaleInfo) => {
    const id = ++idRef.current
    setList((prev) => [...prev.slice(-2), { ...info, id }])
    setTimeout(() => setList((prev) => prev.filter((x) => x.id !== id)), DURATION)
  }, [])

  return (
    <TriggerCtx.Provider value={celebrate}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-3 px-4 sm:bottom-6">
        {list.map((c) => (
          <CelebrationCard key={c.id} sale={c} onClose={() => setList((prev) => prev.filter((x) => x.id !== c.id))} />
        ))}
      </div>
    </TriggerCtx.Provider>
  )
}

function CelebrationCard({ sale, onClose }: { sale: Active; onClose: () => void }) {
  const particles = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        emoji: FLY_EMOJIS[i % FLY_EMOJIS.length],
        left: 6 + Math.random() * 88,
        delay: Math.random() * 0.5,
        duration: 1.6 + Math.random() * 1.3,
        x: (Math.random() * 140 - 70).toFixed(0),
        rot: (Math.random() * 720 - 360).toFixed(0),
        size: 14 + Math.random() * 16,
      })),
    [sale.id],
  )

  return (
    <div className="pointer-events-auto relative w-full max-w-md">
      {/* emojis voando */}
      <div className="pointer-events-none absolute -inset-x-10 -top-1 bottom-0 overflow-visible">
        {particles.map((p) => (
          <span
            key={p.id}
            className="absolute select-none leading-none"
            style={
              {
                left: `${p.left}%`,
                top: "30%",
                fontSize: `${p.size}px`,
                "--confetti-x": `${p.x}px`,
                "--confetti-rot": `${p.rot}deg`,
                animation: `confetti-fly ${p.duration}s ease-out ${p.delay}s forwards`,
              } as React.CSSProperties
            }
          >
            {p.emoji}
          </span>
        ))}
      </div>

      {/* caixinha glass */}
      <div
        className="shine relative overflow-hidden rounded-2xl border border-white/30 bg-gradient-to-br from-primary via-accent to-primary/90 text-white shadow-[0_24px_70px_-15px_rgb(178_34_34/0.6)] backdrop-blur-xl"
        style={{ animation: "celeb-in 0.55s cubic-bezier(0.34,1.56,0.64,1) forwards" }}
      >
        <span aria-hidden className="pointer-events-none absolute -left-8 -top-10 size-28 rounded-full bg-white/20 blur-2xl" />
        <span aria-hidden className="pointer-events-none absolute -bottom-12 -right-6 size-32 rounded-full bg-amber-300/30 blur-2xl" />
        <div className="relative flex items-center gap-4 px-5 py-4">
          <span className="shrink-0 text-4xl leading-none" style={{ animation: "celeb-bounce 1.8s ease-in-out infinite" }}>🎉</span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-widest text-white/85">
              <Sparkles className="size-3.5" /> Venda fechada!
            </p>
            <p className="truncate font-display text-lg font-bold leading-tight">{sale.nome}</p>
            <p className="truncate text-sm text-white/90">
              {sale.valor != null ? brl(sale.valor) : ""}
              {sale.ref ? ` · Ref: ${sale.ref}` : ""}
              {sale.tipo ? ` · ${sale.tipo}` : ""}
              {sale.corretor ? ` · ${sale.corretor}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar celebração"
            className="shrink-0 rounded-full p-1.5 text-white/80 transition hover:bg-white/15 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
