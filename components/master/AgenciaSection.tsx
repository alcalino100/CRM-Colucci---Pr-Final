"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { createWorkspace, listWorkspaces, type Workspace } from "@/lib/tenant"
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Table,
  TD,
  TH,
  THead,
  TR,
  useToast,
} from "@/components/ui/primitives"
import { btn } from "./MasterUiAtoms"

export function AgenciaSection() {
  const toast = useToast()
  const [contas, setContas] = useState<Workspace[]>([])
  const [faltaTabela, setFaltaTabela] = useState(false)
  const [slug, setSlug] = useState("")
  const [nome, setNome] = useState("")

  const carregar = async () => {
    const rows = await listWorkspaces()
    setContas(rows)
    setFaltaTabela(false)
    if (!rows.length) {
      try {
        const r = await supabase.from("workspaces").select("id").limit(1)
        if (r.error) setFaltaTabela(true)
      } catch {
        setFaltaTabela(true)
      }
    }
  }
  useEffect(() => {
    carregar()
  }, [])

  const criar = async () => {
    if (!slug.trim()) {
      toast("Informe o slug (ex.: cliente-x).", "error")
      return
    }
    const r = await createWorkspace(slug, nome)
    if (!r.ok) {
      toast(`Falha: ${r.erro}`, "error")
      return
    }
    toast(`Conta criada. Isolamento total vem na Fase B; por ora, provisione a infra dela.`)
    setSlug("")
    setNome("")
    carregar()
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Contas (agência) — Fase A: cadastro</CardTitle>
        </CardHeader>
        <CardContent>
          {faltaTabela && (
            <p className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
              Rode <code>scripts/028_workspaces.sql</code> no Supabase e recarregue.
            </p>
          )}
          <Table>
            <THead>
              <TR>
                <TH>Slug</TH>
                <TH>Nome</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <tbody>
              {contas.map((c) => (
                <TR key={c.id}>
                  <TD className="font-mono text-xs">{c.slug}</TD>
                  <TD>{c.name}</TD>
                  <TD>
                    <Badge>{c.active ? "ativa" : "pausada"}</Badge>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
          <div className="mt-3 flex flex-wrap gap-2">
            <Input
              placeholder="slug (ex.: imobiliaria-y)"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="h-9 max-w-56 text-xs"
            />
            <Input
              placeholder="nome da conta"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="h-9 max-w-56 text-xs"
            />
            <button type="button" onClick={criar} className={btn(true)}>
              Criar conta
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Fase B: isolamento por módulo, onboarding (usuários/marca/pipelines da conta) e
            suspensão.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
