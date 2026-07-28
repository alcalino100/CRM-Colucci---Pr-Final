"use client"

import { useState } from "react"
import { z } from "zod"
import { AlertTriangle, Plus, Star, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input, Label, Select, Textarea } from "@/components/ui/primitives"
import { useLeads } from "@/lib/leads-store"
import { useAuth } from "@/lib/auth-context"
import { LEAD_STATUSES, STATUS_LABEL, TEMPERATURAS, TEMP_LABEL } from "@/lib/labels"
import { ORIGENS, type Lead, type LeadRef, type LeadStatus, type Origem, type Temperatura } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

export interface LeadFormValues {
  nome: string
  telefone: string
  email: string
  imovelRef: string
  referencias: LeadRef[]
  temperatura: Temperatura
  origem: Origem
  observacoes: string
  status: LeadStatus
  valorNegociacao?: number
  corretorId: string
}

const schema = z.object({
  nome: z.string().trim().min(1, "Informe o nome do lead."),
  telefone: z.string().trim().min(1, "Informe o telefone."),
  origem: z.enum(["Instagram", "Indicação", "Tráfego Pago", "Outro"]),
  email: z.string().email("E-mail inválido.").or(z.literal("")),
})

const REF_RE = /^[A-Za-z0-9-]{2,}$/

