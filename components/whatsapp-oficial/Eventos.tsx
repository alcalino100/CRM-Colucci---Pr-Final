"use client"
import { useCallback, useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives"
import { chamar } from "./use-oficial"

type Evento = { id: string; recebido_em: string; tipo: string; resumo: string | null }
const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })

/** Últimos eventos que a Meta mandou ao webhook (inclusive recusados, com o motivo). Atualiza sozinho a cada 10s. */
export function Eventos() {
  const [eventos, setEventos] = useState<Evento[]>([])
  const [aviso, setAviso] = useState("")
  const carregar = useCallback(async () => {
    const j = await chamar("/api/whatsapp/oficial/eventos", "GET")
    setEventos(j.eventos ?? []); setAviso(j.aviso ?? "")
  }, [])
  useEffect(() => {
    void carregar()
    const t = setInterval(() => { if (!document.hidden) void carregar() }, 10000)
    return () => clearInterval(t)
  }, [carregar])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Eventos recebidos da Meta (últimos 40)</CardTitle>
        <Button size="sm" variant="outline" onClick={carregar} aria-label="Atualizar"><RefreshCw className="size-3.5" /></Button>
      </CardHeader>
      <CardContent>
        {aviso && <p className="mb-2 text-xs text-amber-700">{aviso}</p>}
        {eventos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum evento ainda. Quando a Meta enviar algo (mensagem, status, verificação), aparece aqui.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border text-xs">
            {eventos.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-x-3 gap-y-0.5 px-3 py-1.5">
                <span className="font-mono text-muted-foreground">{hora(e.recebido_em)}</span>
                <span className={e.tipo === "recusado" || e.tipo === "erro" ? "font-semibold text-destructive" : "font-semibold"}>{e.tipo}</span>
                <span className="min-w-0 flex-1 break-words">{e.resumo}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
