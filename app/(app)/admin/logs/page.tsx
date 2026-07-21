"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronRight } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLeads } from "@/lib/leads-store"
import { Badge, Card, CardHeader, CardTitle, Select, Skeleton, Table, TD, TH, THead, TR } from "@/components/ui/primitives"
import { ACCESS_LABEL, ACTION_LABEL, ACTION_VARIANT, fmtDateTime } from "@/lib/labels"
import { ACCESS_LOGS, USERS } from "@/lib/mock-data"

export default function LogsPage() {
  const { user } = useAuth()
  const { changeLogs } = useLeads()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [fUser, setFUser] = useState("todos")
  const [fAcao, setFAcao] = useState("todos")
  const [fEntidade, setFEntidade] = useState("todos")
  const [dias, setDias] = useState("todos")
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    if (user && user.role !== "gestor") router.replace("/painel-corretor")
  }, [user, router])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 700)
    return () => clearTimeout(t)
  }, [])

  const changes = useMemo(() => {
    const limite = new Date(); limite.setDate(limite.getDate() - Number(dias))
    return changeLogs.filter((c) => {
      const mu = fUser === "todos" || c.usuario === fUser
      const ma = fAcao === "todos" || c.acao === fAcao
      const me = fEntidade === "todos" || c.entidade === fEntidade
      const md = dias === "todos" || new Date(c.dataHora) >= limite
      return mu && ma && me && md
    })
  }, [fUser, fAcao, fEntidade, dias, changeLogs])

  if (user && user.role !== "gestor") return null

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Logs</h1>
        <p className="text-sm text-muted-foreground">Auditoria de alterações e acessos ao sistema.</p>
      </div>

      {/* Alterações */}
      <Card>
        <CardHeader><CardTitle>Log de alterações</CardTitle></CardHeader>
        <div className="flex flex-col gap-3 px-5 pb-4 sm:flex-row sm:flex-wrap">
          <Select value={fUser} onChange={(e) => setFUser(e.target.value)} aria-label="Filtrar usuário" className="sm:w-48">
            <option value="todos">Todos usuários</option>
            {USERS.map((u) => <option key={u.id} value={u.nome}>{u.nome}</option>)}
          </Select>
          <Select value={fAcao} onChange={(e) => setFAcao(e.target.value)} aria-label="Filtrar ação" className="sm:w-40">
            <option value="todos">Todas ações</option>
            <option value="criacao">Criação</option><option value="edicao">Edição</option><option value="exclusao">Exclusão</option>
          </Select>
          <Select value={fEntidade} onChange={(e) => setFEntidade(e.target.value)} aria-label="Filtrar entidade" className="sm:w-40">
            <option value="todos">Todas entidades</option>
            <option value="lead">Lead</option><option value="imovel">Imóvel</option><option value="usuario">Usuário</option>
          </Select>
          <Select value={dias} onChange={(e) => setDias(e.target.value)} aria-label="Filtrar período" className="sm:w-40">
            <option value="todos">Todo período</option>
            <option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option>
          </Select>
        </div>

        {loading ? (
          <div className="flex flex-col gap-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : changes.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted-foreground">Nenhum registro encontrado para o filtro selecionado</p>
        ) : (
          <Table>
            <THead><TR><TH className="w-8" /><TH>Data/hora</TH><TH>Usuário</TH><TH>Ação</TH><TH>Entidade</TH><TH>Campo</TH></TR></THead>
            <tbody>
              {changes.map((c) => (
                <Fragment key={c.id}>
                  <TR className="cursor-pointer hover:bg-muted/50" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                    <TD>{expanded === c.id ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</TD>
                    <TD className="whitespace-nowrap text-muted-foreground">{fmtDateTime(c.dataHora)}</TD>
                    <TD className="font-medium">{c.usuario}</TD>
                    <TD><Badge variant={ACTION_VARIANT[c.acao]}>{ACTION_LABEL[c.acao]}</Badge></TD>
                    <TD className="capitalize">{c.entidade}</TD>
                    <TD className="text-muted-foreground">{c.campo}</TD>
                  </TR>
                  {expanded === c.id && (
                    <tr>
                      <td colSpan={6} className="bg-muted/40 px-6 py-3">
                        <pre className="overflow-x-auto rounded-lg bg-card p-3 text-xs">
{JSON.stringify({ campo: c.campo, antes: c.valorAnterior, depois: c.valorNovo }, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Acessos */}
      <Card>
        <CardHeader><CardTitle>Log geral de acessos</CardTitle></CardHeader>
        {loading ? (
          <div className="flex flex-col gap-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <Table>
            <THead><TR><TH>Data/hora</TH><TH>Usuário</TH><TH>Ação</TH></TR></THead>
            <tbody>
              {ACCESS_LOGS.map((a) => (
                <TR key={a.id}>
                  <TD className="whitespace-nowrap text-muted-foreground">{fmtDateTime(a.dataHora)}</TD>
                  <TD className="font-medium">{a.usuario}</TD>
                  <TD>
                    <Badge variant={a.acao === "tentativa falha" ? "red" : a.acao === "login" ? "green" : "gray"}>
                      {ACCESS_LABEL[a.acao]}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  )
}