export function LeadForm({
  initial,
  defaultCorretorId,
  showCorretor = false,
  showStatus = true,
  submitting = false,
  onSubmit,
  onCancel,
}: {
  initial?: Lead
  defaultCorretorId: string
  showCorretor?: boolean
  showStatus?: boolean
  submitting?: boolean
  onSubmit: (v: LeadFormValues) => void
  onCancel: () => void
}) {
  const initialRefs: LeadRef[] =
    initial?.referencias?.length
      ? initial.referencias
      : initial?.imovelRef
        ? [{ ref: initial.imovelRef, principal: true }]
        : []
  const [v, setV] = useState<LeadFormValues>({
    nome: initial?.nome ?? "",
    telefone: initial?.telefone ?? "",
    email: initial?.email ?? "",
    imovelRef: initial?.imovelRef ?? "",
    referencias: initialRefs,
    temperatura: initial?.temperatura ?? "morno",
    origem: initial?.origem ?? "Instagram",
    observacoes: initial?.observacoes ?? "",
    status: initial?.status ?? "novo",
    valorNegociacao: initial?.valorNegociacao,
    corretorId: initial?.corretorId ?? defaultCorretorId,
  })
  const [refInput, setRefInput] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { corretores, checkPhoneDuplicate, userName } = useLeads()
  const { user } = useAuth()
  const isGestor = user?.role === "gestor"
  const [phoneDup, setPhoneDup] = useState<{ nome: string; corretorId: string; status: LeadStatus } | null>(null)
  const showValor = ["negociando", "fechado"].includes(v.status)

  function set<K extends keyof LeadFormValues>(k: K, val: LeadFormValues[K]) {
    setV((s) => ({ ...s, [k]: val }))
  }

  function validatePhone(phone: string) {
    const dup = checkPhoneDuplicate(phone, initial?.id)
    setPhoneDup(dup)
    return dup
  }

  function addRef() {
    const ref = refInput.trim().toUpperCase()
    if (!REF_RE.test(ref)) {
      setErrors((e) => ({ ...e, referencias: "Referência inválida. Use letras, números e hífen (mín. 2)." }))
      return
    }
    if (v.referencias.some((r) => r.ref === ref)) {
      setRefInput("")
      return
    }
    setErrors((e) => ({ ...e, referencias: "" }))
    set("referencias", [...v.referencias, { ref, principal: v.referencias.length === 0 }])
    setRefInput("")
  }
  function removeRef(ref: string) {
    let next = v.referencias.filter((r) => r.ref !== ref)
    if (next.length && !next.some((r) => r.principal)) next = next.map((r, i) => ({ ...r, principal: i === 0 }))
    set("referencias", next)
  }
  function setPrincipal(ref: string) {
    set("referencias", v.referencias.map((r) => ({ ...r, principal: r.ref === ref })))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const result = schema.safeParse(v)
    const errs: Record<string, string> = {}
    if (!result.success) {
      for (const issue of result.error.issues) errs[issue.path[0] as string] = issue.message
    }
    if (showValor && (!v.valorNegociacao || v.valorNegociacao <= 0)) errs.valorNegociacao = "Informe o valor da negociação."
    // Validação de telefone duplicado removida (permite múltiplos leads com mesmo telefone)
    setErrors(errs)
    if (Object.values(errs).some(Boolean)) return
    const principal = v.referencias.find((r) => r.principal)?.ref ?? v.referencias[0]?.ref ?? ""
    onSubmit({ ...v, imovelRef: principal, valorNegociacao: showValor ? v.valorNegociacao : undefined })
  }

  const err = (k: string) => errors[k] && <span className="text-xs text-destructive">{errors[k]}</span>

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="nome">Nome *</Label>
          <Input id="nome" value={v.nome} onChange={(e) => set("nome", e.target.value)} aria-label="Nome do lead" />
          {err("nome")}
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label htmlFor="tel">Telefone *</Label>
          <Input
            id="tel"
            value={v.telefone}
            onChange={(e) => { set("telefone", e.target.value); if (phoneDup) setPhoneDup(null) }}
            onBlur={(e) => validatePhone(e.target.value)}
            aria-invalid={!!phoneDup}
            className={cn(phoneDup && "border-destructive focus-visible:ring-destructive")}
            aria-label="Telefone"
            placeholder="(11) 90000-0000"
          />
          {phoneDup ? (
            <div className="mt-1 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div className="flex flex-col gap-1">
                <span className="font-semibold">Este telefone já está cadastrado no sistema.</span>
                {isGestor ? (
                  <span className="flex flex-col gap-0.5 text-destructive/90">
                    <span>Lead: <span className="font-medium">{phoneDup.nome}</span></span>
                    <span>Corretor responsável: <span className="font-medium">{userName(phoneDup.corretorId)}</span></span>
                    <span>Status atual: <span className="font-medium">{STATUS_LABEL[phoneDup.status]}</span></span>
                  </span>
                ) : (
                  <span className="text-destructive/90">
                    Corretor responsável: <span className="font-medium">{userName(phoneDup.corretorId)}</span>
                  </span>
                )}
              </div>
            </div>
          ) : (
            err("telefone")
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="temperatura">Temperatura *</Label>
          <Select id="temperatura" value={v.temperatura} onChange={(e) => set("temperatura", e.target.value as Temperatura)} aria-label="Temperatura do lead">
            {TEMPERATURAS.map((t) => <option key={t} value={t}>{TEMP_LABEL[t]}</option>)}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="origem">Origem do lead *</Label>
          <Select id="origem" value={v.origem} onChange={(e) => set("origem", e.target.value as Origem)} aria-label="Origem">
            {ORIGENS.map((o) => <option key={o} value={o}>{o}</option>)}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} aria-label="E-mail" />
          {err("email")}
        </div>
        {showStatus && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="status">Status</Label>
            <Select id="status" value={v.status} onChange={(e) => set("status", e.target.value as LeadStatus)} aria-label="Status">
              {LEAD_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </Select>
          </div>
        )}
        {showCorretor && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="corretor">Corretor responsável</Label>
            <Select id="corretor" value={v.corretorId} onChange={(e) => set("corretorId", e.target.value)} aria-label="Corretor responsável">
              {corretores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
          </div>
        )}
        {showValor && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="valor">Valor da negociação (R$) *</Label>
            <Input id="valor" type="number" value={v.valorNegociacao ?? ""} onChange={(e) => set("valorNegociacao", Number(e.target.value))} aria-label="Valor da negociação" />
            {err("valorNegociacao")}
          </div>
        )}
      </div>

      {/* Referências múltiplas */}
      <div className="flex flex-col gap-1">
        <Label htmlFor="refinput">Referências do imóvel <span className="font-normal text-muted-foreground">(opcional — clique na estrela para definir a principal)</span></Label>
        <div className="flex gap-2">
          <Input
            id="refinput"
            value={refInput}
            onChange={(e) => setRefInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                e.preventDefault()
                addRef()
              }
            }}
            placeholder="Ex: AP-1006"
            aria-label="Adicionar referência do imóvel"
          />
          <Button type="button" variant="outline" onClick={addRef} aria-label="Adicionar referência"><Plus className="size-4" /></Button>
        </div>
        {v.referencias.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma referência adicionada ainda.</p>
        ) : (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {v.referencias.map((r) => (
              <span key={r.ref} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium", r.principal ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground")}>
                <button type="button" onClick={() => setPrincipal(r.ref)} aria-label={`Definir ${r.ref} como principal`} title="Definir como principal">
                  <Star className={cn("size-3", r.principal && "fill-current")} />
                </button>
                {r.ref}
                <button type="button" onClick={() => removeRef(r.ref)} aria-label={`Remover ${r.ref}`}>
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        {err("referencias")}
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="obs">Observações</Label>
        <Textarea id="obs" value={v.observacoes} onChange={(e) => set("observacoes", e.target.value)} aria-label="Observações" />
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>Cancelar</Button>
        <Button type="submit" disabled={submitting}>{submitting ? "Salvando..." : "Salvar"}</Button>
      </div>
    </form>
  )
}
