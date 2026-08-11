"use client"

import { useState } from "react"
import { z } from "zod"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input, Label, Select, Textarea } from "@/components/ui/primitives"
import { useLocacao } from "@/lib/locacao-store"
import { useAuth } from "@/lib/auth-context"
import { isGestorNivel } from "@/lib/roles"
import {
  GARANTIAS_LOCACAO,
  LOCACAO_STATUS_LABEL,
  LOCACAO_STATUSES,
  QUARTOS_OPCOES,
  TEMPERATURAS,
  TEMP_LABEL,
  TIPOS_IMOVEL_LOCACAO,
  type LocacaoStatus,
} from "@/lib/locacao-labels"
import { ORIGENS, type Origem, type Temperatura } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

export interface LocacaoLeadFormValues {
  nome: string
  telefone: string
  email: string
  imovelRef: string
  temperatura: Temperatura
  origem: Origem
  observacoes: string
  status: LocacaoStatus
  tipoImovelDesejado: string
  bairrosDesejados: string[]
  aluguelMax?: number
  quartos: string
  garantia: string
  valorAluguel?: number
  corretorId: string
}

const schema = z.object({
  nome: z.string().trim().min(1, "Informe o nome do lead."),
  telefone: z.string().trim().min(1, "Informe o telefone."),
  origem: z.enum(["Instagram", "Indicação", "Tráfego Pago", "WhatsApp", "Outro"]),
  email: z.string().email("E-mail inválido.").or(z.literal("")),
})

interface LocacaoLeadFormProps {
  initial?: Partial<LocacaoLeadFormValues> & { id?: string }
  defaultCorretorId: string
  showCorretor?: boolean
  showStatus?: boolean
  submitting?: boolean
  onSubmit: (v: LocacaoLeadFormValues) => void
  onCancel: () => void
}

export function LocacaoLeadForm({
  initial,
  defaultCorretorId,
  showCorretor = false,
  showStatus = true,
  submitting = false,
  onSubmit,
  onCancel,
}: LocacaoLeadFormProps) {
  const [v, setV] = useState<LocacaoLeadFormValues>({
    nome: initial?.nome ?? "",
    telefone: initial?.telefone ?? "",
    email: initial?.email ?? "",
    imovelRef: initial?.imovelRef ?? "",
    temperatura: initial?.temperatura ?? "morno",
    origem: initial?.origem ?? "Instagram",
    observacoes: initial?.observacoes ?? "",
    status: initial?.status ?? "novo",
    tipoImovelDesejado: initial?.tipoImovelDesejado ?? "",
    bairrosDesejados: initial?.bairrosDesejados ?? [],
    aluguelMax: initial?.aluguelMax,
    quartos: initial?.quartos ?? "",
    garantia: initial?.garantia ?? "",
    valorAluguel: initial?.valorAluguel,
    corretorId: initial?.corretorId ?? defaultCorretorId,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [bairrosText, setBairrosText] = useState((initial?.bairrosDesejados ?? []).join(", "))
  const { corretores, checkPhoneDuplicate, userName } = useLocacao()
  const { user } = useAuth()
  const isGestor = isGestorNivel(user?.role ?? "corretor")
  const [phoneDup, setPhoneDup] = useState<{ nome: string; corretorId: string; status: string } | null>(null)
  const showValor = ["negociando", "locado"].includes(v.status)

  function set<K extends keyof LocacaoLeadFormValues>(k: K, val: LocacaoLeadFormValues[K]) {
    setV((s) => ({ ...s, [k]: val }))
  }

  function validatePhone(phone: string) {
    const dup = checkPhoneDuplicate(phone, initial?.id)
    setPhoneDup(dup)
    return dup
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const result = schema.safeParse(v)
    const errs: Record<string, string> = {}
    if (!result.success) {
      for (const issue of result.error.issues) errs[issue.path[0] as string] = issue.message
    }
    if (showValor && (!v.valorAluguel || v.valorAluguel <= 0)) errs.valorAluguel = "Informe o valor do aluguel."
    setErrors(errs)
    if (Object.values(errs).some(Boolean)) return
    const bairros = bairrosText.split(/[,;\n]/).map((b) => b.trim()).filter(Boolean)
    onSubmit({ ...v, bairrosDesejados: bairros, valorAluguel: showValor ? v.valorAluguel : undefined })
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
                <span className="font-semibold">Este telefone já está cadastrado na locação.</span>
                {isGestor ? (
                  <span className="flex flex-col gap-0.5 text-destructive/90">
                    <span>Lead: <span className="font-medium">{phoneDup.nome}</span></span>
                    <span>Corretor responsável: <span className="font-medium">{userName(phoneDup.corretorId)}</span></span>
                    <span>Status atual: <span className="font-medium">{LOCACAO_STATUS_LABEL[phoneDup.status as LocacaoStatus]}</span></span>
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
          {err("origem")}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} aria-label="E-mail" />
          {err("email")}
        </div>
        {showStatus && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="status">Status</Label>
            <Select id="status" value={v.status} onChange={(e) => set("status", e.target.value as LocacaoStatus)} aria-label="Status">
              {LOCACAO_STATUSES.map((s) => <option key={s} value={s}>{LOCACAO_STATUS_LABEL[s]}</option>)}
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
      </div>

      {/* Campos específicos de locação */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="tipoImovel">Tipo de imóvel desejado</Label>
          <Select id="tipoImovel" value={v.tipoImovelDesejado} onChange={(e) => set("tipoImovelDesejado", e.target.value)} aria-label="Tipo de imóvel">
            <option value="">Todos</option>
            {TIPOS_IMOVEL_LOCACAO.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="quartos">Quartos</Label>
          <Select id="quartos" value={v.quartos} onChange={(e) => set("quartos", e.target.value)} aria-label="Quartos">
            <option value="">Indiferente</option>
            {QUARTOS_OPCOES.map((q) => <option key={q} value={q}>{q} quarto(s)</option>)}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="aluguelMax">Aluguel máximo (R$)</Label>
          <Input id="aluguelMax" type="number" value={v.aluguelMax ?? ""} onChange={(e) => set("aluguelMax", e.target.value ? Number(e.target.value) : undefined)} aria-label="Aluguel máximo" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="garantia">Garantia preferida</Label>
          <Select id="garantia" value={v.garantia} onChange={(e) => set("garantia", e.target.value)} aria-label="Garantia">
            <option value="">Indiferente</option>
            {GARANTIAS_LOCACAO.map((g) => <option key={g} value={g}>{g}</option>)}
          </Select>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label htmlFor="bairros">Bairros de interesse</Label>
          <Input id="bairros" value={bairrosText} onChange={(e) => setBairrosText(e.target.value)} aria-label="Bairros de interesse" placeholder="Ex: Centro, Jardim América" />
        </div>
        {showValor && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="valorAluguel">Valor do aluguel (R$) *</Label>
            <Input id="valorAluguel" type="number" value={v.valorAluguel ?? ""} onChange={(e) => set("valorAluguel", e.target.value ? Number(e.target.value) : undefined)} aria-label="Valor do aluguel" />
            {err("valorAluguel")}
          </div>
        )}
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
