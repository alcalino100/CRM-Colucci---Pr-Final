"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, Select } from "@/components/ui/primitives"

export function RelatoriosSection() {
  const [dias, setDias] = useState(7)
  const [vals, setVals] = useState<Record<string, number | string>>({})

  useEffect(() => {
    ;(async () => {
      const corte = new Date(Date.now() - dias * 86400000).toISOString()
      const out: Record<string, number | string> = {}
      const jobs = async (status: string) => {
        try {
          const r = await supabase
            .from("automation_jobs")
            .select("id", { count: "exact", head: true })
            .eq("status", status)
            .gte("sent_at", corte)
          return (r as { count: number | null }).count ?? 0
        } catch {
          return "?"
        }
      }
      const logs = async (ev: string) => {
        try {
          const r = await supabase
            .from("automation_logs")
            .select("id", { count: "exact", head: true })
            .eq("event_type", ev)
            .gte("created_at", corte)
          return (r as { count: number | null }).count ?? 0
        } catch {
          return "?"
        }
      }
      out.respostas_ia = await logs("ia_resposta_enviada")
      out.handoffs = await logs("ia_handoff_humano")
      out.triagens = await logs("lead_followup_sem_resposta_triagem")
      out.reativacoes = await logs("lead_reativado_trafego_pago_reativacao_base")
      out.msgs_enviadas = await jobs("sent")
      setVals(out)
    })()
  }, [dias])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Relatórios</CardTitle>
      </CardHeader>
      <CardContent>
        <Select
          value={String(dias)}
          onChange={(e) => setDias(Number(e.target.value))}
          className="mb-3 h-8 w-40 text-xs"
        >
          <option value="7">Últimos 7 dias</option>
          <option value="30">Últimos 30 dias</option>
        </Select>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ["Respostas da IA", vals.respostas_ia],
            ["Handoffs p/ humano", vals.handoffs],
            ["Reativações de base", vals.reativacoes],
            ["Triagens humanas", vals.triagens],
            ["Msgs automação enviadas", vals.msgs_enviadas],
          ].map(([label, v]) => (
            <div key={label as string} className="rounded-lg border border-border p-3">
              <p className="text-2xl font-bold">{v === undefined ? "…" : v}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
