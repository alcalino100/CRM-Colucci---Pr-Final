"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Eye, Send } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLeads } from "@/lib/leads-store"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, Dialog, Label, Select, Table, TD, Textarea, TH, THead, TR, useToast } from "@/components/ui/primitives"
import { fmtDateTime } from "@/lib/labels"
import type { Role } from "@/lib/mock-data"

type Audience = "todos" | "gestores" | "corretores" | "usuario"

export default function NotificationDispatcherPage() {
  const { user } = useAuth()
  const router = useRouter()
  const toast = useToast()
  const { users, sentNotifications, sendAdminNotification, userName } = useLeads()
  const [message, setMessage] = useState("")
  const [audience, setAudience] = useState<Audience>("todos")
  const [selectedUser, setSelectedUser] = useState("")
  const [preview, setPreview] = useState(false)
  const [sending, setSending] = useState(false)
  const [submitError, setSubmitError] = useState("")

  useEffect(() => {
    if (user && user.role !== "gestor") router.replace("/painel-corretor")
  }, [user, router])

  const activeUsers = useMemo(() => users.filter((item) => item.ativo), [users])

  function target() {
    if (audience === "gestores") return { paraRole: "gestor" as Role, paraUsuarioId: null }
    if (audience === "corretores") return { paraRole: "corretor" as Role, paraUsuarioId: null }
    if (audience === "usuario") return { paraRole: null, paraUsuarioId: selectedUser }
    return { paraRole: null, paraUsuarioId: null }
  }

  function validate() {
    if (!message.trim()) return "Preencha a mensagem."
    if (audience === "usuario" && !selectedUser) return "Selecione um usuário."
    return ""
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const error = validate()
    if (error) { setSubmitError(error); return toast(error, "error") }
    setSubmitError("")
    setSending(true)
    const result = await sendAdminNotification({ mensagem: message.trim(), ...target() })
    setSending(false)
    if (!result.ok) {
      const detail = result.error ?? "Não foi possível concluir."
      setSubmitError(detail)
      return toast(detail, "error")
    }
    setSubmitError("")
    toast("Notificação enviada e confirmada.")
    setMessage(""); setSelectedUser("")
  }

  if (user && user.role !== "gestor") return null

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-balance">Disparador de Notificações</h1>
        <p className="text-sm text-muted-foreground">Envie comunicados segmentados para a equipe.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Nova notificação</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5 md:col-span-2"><Label htmlFor="notification-message">Mensagem</Label><Textarea id="notification-message" value={message} onChange={(e) => setMessage(e.target.value)} required className="min-h-28" /></div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="audience">Destinatário</Label><Select id="audience" value={audience} onChange={(e) => setAudience(e.target.value as Audience)}><option value="todos">Todos os usuários</option><option value="gestores">Somente gestores</option><option value="corretores">Somente corretores</option><option value="usuario">Usuário específico</option></Select></div>
              {audience === "usuario" && <div className="flex flex-col gap-1.5"><Label htmlFor="specific-user">Buscar usuário por nome</Label><Select id="specific-user" value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)}><option value="">Selecione um usuário</option>{activeUsers.map((item) => <option key={item.id} value={item.id}>{item.nome} — {item.email}</option>)}</Select></div>}
            </div>
            {submitError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{submitError}</p>}
            <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => { const error = validate(); error ? toast(error, "error") : setPreview(true) }}><Eye className="size-4" /> Pré-visualizar</Button><Button type="submit" disabled={sending}><Send className="size-4" /> Enviar</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Histórico de notificações enviadas</CardTitle></CardHeader>
        {sentNotifications.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">Nenhuma notificação enviada.</div> : <Table><THead><TR><TH>Mensagem</TH><TH>Criada por</TH><TH>Enviada em</TH></TR></THead><tbody>{sentNotifications.map((item) => <TR key={item.id}><TD className="max-w-md text-foreground">{item.texto}</TD><TD>{item.criadoPor ? userName(item.criadoPor) : "Não informado"}</TD><TD>{fmtDateTime(item.timestamp)}</TD></TR>)}</tbody></Table>}
      </Card>

      <Dialog open={preview} onClose={() => setPreview(false)} title="Pré-visualização">
        <div className="flex flex-col gap-3"><p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{message}</p><Button onClick={() => setPreview(false)} className="self-end">Fechar</Button></div>
      </Dialog>
    </div>
  )
}
