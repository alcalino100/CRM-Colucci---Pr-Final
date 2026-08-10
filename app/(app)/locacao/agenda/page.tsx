"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Plus, Clock, User, Building, ArrowRight, CalendarDays } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { isGestorNivel, podeLocacao } from "@/lib/roles"
import { useLocacao } from "@/lib/locacao-store"
import { Button } from "@/components/ui/button"
import { Card, CardContent, Dialog, Input, Label, Select, Textarea, useToast } from "@/components/ui/primitives"
import { PageHeading } from "@/components/ui/page-heading"
import { fmtDayLabel, refsTexto } from "@/lib/locacao-labels"

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

function ymd(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

export default function AgendaPage() {
  const { user } = useAuth()
  const { leads, visits, addVisit, updateLead, addInteraction, corretores, userName } = useLocacao()
  const toast = useToast()
  const today = new Date()
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() })
  const [selected, setSelected] = useState(ymd(today.getFullYear(), today.getMonth(), today.getDate()))
  const [filterCorretor, setFilterCorretor] = useState("todos")
  const [novo, setNovo] = useState(false)

  if (user && !podeLocacao(user.role)) return null
  const isGestor = isGestorNivel(user?.role ?? "corretor")

  const visibleVisits = useMemo(() => {
    let v = visits
    if (!isGestor) v = v.filter((x) => x.corretorId === user?.id)
    else if (filterCorretor !== "todos") v = v.filter((x) => x.corretorId === filterCorretor)
    return v
  }, [visits, isGestor, user, filterCorretor])

  const daysWithVisit = useMemo(() => new Set(visibleVisits.map((v) => v.data)), [visibleVisits])
  const dayVisits = useMemo(
    () => visibleVisits.filter((v) => v.data === selected).sort((a, b) => a.hora.localeCompare(b.hora)),
    [visibleVisits, selected],
  )

  const firstDay = new Date(cursor.y, cursor.m, 1).getDay()
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  function move(delta: number) {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }

  // new visit form
  const [leadId, setLeadId] = useState("")
  const [data, setData] = useState(selected)
  const [hora, setHora] = useState("10:00")
  const [refs, setRefs] = useState("")
  const [obs, setObs] = useState("")
  const leadOptions = isGestor ? leads : leads.filter((l) => l.corretorId === user?.id)

  function openNovo() {
    setData(selected)
    setHora("10:00")
    setObs("")
    const first = leadOptions[0]
    setLeadId(first?.id ?? "")
    setRefs(first ? refsTexto(first) : "")
    setNovo(true)
  }
  function confirmNovo(e: React.FormEvent) {
    e.preventDefault()
    const lead = leads.find((l) => l.id === leadId)
    if (!lead || !data) {
      toast("Selecione um lead e uma data.", "error")
      return
    }
    if (!refs.trim()) {
      toast("Informe a(s) referência(s) do imóvel da visita.", "error")
      return
    }
    addVisit({ leadId: lead.id, data, hora, corretorId: lead.corretorId, imovelRef: refs.trim(), referencias: refs.trim(), observacoes: obs })
    updateLead(lead.id, { status: "visita agendada" })
    addInteraction(lead.id, { corretor: userName(lead.corretorId), texto: `Visita agendada via agenda para ${data.split("-").reverse().join("/")} às ${hora}.` })
    toast("Visita agendada. Status do lead atualizado.")
    setSelected(data)
    setNovo(false)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeading title="Agenda de Visitas de Locação" subtitle="Visualize e agende visitas de locação vinculadas aos leads." badge="Visitas" />
        <div className="flex items-center gap-2">
          {isGestor && (
            <Select value={filterCorretor} onChange={(e) => setFilterCorretor(e.target.value)} aria-label="Filtrar por corretor" className="w-44">
              <option value="todos">Todos os corretores</option>
              {corretores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
          )}
          <Button onClick={openNovo}><Plus className="size-4" /> Nova Visita</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* Calendar */}
        <Card>
          <CardContent className="pt-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-display text-lg font-semibold">{MONTHS[cursor.m]} {cursor.y}</span>
              <div className="flex gap-1">
                <button onClick={() => move(-1)} aria-label="Mês anterior" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"><ChevronLeft className="size-5" /></button>
                <button onClick={() => move(1)} aria-label="Próximo mês" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"><ChevronRight className="size-5" /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
              {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {cells.map((day, i) => {
                if (day === null) return <div key={i} />
                const key = ymd(cursor.y, cursor.m, day)
                const has = daysWithVisit.has(key)
                const isSel = key === selected
                const isToday = key === ymd(today.getFullYear(), today.getMonth(), today.getDate())
                return (
                  <button
                    key={i}
                    onClick={() => setSelected(key)}
                    className={`relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm transition ${isSel ? "bg-primary font-semibold text-primary-foreground" : isToday ? "bg-muted font-semibold" : "hover:bg-muted"}`}
                  >
                    {day}
                    {has && <span className={`absolute bottom-1.5 size-1.5 rounded-full ${isSel ? "bg-primary-foreground" : "bg-accent"}`} />}
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Day list */}
        <Card>
          <CardContent className="pt-5">
            <p className="mb-3 font-display text-sm font-semibold capitalize">{fmtDayLabel(selected)}</p>
            {dayVisits.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><CalendarDays className="size-5" /></div>
                <p className="text-sm text-muted-foreground">Nenhuma visita agendada para este dia</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {dayVisits.map((v) => {
                  const lead = leads.find((l) => l.id === v.leadId)
                  return (
                    <div key={v.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 font-display font-semibold text-primary"><Clock className="size-4" />{v.hora}</span>
                        {lead && (
                          <Link href={`/locacao/${lead.id}`} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                            Ver Lead <ArrowRight className="size-3" />
                          </Link>
                        )}
                      </div>
                      <p className="mt-1.5 text-sm font-medium">{lead?.nome ?? "Lead removido"}</p>
                      <div className="mt-1 flex flex-col gap-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5"><Building className="size-3.5" />{v.imovelRef || "Sem imóvel"}</span>
                        <span className="flex items-center gap-1.5"><User className="size-3.5" />{userName(v.corretorId)}</span>
                      </div>
                      {v.observacoes && <p className="mt-1.5 text-xs text-muted-foreground">{v.observacoes}</p>}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={novo} onClose={() => setNovo(false)} title="Nova Visita">
        <form onSubmit={confirmNovo} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="nl">Lead vinculado *</Label>
            <Select
              id="nl"
              value={leadId}
              onChange={(e) => {
                setLeadId(e.target.value)
                const l = leads.find((x) => x.id === e.target.value)
                if (l) setRefs(refsTexto(l))
              }}
            >
              <option value="">Selecione...</option>
              {leadOptions.map((l) => <option key={l.id} value={l.id}>{l.nome} — {l.telefone || "sem telefone"}</option>)}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="nr">Referência(s) do imóvel *</Label>
            <Input id="nr" value={refs} onChange={(e) => setRefs(e.target.value)} placeholder="Ex: AP-1006, CA-2005" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="nd">Data *</Label>
              <Input id="nd" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="nh">Horário *</Label>
              <Input id="nh" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="no">Observações</Label>
            <Textarea id="no" value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>
          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setNovo(false)}>Cancelar</Button>
            <Button type="submit">Agendar</Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
