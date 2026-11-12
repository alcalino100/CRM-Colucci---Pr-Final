"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TD,
  TH,
  THead,
  TR,
  useToast,
} from "@/components/ui/primitives"
import { btn } from "./MasterUiAtoms"

export interface AgenteRow {
  id: string
  name: string
  is_active: boolean
  model_name?: string
  config?: unknown
}

function cfgOf(a: AgenteRow): Record<string, unknown> {
  const c = a.config
  if (!c) return {}
  if (typeof c === "string") {
    try {
      return JSON.parse(c)
    } catch {
      return {}
    }
  }
  return c as Record<string, unknown>
}

export function IAsSection() {
  const toast = useToast()
  const [agentes, setAgentes] = useState<AgenteRow[]>([])
  const [loading, setLoading] = useState(true)

  const carregar = async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/ai")
      const j = await r.json()
      const arr = (Array.isArray(j) ? j : j.agents ?? j.data ?? []) as AgenteRow[]
      setAgentes(arr)
    } catch {
      setAgentes([])
    }
    setLoading(false)
  }
  useEffect(() => {
    carregar()
  }, [])

  const alternar = async (a: AgenteRow) => {
    try {
      const r = await fetch(`/api/ai/${a.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !a.is_active }),
      })
      if (!r.ok) throw new Error("falha")
      toast(`${a.name} ${!a.is_active ? "ativado" : "desativado"}.`)
      carregar()
    } catch {
      toast("Falha ao alternar.", "error")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>IAs & Bots</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-muted-foreground">Carregando...</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Agente</TH>
                <TH>Modelo</TH>
                <TH>Instância</TH>
                <TH>Status</TH>
                <TH></TH>
              </TR>
            </THead>
            <tbody>
              {agentes.map((a) => {
                const cfg = cfgOf(a)
                const rules = (cfg.rules ?? {}) as { enable?: boolean }
                return (
                  <TR key={a.id}>
                    <TD>{a.name}</TD>
                    <TD className="text-xs text-muted-foreground">{a.model_name ?? "—"}</TD>
                    <TD className="text-xs text-muted-foreground">{String(cfg.testInstance ?? "—")}</TD>
                    <TD>
                      <Badge>{a.is_active && rules.enable !== false ? "ativo" : "off"}</Badge>
                    </TD>
                    <TD className="flex gap-2">
                      <button type="button" onClick={() => alternar(a)} className={btn()}>
                        {a.is_active ? "Desativar" : "Ativar"}
                      </button>
                      <Link href="/ai-agents" className={btn()}>
                        Abrir bot
                      </Link>
                    </TD>
                  </TR>
                )
              })}
            </tbody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
