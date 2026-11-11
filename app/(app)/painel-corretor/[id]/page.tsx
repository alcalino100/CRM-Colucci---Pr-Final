"use client"

import { useState, use } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import useSWR from "swr"
import { ArrowLeft, Clock, MessageSquarePlus, Phone, Mail, Home, ShieldCheck, Megaphone, Zap, Archive, ArchiveRestore, Sparkles, AlertTriangle, ShieldAlert } from "lucide-react"
import { queryFiltros } from "@/lib/leads-filtros"
import { useAuth } from "@/lib/auth-context"
import { isGestorNivel, podeVendas } from "@/lib/roles"
import { useLeads } from "@/lib/leads-store"
import { Button } from "@/components/ui/button"
import { Badge, Card, CardContent, CardHeader, CardTitle, Select, Textarea, useToast } from "@/components/ui/primitives"
import { ArquivarLeadDialog } from "@/components/arquivar-lead-dialog"
import { MOTIVO_ARQUIVAMENTO_LABEL } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

const metaFetcher = (u: string) => fetch(u).then((r) => r.json())
import { AUDIT_TIPO_LABEL, AUDIT_TIPO_VARIANT, brl, fmtDateTime, STATUS_LABEL, STATUS_VARIANT, TEMP_LABEL, TEMP_VARIANT } from "@/lib/labels"
import { LeadAutomacoesTab } from "@/components/lead-automacoes-tab"
import type { AuditTipo } from "@/lib/mock-data"

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const voltarHref = (() => {
    const q = queryFiltros(searchParams)
    if (q) return `/painel-corretor${q}`
    if (typeof window !== "undefined" && user && isGestorNivel(user.role)) {
      try {
        const saved = window.localStorage.getItem(`crm-filtros:${user.id}`)
        if (saved) return `/painel-corretor?${saved}`
      } catch {}
    }
    return "/painel-corretor"
  })()
  const { getLead, addInteraction, qualityNotes, audit, addQualityNote, desarquivarLead, arquivarLeadComData, users } = useLeads()
  const toast = useToast()
  const [nota, setNota] = useState("")
  const [qualiTexto, setQualiTexto] = useState("")
  const [arquivarOpen, setArquivarOpen] = useState(false)
  const [desarquivando, setDesarquivando] = useState(false)
  const lead = getLead(id)
  if (!user || !podeVendas(user.role)) return null
  const isGestor = isGestorNivel(user.role)
  const isOwner = lead ? lead.corretorId === user.id : false
  const podeGerenciarArquivo = isGestor || isOwner
  const leadQuality = qualityNotes.filter((q) => q.leadId === id)
  const corretorNome = lead ? (users.find((u) => u.id === lead.corretorId)?.nome || "—") : "—"

  if (!lead) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-muted-foreground">Lead não encontrado.</p>
        <Link href={voltarHref}><Button variant="outline"><ArrowLeft className="size-4" /> Voltar</Button></Link>
      </div>
    )
  }

  const isArquivado = Boolean(lead.arquivadoEm)
  const isReativado = Boolean(lead.reativadoEm)
  const fmtDataBr = (d?: string | null) => {
    if (!d) return "—"
    const raw = d.split("T")[0]
    const p = raw.split("-")
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : raw
  }
  const getMotivoLabel = (m?: string | null) => {
    if (!m) return "—"
    return (MOTIVO_ARQUIVAMENTO_LABEL as Record<string, string>)[m] || m
  }

  async function handleDesarquivar() {
    if (!lead) return
    setDesarquivando(true)
    try {
      const res = await desarquivarLead(lead.id)
      if (res.ok) {
        toast("Lead desarquivado com sucesso!")
      } else {
        toast(res.error || "Erro ao desarquivar lead.", "error")
      }
    } finally {
      setDesarquivando(false)
    }
  }

  function salvarNota() {
    if (!nota.trim()) return
    addInteraction(lead!.id, { corretor: user!.nome, texto: nota.trim() })
    setNota("")
    toast("Anotação registrada.")
  }

  type TimelineItem = { id: string; corretor: string; texto: string; timestamp: string; tipo: AuditTipo | "nota" }
  // Eventos automáticos do sistema (cadastro, movimentação, visita, proposta, fechamento, perda, etc.)
  const auditEvents: TimelineItem[] = audit
    .filter((a) => a.leadId === id)
    .map((a) => ({
      id: `audit-${a.id}`,
      corretor: a.usuarioNome,
      texto: a.referencias ? `${a.descricao} · Ref: ${a.referencias}` : a.descricao,
      timestamp: a.criadoEm,
      tipo: a.tipo,
    }))
  // Anotações manuais de atendimento
  const notaEvents: TimelineItem[] = lead.interacoes.map((it) => ({
    id: it.id,
    corretor: it.corretor,
    texto: it.texto,
    timestamp: it.timestamp,
    tipo: "nota",
  }))
  const timeline: TimelineItem[] = [...auditEvents, ...notaEvents].sort(
    (a, b) => +new Date(b.timestamp) - +new Date(a.timestamp),
  )
  const tipoLabel = (t: TimelineItem["tipo"]) => (t === "nota" ? "Anotação" : AUDIT_TIPO_LABEL[t])
  const tipoVariant = (t: TimelineItem["tipo"]) => (t === "nota" ? "slate" : AUDIT_TIPO_VARIANT[t])
  // Cor do marcador da linha do tempo por tipo de evento
  const dotColor = (t: TimelineItem["tipo"]) => {
    switch (t) {
      case "criacao":
      case "fechamento":
        return "bg-emerald-500"
      case "exclusao":
      case "justificativa":
        return "bg-destructive"
      case "etapa":
      case "temperatura":
      case "visita":
        return "bg-amber-500"
      case "proposta":
        return "bg-primary"
      case "nota":
        return "bg-slate-400"
      default:
        return "bg-sky-500"
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href={voltarHref} className="rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label="Voltar"><ArrowLeft className="size-5" /></Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold">
                <span className="text-foreground">{lead.nome}</span>
              </h1>
              <Badge variant={STATUS_VARIANT[lead.status]}>{STATUS_LABEL[lead.status]}</Badge>
              <Badge variant={TEMP_VARIANT[lead.temperatura]}>{TEMP_LABEL[lead.temperatura]}</Badge>
              {isArquivado && (
                <Badge variant="amber" className="flex items-center gap-1 font-semibold">
                  <Archive className="size-3" />
                  Arquivado até {fmtDataBr(lead.dataReaparecimento)}
                </Badge>
              )}
              {isReativado && !isArquivado && (
                <Badge variant="amber" className="flex items-center gap-1 font-semibold text-amber-800 bg-amber-100 border border-amber-300">
                  <Sparkles className="size-3 text-amber-600" />
                  Reativado em {fmtDataBr(lead.reativadoEm)}
                  {(lead.reativacoesCount ?? 1) > 1 && (
                    <span className="ml-1 rounded bg-amber-200/80 px-1 text-[10px] font-bold">
                      {lead.reativacoesCount}x
                    </span>
                  )}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">Ficha de atendimento</p>
          </div>
        </div>

        {podeGerenciarArquivo && (
          <div className="flex items-center gap-2">
            {isArquivado ? (
              <Button
                variant="outline"
                className="gap-2 border-emerald-600/30 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                onClick={handleDesarquivar}
                disabled={desarquivando}
              >
                <ArchiveRestore className="size-4" />
                {desarquivando ? "Desarquivando..." : "Desarquivar agora"}
              </Button>
            ) : (
              <Button
                variant="outline"
                className="gap-2 border-amber-600/30 text-amber-800 hover:bg-amber-50"
                onClick={() => setArquivarOpen(true)}
              >
                <Archive className="size-4 text-amber-600" />
                Arquivar com Data
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Banner de Aviso de Reativação Automática */}
      {isReativado && !isArquivado && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-sm" role="status">
          <Sparkles className="size-5 shrink-0 text-amber-600 mt-0.5" />
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Lead Reativado Automaticamente</span>
            <p>
              Este lead foi arquivado em <strong>{fmtDataBr(lead.arquivadoEm || lead.criadoEm)}</strong>
              {lead.arquivadoPor ? ` por ${lead.arquivadoPor}` : corretorNome ? ` por ${corretorNome}` : ""}
              {lead.dataReaparecimento ? <> com a previsão de compra para <strong>{fmtDataBr(lead.dataReaparecimento)}</strong>.</> : "."}
              {lead.motivoArquivamento && (
                <> Motivo: <strong>{getMotivoLabel(lead.motivoArquivamento)}</strong>.</>
              )}
            </p>
            {lead.observacaoArquivamento && (
              <p className="text-xs text-amber-800/80 italic mt-0.5">Observação original: &ldquo;{lead.observacaoArquivamento}&rdquo;</p>
            )}
          </div>
        </div>
      )}

      {/* Banner de Aviso de Arquivamento Ativo */}
      {isArquivado && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-300 bg-blue-50 p-4 text-blue-900 shadow-sm" role="status">
          <Archive className="size-5 shrink-0 text-blue-600 mt-0.5" />
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Lead em Hibernação Programada (Arquivado)</span>
            <p>
              Data prevista para reaparecer no funil: <strong>{fmtDataBr(lead.dataReaparecimento)}</strong>
              {lead.motivoArquivamento && (
                <> · Motivo: <strong>{getMotivoLabel(lead.motivoArquivamento)}</strong></>
              )}
            </p>
            {lead.observacaoArquivamento && (
              <p className="text-xs text-blue-800/80 italic mt-0.5">Observação: &ldquo;{lead.observacaoArquivamento}&rdquo;</p>
            )}
          </div>
        </div>
      )}

      {/* Banner de Consentimento LGPD */}
      {lead.consentimentoContato === false && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-400 bg-amber-100/70 p-3.5 text-amber-950 shadow-sm" role="alert">
          <ShieldAlert className="size-5 shrink-0 text-amber-700" />
          <div className="flex flex-col text-sm">
            <span className="font-semibold text-amber-900">Atenção LGPD: Confirmar consentimento antes de contatar</span>
            <span className="text-xs text-amber-800">
              O consentimento prévio para contato não foi registrado ou expirou. Confirme a autorização com o titular antes de realizar chamadas ou mensagens.
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>Dados do lead</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <Info icon={Phone} label="Telefone" value={lead.telefone || "—"} />
            <Info icon={Mail} label="E-mail" value={lead.email || "—"} />
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Referências do imóvel</span>
              {lead.referencias?.length || lead.imovelRef ? (
                <div className="flex flex-wrap gap-1.5">
                  {(lead.referencias?.length ? lead.referencias : [{ ref: lead.imovelRef, principal: true }]).map((r) => (
                    <Badge key={r.ref} variant={r.principal ? "default" : "gray"}>{r.ref}{r.principal ? " (principal)" : ""}</Badge>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Nenhuma referência vinculada.</span>
              )}
            </div>
            {lead.refProposta && <Info icon={Home} label="Referência da proposta" value={lead.refProposta} />}
            {lead.refFechamento && <Info icon={Home} label="Referência do fechamento" value={lead.refFechamento} />}
            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-muted-foreground">Origem</span><span className="font-medium">{lead.origem}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Valor negociação</span><span className="font-medium">{brl(lead.valorNegociacao)}</span>
            </div>
            {lead.motivoArquivamento && (
              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="text-muted-foreground">Motivo arquivamento</span>
                <span className="font-medium">{getMotivoLabel(lead.motivoArquivamento)}</span>
              </div>
            )}
            {lead.dataReaparecimento && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Previsão reaparecimento</span>
                <span className="font-medium text-amber-700">{fmtDataBr(lead.dataReaparecimento)}</span>
              </div>
            )}
            {lead.reativadoEm && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Reativado em</span>
                <span className="font-medium">{fmtDataBr(lead.reativadoEm)}</span>
              </div>
            )}
            {lead.consentimentoContato !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Consentimento LGPD</span>
                <span className={cn("font-medium", lead.consentimentoContato ? "text-emerald-700" : "text-amber-700")}>
                  {lead.consentimentoContato ? "Confirmado" : "Pendente confirmação"}
                </span>
              </div>
            )}
            {lead.observacoes && <p className="rounded-lg bg-muted p-3 text-muted-foreground">{lead.observacoes}</p>}
            {lead.origem === "Tráfego Pago" && <MetaLink leadId={lead.id} atual={lead.metaCampaignId} />}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Histórico do Lead</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Adicionar nova anotação de atendimento..." aria-label="Nova anotação" />
              <div className="flex justify-end">
                <Button onClick={salvarNota} disabled={!nota.trim()}><MessageSquarePlus className="size-4" /> Adicionar anotação</Button>
              </div>
            </div>

            {timeline.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><Clock className="size-5" /></div>
                <p className="text-sm font-medium text-foreground">Este lead ainda não tem histórico</p>
                <p className="text-xs text-muted-foreground">Os acontecimentos aparecerão aqui automaticamente conforme o lead avança no funil.</p>
              </div>
            ) : (
              <ol className="relative flex flex-col gap-4 border-l border-border pl-5">
                {timeline.map((it) => (
                  <li key={it.id} className="relative">
                    <span className={`absolute -left-[26px] top-1.5 size-3 rounded-full ring-4 ring-card ${dotColor(it.tipo)}`} />
                    <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={tipoVariant(it.tipo)}>{tipoLabel(it.tipo)}</Badge>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3" />{fmtDateTime(it.timestamp)}</span>
                      </div>
                      <p className="text-sm leading-relaxed text-foreground">{it.texto}</p>
                      <p className="text-xs text-muted-foreground">por <span className="font-medium text-foreground">{it.corretor}</span></p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Observações internas de qualidade — visível SOMENTE para gestores */}
      {isGestor && (
        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            <CardTitle>Observações de Qualidade <span className="text-xs font-normal text-muted-foreground">(interno — somente gestores)</span></CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Textarea value={qualiTexto} onChange={(e) => setQualiTexto(e.target.value)} placeholder="Avaliação de qualidade do atendimento, aderência do lead, preenchimento..." aria-label="Nova observação de qualidade" />
              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    if (!qualiTexto.trim()) return
                    addQualityNote(lead.id, qualiTexto)
                    setQualiTexto("")
                    toast("Observação de qualidade registrada.")
                  }}
                  disabled={!qualiTexto.trim()}
                >
                  Registrar observação
                </Button>
              </div>
            </div>
            {leadQuality.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma observação de qualidade registrada.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {leadQuality.map((q) => (
                  <div key={q.id} className="rounded-lg border border-border bg-muted/40 p-3">
                    <p className="text-sm">{q.texto}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{q.autorNome}</span> · {fmtDateTime(q.criadoEm)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Automações — visível SOMENTE para gestores */}
      {isGestor && (
        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <Zap className="size-4 text-primary" />
            <CardTitle>Automações <span className="text-xs font-normal text-muted-foreground">(gestão)</span></CardTitle>
          </CardHeader>
          <CardContent>
            <LeadAutomacoesTab leadId={lead.id} />
          </CardContent>
        </Card>
      )}

      {/* Dialog de Arquivamento */}
      <ArquivarLeadDialog
        lead={arquivarOpen ? lead : null}
        open={arquivarOpen}
        onClose={() => setArquivarOpen(false)}
        onConfirm={async ({ motivo, dataReaparecimento, observacao }) => {
          if (!lead) return
          const res = await arquivarLeadComData(lead.id, {
            motivo,
            dataReaparecimento,
            observacao,
          })
          if (!res.ok) {
            toast(res.error || "Erro ao arquivar lead.", "error")
            return
          }
          toast("Lead arquivado com sucesso.")
        }}
      />
    </div>
  )
}

// Vínculo do lead de Tráfego Pago com a campanha real do Meta (cruzamento CRM × Ads)
function MetaLink({ leadId, atual }: { leadId: string; atual?: string }) {
  const { updateLead } = useLeads()
  const toast = useToast()
  const { data: contas } = useSWR("/api/meta?op=accounts", metaFetcher)
  const contaId = contas?.data?.[0]?.id
  const { data: campanhas } = useSWR(contaId ? `/api/meta?op=campaigns&account=${contaId}` : null, metaFetcher)
  return (
    <div className="flex flex-col gap-1.5 border-t border-border pt-3">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Megaphone className="size-3.5" /> Campanha Meta que gerou este lead</span>
      <Select
        value={atual ?? ""}
        onChange={(e) => {
          updateLead(leadId, { metaCampaignId: e.target.value || undefined })
          toast(e.target.value ? "Lead vinculado à campanha." : "Vínculo removido.")
        }}
        aria-label="Campanha Meta vinculada"
      >
        <option value="">Sem vínculo</option>
        {(campanhas?.data ?? []).map((c: any) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </Select>
    </div>
  )
}

function Info({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="size-4" /></div>
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
    </div>
  )
}
