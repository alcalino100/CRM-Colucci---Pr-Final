"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { BellOff, Eye, Send } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLeads } from "@/lib/leads-store"
import { Button } from "@/components/ui/button"
import { Badge, Card, CardContent, CardHeader, CardTitle, Dialog, Input, Label, Select, Table, TD, Textarea, TH, THead, TR, useToast } from "@/components/ui/primitives"
import { fmtDateTime } from "@/lib/labels"
import type { Role } from "@/lib/mock-data"

type Audience = "todos" | "gestores" | "corretores" | "usuario"
type Priority = "informativo" | "aviso" | "urgente"

const priorityLabel: Record<Priority, string> = { informativo: "Informativa", aviso: "Aviso", urgente: "Urgente" }
const priorityVariant: Record<Priority, string> = { informativo: "blue", aviso: "amber", urgente: "red" }

export default function NotificationDispatcherPage() {
  const { user } = useAuth()
  const router = useRouter()
  const toast = useToast()
  const { users, sentNotifications, scheduledNotifications, sendAdminNotification, scheduleAdminNotification } = useLeads()
  const [title, setTitle] = useState("")
  const [message, setMessage] = useState("")
  const [audience, setAudience] = useState<Audience>("todos")
  const [selectedUser, setSelectedUser] = useState("")
  const [priority, setPriority] = useState<Priority>("informativo")
  const [mode, setMode] = useState<"agora" | "agendar">("agora")
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
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
    if (!title.trim() || !message.trim()) return "Preencha título e mensagem."
    if (audience === "usuario" && !selectedUser) return "Selecione um usuário."
    if (mode === "agendar" && (!date || !time)) return "Preencha a data e a hora do envio."
    if (mode === "agendar" && new Date(`${date}T${time}`).getTime() <= Date.now()) return "Escolha uma data e hora futuras."
    return ""
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const error = validate()
    if (error) { setSubmitError(error); return toast(error, "error") }
    setSubmitError("")
    setSending(true)
    const base = { titulo: title.trim(), mensagem: message.trim(), prioridade: priority, ...target() }
    const result = mode === "agora"
      ? await sendAdminNotification(base)
      : await scheduleAdminNotification({ ...base, agendadaPara: new Date(`${date}T${time}`).toISOString() })
    setSending(false)
    if (!result.ok) {
      const detail = result.error ?? "Não foi possível concluir."
      setSubmitError(detail)
      return toast(detail, "error")
    }
    setSubmitError("")
    toast(mode === "agora" ? "Notificação enviada e confirmada." : "Notificação agendada e confirmada.")
    setTitle(""); setMessage(""); setSelectedUser(""); setDate(""); setTime("")
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
              <div className="flex flex-col gap-1.5 md:col-span-2"><Label htmlFor="notification-title">Título</Label><Input id="notification-title" value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
              <div className="flex flex-col gap-1.5 md:col-span-2"><Label htmlFor="notification-message">Mensagem</Label><Textarea id="notification-message" value={message} onChange={(e) => setMessage(e.target.value)} required className="min-h-28" /></div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="audience">Destinatário</Label><Select id="audience" value={audience} onChange={(e) => setAudience(e.target.value as Audience)}><option value="todos">Todos os usuários</option><option value="gestores">Somente gestores</option><option value="corretores">Somente corretores</option><option value="usuario">Usuário específico</option></Select></div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="priority">Tipo</Label><Select id="priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}><option value="informativo">Informativa</option><option value="aviso">Aviso</option><option value="urgente">Urgente</option></Select></div>
              {audience === "usuario" && <div className="flex flex-col gap-1.5 md:col-span-2"><Label htmlFor="specific-user">Buscar usuário por nome</Label><Select id="specific-user" value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)}><option value="">Selecione um usuário</option>{activeUsers.map((item) => <option key={item.id} value={item.id}>{item.nome} — {item.email}</option>)}</Select></div>}
            </div>
            <fieldset className="flex flex-wrap gap-4"><legend className="mb-2 text-sm font-medium">Envio</legend><label className="flex items-center gap-2 text-sm"><input type="radio" name="mode" checked={mode === "agora"} onChange={() => setMode("agora")} /> Enviar agora</label><label className="flex items-center gap-2 text-sm"><input type="radio" name="mode" checked={mode === "agendar"} onChange={() => setMode("agendar")} /> Agendar envio</label></fieldset>
            {mode === "agendar" && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div className="flex flex-col gap-1.5"><Label htmlFor="send-date">Data</Label><Input id="send-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div><div className="flex flex-col gap-1.5"><Label htmlFor="send-time">Hora</Label><Input id="send-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div></div>}
            {submitError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{submitError}</p>}
            <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => { const error = validate(); error ? toast(error, "error") : setPreview(true) }}><Eye className="size-4" /> Pré-visualizar</Button><Button type="submit" disabled={sending}><Send className="size-4" /> {mode === "agora" ? "Enviar" : "Agendar"}</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Notificações agendadas</CardTitle></CardHeader>
        {scheduledNotifications.length === 0 ? <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground"><BellOff className="size-6" /><p>Nenhuma notificação agendada.</p></div> : <Table><THead><TR><TH>Título</TH><TH>Tipo</TH><TH>Envio</TH><TH>Status</TH></TR></THead><tbody>{scheduledNotifications.map((item) => <TR key={item.id}><TD className="font-medium">{item.titulo}</TD><TD><Badge variant={priorityVariant[item.prioridade]}>{priorityLabel[item.prioridade]}</Badge></TD><TD>{fmtDateTime(item.agendadaPara)}</TD><TD><Badge variant={item.status === "enviada" ? "green" : item.status === "cancelada" ? "gray" : "amber"}>{item.status}</Badge></TD></TR>)}</tbody></Table>}
      </Card>

      <Card>
        <CardHeader><CardTitle>Histórico de notificações enviadas</CardTitle></CardHeader>
        {sentNotifications.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">Nenhuma notificação enviada.</div> : <Table><THead><TR><TH>Título</TH><TH>Mensagem</TH><TH>Tipo</TH><TH>Enviada em</TH></TR></THead><tbody>{sentNotifications.map((item) => <TR key={item.id}><TD className="font-medium">{item.titulo || "Sem título"}</TD><TD className="max-w-md text-muted-foreground">{item.texto}</TD><TD><Badge variant={priorityVariant[(item.prioridade as Priority) || "informativo"]}>{priorityLabel[(item.prioridade as Priority) || "informativo"]}</Badge></TD><TD>{fmtDateTime(item.timestamp)}</TD></TR>)}</tbody></Table>}
      </Card>

      <Dialog open={preview} onClose={() => setPreview(false)} title="Pré-visualização">
        <div className="flex flex-col gap-3"><Badge className="self-start" variant={priorityVariant[priority]}>{priorityLabel[priority]}</Badge><div><h3 className="font-display text-lg font-semibold">{title}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{message}</p></div><Button onClick={() => setPreview(false)} className="self-end">Fechar</Button></div>
      </Dialog>
    </div>
  )
}
