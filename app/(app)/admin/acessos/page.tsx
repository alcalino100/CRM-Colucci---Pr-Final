"use client"

import { useState } from "react"
import { Plus, Eye, EyeOff, Pencil } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLeads } from "@/lib/leads-store"
import { Button } from "@/components/ui/button"
import { Badge, Card, Dialog, Input, Label, Select, Table, TD, TH, THead, TR, useToast } from "@/components/ui/primitives"
import { ROLE_VARIANT } from "@/lib/labels"
import type { Role, User } from "@/lib/mock-data"

type FormState = { nome: string; email: string; senha: string; role: Role; ativo: boolean }
const empty: FormState = { nome: "", email: "", senha: "", role: "corretor", ativo: true }

export default function AcessosPage() {
  const { user } = useAuth()
  const { users, addUser, updateUser } = useLeads()
  const toast = useToast()
  const [showSenha, setShowSenha] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<User | null>(null)
  const [novo, setNovo] = useState(false)
  const [form, setForm] = useState<FormState>(empty)
  const [error, setError] = useState("")

  if (user?.role !== "gestor") {
    return <p className="py-16 text-center text-muted-foreground">Acesso restrito a gestores.</p>
  }

  function openNovo() {
    setForm(empty); setError(""); setNovo(true)
  }
  function openEdit(u: User) {
    setForm({ nome: u.nome, email: u.email, senha: u.senha, role: u.role, ativo: u.ativo }); setError(""); setEditing(u)
  }

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((s) => ({ ...s, [k]: v }))
  }

  function validate() {
    if (!form.nome.trim()) return "Informe o nome."
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) return "E-mail inválido."
    if (form.senha.length < 6) return "A senha deve ter ao menos 6 caracteres."
    return ""
  }

  function submitNovo(e: React.FormEvent) {
    e.preventDefault()
    const v = validate()
    if (v) { setError(v); return }
    const res = addUser(form)
    if (!res.ok) { setError(res.error!); return }
    toast("Usuário cadastrado com sucesso.")
    setNovo(false)
  }
  function submitEdit(e: React.FormEvent) {
    e.preventDefault()
    const v = validate()
    if (v) { setError(v); return }
    const res = updateUser(editing!.id, form)
    if (!res.ok) { setError(res.error!); return }
    toast("Alterações salvas.")
    setEditing(null)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Gestão de Acessos</h1>
          <p className="text-sm text-muted-foreground">Gerencie corretores e gestores da equipe.</p>
        </div>
        <Button onClick={openNovo}><Plus className="size-4" /> Novo Usuário</Button>
      </div>

      <Card>
        <Table>
          <THead>
            <TR><TH>Nome</TH><TH>E-mail</TH><TH>Senha</TH><TH>Perfil</TH><TH>Status</TH><TH>Ações</TH></TR>
          </THead>
          <tbody>
            {users.map((u) => (
              <TR key={u.id}>
                <TD className="font-medium">{u.nome}</TD>
                <TD className="text-muted-foreground">{u.email}</TD>
                <TD>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-muted-foreground">{showSenha[u.id] ? u.senha : "••••••"}</span>
                    <button onClick={() => setShowSenha((s) => ({ ...s, [u.id]: !s[u.id] }))} aria-label="Mostrar senha" className="text-muted-foreground hover:text-foreground">
                      {showSenha[u.id] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </TD>
                <TD><Badge variant={ROLE_VARIANT[u.role]}>{u.role === "gestor" ? "Gestor" : "Corretor"}</Badge></TD>
                <TD><Badge variant={u.ativo ? "green" : "gray"}>{u.ativo ? "Ativo" : "Inativo"}</Badge></TD>
                <TD><Button variant="outline" size="sm" onClick={() => openEdit(u)}><Pencil className="size-3.5" /> Editar</Button></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>

      <Dialog open={novo} onClose={() => setNovo(false)} title="Novo Usuário">
        <UserForm form={form} set={set} error={error} onSubmit={submitNovo} onCancel={() => setNovo(false)} submitLabel="Cadastrar" />
      </Dialog>
      <Dialog open={!!editing} onClose={() => setEditing(null)} title="Editar Usuário">
        <UserForm form={form} set={set} error={error} onSubmit={submitEdit} onCancel={() => setEditing(null)} submitLabel="Salvar alterações" />
      </Dialog>
    </div>
  )
}

function UserForm({
  form, set, error, onSubmit, onCancel, submitLabel,
}: {
  form: FormState
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void
  error: string
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
  submitLabel: string
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-col gap-1">
        <Label htmlFor="un">Nome *</Label>
        <Input id="un" value={form.nome} onChange={(e) => set("nome", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="ue">E-mail *</Label>
        <Input id="ue" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="us">Senha *</Label>
          <Input id="us" value={form.senha} onChange={(e) => set("senha", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="ur">Perfil</Label>
          <Select id="ur" value={form.role} onChange={(e) => set("role", e.target.value as Role)}>
            <option value="corretor">Corretor</option>
            <option value="gestor">Gestor</option>
          </Select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.ativo} onChange={(e) => set("ativo", e.target.checked)} className="size-4 accent-[var(--primary)]" />
        Usuário ativo
      </label>
      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="mt-1 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  )
}
