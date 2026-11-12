"use client"

import * as React from "react"
import { X, CheckCircle2, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

/* Card */
export function Card({ className, children, ...p }: React.ComponentProps<"div">) {
  return (
    <div className={cn("relative rounded-xl border border-border bg-card text-card-foreground shadow-[0_1px_2px_rgb(0_0_0/0.04)]", className)} {...p}>
      {children}
    </div>
  )
}
export function CardHeader({ className, ...p }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 p-5", className)} {...p} />
}
export function CardTitle({ className, ...p }: React.ComponentProps<"h3">) {
  return <h3 className={cn("font-display text-base font-semibold", className)} {...p} />
}
export function CardContent({ className, ...p }: React.ComponentProps<"div">) {
  return <div className={cn("p-5 pt-0", className)} {...p} />
}

/* Badge */
export function Badge({ className, variant = "default", ...p }: React.ComponentProps<"span"> & { variant?: string }) {
  const variants: Record<string, string> = {
    default: "bg-primary/10 text-primary",
    accent: "bg-accent/15 text-accent",
    slate: "bg-secondary/10 text-secondary",
    green: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-sky-100 text-sky-700",
    teal: "bg-teal-100 text-teal-700",
    slateblue: "bg-slate-200 text-slate-600",
    gray: "bg-muted text-muted-foreground",
    indigo: "bg-indigo-100 text-indigo-700",
    violet: "bg-violet-100 text-violet-700",
    purple: "bg-purple-100 text-purple-700",
    sky: "bg-sky-100 text-sky-700",
  }
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", variants[variant] ?? variants.default, className)} {...p} />
}

/* Input / Textarea / Label / Select */
export function Input({ className, ...p }: React.ComponentProps<"input">) {
  return <input className={cn("h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-50", className)} {...p} />
}
export function Textarea({ className, ...p }: React.ComponentProps<"textarea">) {
  return <textarea className={cn("min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30", className)} {...p} />
}
export function Label({ className, ...p }: React.ComponentProps<"label">) {
  return <label className={cn("text-sm font-medium text-foreground", className)} {...p} />
}
export function Select({ className, ...p }: React.ComponentProps<"select">) {
  return <select className={cn("h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30", className)} {...p} />
}

/* Table */
export function Table({ className, ...p }: React.ComponentProps<"table">) {
  return <div className="w-full overflow-x-auto"><table className={cn("w-full text-sm", className)} {...p} /></div>
}
export function THead({ className, ...p }: React.ComponentProps<"thead">) {
  return <thead className={cn("border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground", className)} {...p} />
}
export function TR({ className, ...p }: React.ComponentProps<"tr">) {
  return <tr className={cn("border-b border-border/60 last:border-0", className)} {...p} />
}
export function TH({ className, ...p }: React.ComponentProps<"th">) {
  return <th className={cn("px-3 py-2.5 font-medium", className)} {...p} />
}
export function TD({ className, ...p }: React.ComponentProps<"td">) {
  return <td className={cn("px-3 py-3 align-middle", className)} {...p} />
}

/* Skeleton */
export function Skeleton({ className, ...p }: React.ComponentProps<"div">) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...p} />
}

/* Dialog (modal com focus trap, ESC e restauração de foco acessível) */
export function Dialog({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: React.ReactNode; title: string }) {
  const dialogRef = React.useRef<HTMLDivElement>(null)
  const prevFocusRef = React.useRef<HTMLElement | null>(null)
  // Mantém o onClose mais recente sem recriar o efeito de foco: callers passam arrow functions
  // inline (nova identidade a cada render), o que reexecutava o efeito a cada tecla digitada e
  // devolvia o foco ao diálogo, tirando o cursor do input.
  const onCloseRef = React.useRef(onClose)
  React.useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  React.useEffect(() => {
    if (!open) return
    if (typeof document !== "undefined") {
      prevFocusRef.current = (document.activeElement as HTMLElement) || null
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    const timer = setTimeout(() => {
      // Foco inicial no diálogo só se o usuário ainda não estiver dentro dele (ex.: autoFocus em um campo)
      if (dialogRef.current && !dialogRef.current.contains(document.activeElement)) {
        dialogRef.current.focus()
      }
    }, 20)

    return () => {
      clearTimeout(timer)
      document.removeEventListener("keydown", handleKeyDown)
      if (prevFocusRef.current && typeof prevFocusRef.current.focus === "function") {
        try {
          prevFocusRef.current.focus()
        } catch {
          // ignore
        }
      }
    }
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/40 p-4 sm:items-center" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* Toast */
type Toast = { id: number; msg: string; type: "success" | "error" }
const ToastCtx = React.createContext<(msg: string, type?: "success" | "error") => void>(() => {})
export function useToast() { return React.useContext(ToastCtx) }
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])
  const push = React.useCallback((msg: string, type: "success" | "error" = "success") => {
    const id = Date.now()
    setToasts((t) => [...t, { id, msg, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-card p-3.5 shadow-[0_14px_36px_-10px_rgb(0_0_0/0.28)] animate-in slide-in-from-right-4 fade-in",
              t.type === "error" ? "border-destructive/30" : "border-emerald-500/30",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                t.type === "error" ? "bg-destructive/10 text-destructive" : "bg-emerald-100 text-emerald-600",
              )}
            >
              {t.type === "error" ? <AlertCircle className="size-4" /> : <CheckCircle2 className="size-4" />}
            </span>
            <p className="flex-1 text-sm font-medium leading-snug text-foreground">{t.msg}</p>
            <button
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              aria-label="Fechar"
              className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
