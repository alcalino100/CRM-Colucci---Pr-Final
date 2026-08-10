"use client"

import { useEffect, useMemo, useState } from "react"
import { SearchX } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { isGestorNivel, podeLocacao } from "@/lib/roles"
import { useLeads } from "@/lib/leads-store"
import { useLocacao } from "@/lib/locacao-store"
import { Badge, Card, CardContent, CardHeader, CardTitle, Input, Select, Skeleton } from "@/components/ui/primitives"
import { PageHeading } from "@/components/ui/page-heading"
import { AUDIT_TIPO_LABEL, AUDIT_TIPO_VARIANT, fmtDateTime } from "@/lib/labels"
import type { AuditTipo } from "@/lib/mock-data"

const PAGINA = 50

export default function RegistrosLocacaoAuditoriaPage() {
  const { user } = useAuth()
  const { audit } = useLeads()
  const { leads } = useLocacao()
  const [loading, setLoading] = useState(true)
  const [fTipo, setFTipo] = useState<AuditTipo | "todos">("todos")
  const [query, setQuery] = useState("")
  const [limite, setLimite] = useState(PAGINA)

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 400)
    return () => clearTimeout(t)
  }, [])

  if (user && !podeLocacao(user.role)) return null
  const isGestor = isGestorNivel(user?.role ?? "corretor")

  // Filtra o histórico para os leads de locação (pelo leadId) e eventos específicos do módulo
  const filtrados = useMemo(() => {
    const locacaoIds = new Set(leads.map((l) => l.id))
    const termo = query.trim().toLowerCase()
    return [...audit]
      .filter((e) => (e.leadId && locacaoIds.has(e.leadId)) || String(e.tipo).startsWith("locacao_"))
      .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())
      .filter((e) => (fTipo === "todos" ? true : e.tipo === fTipo))
      .filter((e) => {
        if (!termo) return true
        return [e.leadNome, e.usuarioNome, e.descricao, e.motivo, e.motivoDetalhe, e.referencias]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(termo))
      })
  }, [audit, leads, fTipo, query])

  const visiveis = filtrados.slice(0, limite)

  useEffect(() => {
    setLimite(PAGINA)
  }, [fTipo, query])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!isGestor) {
    return <p className="py-16 text-center text-muted-foreground">Acesso restrito aos gestores.</p>
  }

  const tipos = Object.keys(AUDIT_TIPO_LABEL) as AuditTipo[]

  return (
    <div className="space-y-5">
      <PageHeading title="Registros de Auditoria" subtitle="Histórico de ações da equipe de locação (somente leitura)." badge="Auditoria" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <label htmlFor="f-tipo" className="text-xs font-medium text-muted-foreground">Tipo de ação</label>
            <Select id="f-tipo" value={fTipo} onChange={(e) => setFTipo(e.target.value as AuditTipo | "todos")}>
              <option value="todos">Todos os tipos</option>
              {tipos.map((t) => (
                <option key={t} value={t}>{AUDIT_TIPO_LABEL[t]}</option>
              ))}
            </Select>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="f-busca" className="text-xs font-medium text-muted-foreground">Busca</label>
            <Input
              id="f-busca"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Lead, usuário, descrição ou motivo…"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">
            {filtrados.length} {filtrados.length === 1 ? "registro" : "registros"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {visiveis.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
              <SearchX className="size-8" />
              <p className="text-sm">Nenhum registro encontrado para os filtros selecionados.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {visiveis.map((e) => (
                <li key={e.id} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-start sm:gap-4">
                  <div className="flex shrink-0 items-center gap-2 sm:w-44">
                    <Badge variant={AUDIT_TIPO_VARIANT[e.tipo]}>{AUDIT_TIPO_LABEL[e.tipo]}</Badge>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">
                      {e.descricao}
                      {e.leadNome ? <span className="text-muted-foreground"> — {e.leadNome}</span> : null}
                    </p>
                    {(e.motivo || e.motivoDetalhe) && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {e.motivo ? <span className="font-medium text-foreground">{e.motivo}</span> : null}
                        {e.motivo && e.motivoDetalhe ? ": " : null}
                        {e.motivoDetalhe}
                      </p>
                    )}
                    {e.referencias ? <p className="mt-0.5 text-xs text-muted-foreground">Ref.: {e.referencias}</p> : null}
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground sm:text-right">
                    <p>{e.usuarioNome}</p>
                    <p>{fmtDateTime(e.criadoEm)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {limite < filtrados.length && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setLimite((n) => n + PAGINA)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                Carregar mais ({filtrados.length - limite} restantes)
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
