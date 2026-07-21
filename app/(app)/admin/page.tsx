"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, CheckCircle2, Plus } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLeads } from "@/lib/leads-store"
import { LeadForm, type LeadFormValues } from "@/components/lead-form"
import { Button } from "@/components/ui/button"
import { Badge, Card, CardHeader, CardTitle, Dialog, Input, Label, Select, Table, TD, TH, THead, TR, useToast } from "@/components/ui/primitives"
import { brl, fmtDate, PROP_LABEL, PROP_VARIANT, ROLE_VARIANT, STATUS_LABEL, STATUS_VARIANT } from "@/lib/labels"
import { PROPERTIES, USERS, type Lead, type Property, type PropertyStatus, type Role, type User } from "@/lib/mock-data"

export default function AdminPage() {
  const { user } = useAuth()
  const router = useRouter()
  const toast = useToast()
  const { leads, updateLead } = useLeads()

  const [users, setUsers] = useState<User[]>(USERS)
  const [props, setProps] = useState<Property[]>(PROPERTIES)
  const [editingLead, setEditingLead] = useState<Lead | null>(null)
  const [propModal, setPropModal] = useState(false)

  useEffect(() => {
    if (user && user.role !== "gestor") router.replace("/painel-corretor")
  }, [user, router])

  const pendencias = useMemo(() => leads.filter((l) => !l.telefone || !l.imovelRef), [leads])

  function toggleAtivo(id: string) {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ativo: !u.ativo } : u)))
    const u = users.find((x) => x.id === id)
    toast(`Usuário ${u?.ativo ? "desativado" : "ativado"}: ${u?.nome}`)
  }
  function changeRole(id: string, role: Role) {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)))
    toast("Permissões atualizadas.")
  }
  function corrigirLead(v: LeadFormValues) {
    updateLead(editingLead!.id, v)
    setEditingLead(null)
    toast("Lead corrigido com sucesso.")
  }
  function addProperty(p: Omit<Property, "id">) {
    setProps((prev) => [{ ...p, id: `p${Date.now()}` }, ...prev])
    setPropModal(false)
    toast("Imóvel cadastrado.")
  }

  if (user && user.role !== "gestor") return null

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Administração</h1>
        <p className="text-sm text-muted-foreground">Gestão de usuários, conferência de dados e imóveis.</p>
      </div>

      {/* Usuários */}
      <Card>
        <CardHeader><CardTitle>Gestão de usuários</CardTitle></CardHeader>
        <Table>
          <THead><TR><TH>Nome</TH><TH>E-mail</TH><TH>Permissão</TH><TH>Status</TH><TH>Criado</TH><TH>Ações</TH></TR></THead>
          <tbody>
            {users.map((u) => (
              <TR key={u.id}>
                <TD className="font-medium">{u.nome}</TD>
                <TD className="text-muted-foreground">{u.email}</TD>
                <TD>
                  <Select value={u.role} onChange={(e) => changeRole(u.id, e.target.value as Role)} aria-label={`Permissão de ${u.nome}`} className="h-8 w-32">
                    <option value="corretor">Corretor</option>
                    <option value="gestor">Gestor</option>
                  </Select>
                </TD>
                <TD><Badge variant={u.ativo ? "green" : "gray"}>{u.ativo ? "Ativo" : "Inativo"}</Badge></TD>
                <TD className="text-muted-foreground">{fmtDate(u.criadoEm)}</TD>
                <TD>
                  <Button variant={u.ativo ? "destructive" : "outline"} size="sm" onClick={() => toggleAtivo(u.id)}>
                    {u.ativo ? "Desativar" : "Ativar"}
                  </Button>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>

      {/* Conferência */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Conferência de dados</CardTitle>
          <Badge variant={pendencias.length ? "amber" : "green"}>{pendencias.length} pendência(s)</Badge>
        </CardHeader>
        {pendencias.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <CheckCircle2 className="size-8 text-emerald-500" />
            <p className="text-sm text-muted-foreground">Nenhuma pendência encontrada</p>
          </div>
        ) : (
          <Table>
            <THead><TR><TH>Lead</TH><TH>Problema</TH><TH>Status</TH><TH>Ação</TH></TR></THead>
            <tbody>
              {pendencias.map((l) => (
                <TR key={l.id}>
                  <TD className="font-medium">{l.nome}</TD>
                  <TD>
                    <span className="flex items-center gap-1.5 text-sm text-amber-700">
                      <AlertTriangle className="size-4" />
                      {[!l.telefone && "sem telefone", !l.imovelRef && "sem imóvel"].filter(Boolean).join(", ")}
                    </span>
                  </TD>
                  <TD><Badge variant={STATUS_VARIANT[l.status]}>{STATUS_LABEL[l.status]}</Badge></TD>
                  <TD><Button variant="outline" size="sm" onClick={() => setEditingLead(l)}>Corrigir</Button></TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Imóveis */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Cadastro de imóveis</CardTitle>
          <Button onClick={() => setPropModal(true)}><Plus className="size-4" /> Novo Imóvel</Button>
        </CardHeader>
        <Table>
          <THead><TR><TH>Referência</TH><TH>Endereço</TH><TH>Tipo</TH><TH>Valor tabela</TH><TH>Status</TH></TR></THead>
          <tbody>
            {props.map((p) => (
              <TR key={p.id}>
                <TD className="font-medium">{p.referencia}</TD>
                <TD className="text-muted-foreground">{p.endereco}</TD>
                <TD>{p.tipo}</TD>
                <TD>{brl(p.valorTabela)}</TD>
                <TD><Badge variant={PROP_VARIANT[p.status]}>{PROP_LABEL[p.status]}</Badge></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>

      <Dialog open={!!editingLead} onClose={() => setEditingLead(null)} title="Corrigir lead">
        {editingLead && <LeadForm initial={editingLead} defaultCorretorId={editingLead.corretorId} showCorretor onSubmit={corrigirLead} onCancel={() => setEditingLead(null)} />}
      </Dialog>

      <Dialog open={propModal} onClose={() => setPropModal(false)} title="Novo Imóvel">
        <PropertyForm onSubmit={addProperty} onCancel={() => setPropModal(false)} />
      </Dialog>
    </div>
  )
}

function PropertyForm({ onSubmit, onCancel }: { onSubmit: (p: Omit<Property, "id">) => void; onCancel: () => void }) {
  const [p, setP] = useState({ referencia: "", endereco: "", tipo: "Apartamento", valorTabela: 0, status: "disponivel" as PropertyStatus })
  const [err, setErr] = useState("")
  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!p.referencia.trim() || !p.endereco.trim() || p.valorTabela <= 0) { setErr("Preencha referência, endereço e valor."); return }
    onSubmit(p)
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1"><Label>Referência</Label><Input value={p.referencia} onChange={(e) => setP({ ...p, referencia: e.target.value })} aria-label="Referência" placeholder="AP-1010" /></div>
        <div className="flex flex-col gap-1"><Label>Tipo</Label>
          <Select value={p.tipo} onChange={(e) => setP({ ...p, tipo: e.target.value })} aria-label="Tipo">
            {["Apartamento", "Casa", "Sala Comercial", "Terreno"].map((t) => <option key={t}>{t}</option>)}
          </Select>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2"><Label>Endereço</Label><Input value={p.endereco} onChange={(e) => setP({ ...p, endereco: e.target.value })} aria-label="Endereço" /></div>
        <div className="flex flex-col gap-1"><Label>Valor de tabela (R$)</Label><Input type="number" value={p.valorTabela || ""} onChange={(e) => setP({ ...p, valorTabela: Number(e.target.value) })} aria-label="Valor de tabela" /></div>
        <div className="flex flex-col gap-1"><Label>Status</Label>
          <Select value={p.status} onChange={(e) => setP({ ...p, status: e.target.value as PropertyStatus })} aria-label="Status">
            <option value="disponivel">Disponível</option><option value="vendido">Vendido</option><option value="alugado">Alugado</option>
          </Select>
        </div>
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit">Salvar</Button>
      </div>
    </form>
  )
}
