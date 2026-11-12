"use client"

import { useState } from "react"
import { type DropResult } from "@hello-pangea/dnd"
import { useToast } from "@/components/ui/primitives"
import { type LeadFormValues } from "@/components/lead-form"
import { useSaleCelebration } from "@/components/sale-celebration"
import { useLeads } from "@/lib/leads-store"
import { isGestorNivel, isSomenteLeitura } from "@/lib/roles"
import { STATUS_LABEL, brl, comTagsEntradaAutomacao, refsTexto } from "@/lib/labels"
import type { Lead, LeadStatus, Role } from "@/lib/mock-data"
import {
  broadcastSaleCelebration,
  notifyWhatsAppSale,
  sendMetaSaleEvent,
} from "@/lib/kanban-sale-dispatcher"

export function useKanbanActions({
  leads,
  currentCorretorId,
  isGestor,
  user,
  usuarioNome,
}: {
  leads: Lead[]
  currentCorretorId: string
  isGestor: boolean
  user: { id: string; role?: Role } | null
  usuarioNome: string
}) {
  const {
    updateLead,
    deleteLead,
    addVisit,
    addInteraction,
    notify,
    logChange,
    logAudit,
    corretores,
    userName,
    arquivarLeadComData,
    desarquivarLead: storeDesarquivarLead,
  } = useLeads()

  const toast = useToast()
  const celebrate = useSaleCelebration()
  const visitante = isSomenteLeitura(user?.role)

  const [visitLead, setVisitLead] = useState<Lead | null>(null)
  const [propLead, setPropLead] = useState<Lead | null>(null)
  const [closeLead, setCloseLead] = useState<Lead | null>(null)
  const [editLead, setEditLead] = useState<Lead | null>(null)
  const [assumirDialog, setAssumirDialog] = useState<Lead | null>(null)
  const [uploadMeta, setUploadMeta] = useState<Lead | null>(null)
  const [archiveLead, setArchiveLead] = useState<Lead | null>(null)
  const [desarquivarLead, setDesarquivarLead] = useState<Lead | null>(null)
  const [delLead, setDelLead] = useState<Lead | null>(null)
  const [delMotivo, setDelMotivo] = useState("")
  const [delDetalhe, setDelDetalhe] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Visit form
  const [vData, setVData] = useState("")
  const [vHora, setVHora] = useState("10:00")
  const [vCorretor, setVCorretor] = useState("")
  const [vRefs, setVRefs] = useState("")
  const [vObs, setVObs] = useState("")

  // Proposal form
  const [pValor, setPValor] = useState("")
  const [pRefs, setPRefs] = useState("")
  const [pObs, setPObs] = useState("")

  // Fechamento form
  const [fRefs, setFRefs] = useState("")
  const [fTipo, setFTipo] = useState("")

  const canManage = (lead: Lead) => isGestor || lead.corretorId === currentCorretorId

  function handleEditSubmit(v: LeadFormValues) {
    if (visitante || !editLead) return
    if (v.status === "fechado" && editLead.status !== "fechado") {
      setFRefs(editLead.refFechamento || refsTexto(editLead))
      setFTipo(editLead.tipoImovelVendido ?? "")
      setCloseLead(editLead)
      setEditLead(null)
      return
    }
    setSubmitting(true)
    const fields: (keyof LeadFormValues)[] = [
      "nome",
      "telefone",
      "email",
      "imovelRef",
      "origem",
      "observacoes",
      "status",
      "valorNegociacao",
      "corretorId",
      "temperatura",
    ]
    const diaAntes = editLead.fechadoEm
      ? new Date(editLead.fechadoEm).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
      : ""
    const diaDepois = v.fechadoEm
      ? new Date(v.fechadoEm).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
      : ""
    if (v.status === "fechado" && diaDepois && diaAntes !== diaDepois) {
      logAudit({
        leadId: editLead.id,
        leadNome: editLead.nome,
        usuarioNome,
        tipo: "fechamento",
        descricao: `Data de fechamento ajustada: ${diaAntes.split("-").reverse().join("/")} → ${diaDepois.split("-").reverse().join("/")} (gestor)`,
      })
    }
    for (const f of fields) {
      const before = (editLead as any)[f]
      const after = (v as any)[f]
      if (String(before ?? "") !== String(after ?? "")) {
        logChange({
          usuario: usuarioNome,
          acao: "edicao",
          entidade: "lead",
          campo: f,
          valorAnterior: String(before ?? "-"),
          valorNovo: String(after ?? "-"),
        })
        if (f === "temperatura") {
          logAudit({
            leadId: editLead.id,
            leadNome: editLead.nome,
            usuarioNome,
            tipo: "temperatura",
            descricao: `Temperatura alterada: ${String(before)} → ${String(after)}`,
          })
        }
        if (f === "corretorId") {
          logAudit({
            leadId: editLead.id,
            leadNome: editLead.nome,
            usuarioNome,
            tipo: "responsavel",
            descricao: `Responsável alterado: ${userName(String(before))} → ${userName(String(after))}`,
          })
          notify(`Responsável do lead ${editLead.nome} alterado para ${userName(String(after))}`, {
            tipo: "responsavel",
            paraRole: "gestor",
            leadId: editLead.id,
          })
          notify(`Você agora é responsável pelo lead ${editLead.nome}`, {
            tipo: "responsavel",
            paraUsuarioId: String(after),
            leadId: editLead.id,
          })
        }
      }
    }
    const refsBefore = refsTexto(editLead)
    const refsAfter = v.referencias.map((r) => r.ref).join(", ")
    if (refsBefore !== refsAfter) {
      logAudit({
        leadId: editLead.id,
        leadNome: editLead.nome,
        usuarioNome,
        tipo: "edicao",
        descricao: "Referências atualizadas",
        referencias: refsAfter,
      })
    }
    void (async () => {
      const result = await updateLead(editLead.id, v)
      setSubmitting(false)
      if (!result.ok) return toast(result.error ?? "Não foi possível atualizar o lead.", "error")
      setEditLead(null)
      toast("Lead atualizado com sucesso")
    })()
  }

  function closeDelete() {
    setDelLead(null)
    setDelMotivo("")
    setDelDetalhe("")
  }

  async function handleDeleteConfirm() {
    if (!delLead || submitting) return
    if (!delMotivo) return toast("Selecione o motivo da exclusão.", "error")
    if (!delDetalhe.trim()) return toast("Descreva o motivo da exclusão.", "error")
    setSubmitting(true)
    const alvo = delLead
    const res = await deleteLead(alvo.id, delMotivo, delDetalhe.trim())
    setSubmitting(false)
    if (!res.ok) {
      toast(res.error ?? "Não foi possível excluir o lead.", "error")
      return
    }
    logChange({
      usuario: usuarioNome,
      acao: "exclusao",
      entidade: "lead",
      campo: "lead",
      valorAnterior: `${alvo.nome} — ${alvo.imovelRef || "sem imóvel"} (motivo: ${delMotivo})`,
      valorNovo: "-",
    })
    closeDelete()
    toast("Lead excluído com sucesso")
  }

  function onDragEnd(result: DropResult) {
    if (visitante) return
    const { source, destination, draggableId } = result
    if (!destination || destination.droppableId === source.droppableId) return
    const newStatus = destination.droppableId as LeadStatus
    const lead = leads.find((l) => l.id === draggableId)
    if (!lead || !canManage(lead)) return
    moveLead(lead, newStatus)
  }

  function moveLead(lead: Lead, newStatus: LeadStatus) {
    if (newStatus === "fechado") {
      setFRefs(refsTexto(lead))
      setFTipo(lead.tipoImovelVendido ?? "")
      setCloseLead(lead)
      return
    }

    if (lead.origem === "Tráfego Pago" && newStatus === "em_automacao") {
      updateLead(lead.id, {
        status: newStatus,
        temperatura: "morno",
        referencias: comTagsEntradaAutomacao(lead.referencias),
      })
      logAudit({
        leadId: lead.id,
        leadNome: lead.nome,
        usuarioNome,
        tipo: "temperatura",
        descricao: `Fase C — reativação de Tráfego Pago: ${lead.nome} entrou em "Em Automação"; temperatura reaquecida frio → morno (permanece no funil Tráfego Pago).`,
      })
      notify(`${lead.nome} reativado em "Em Automação" (Tráfego Pago reaquecido por ${usuarioNome})`, {
        tipo: "pipeline",
        paraRole: "gestor",
        leadId: lead.id,
      })
      toast(`Tráfego Pago reativado: ${lead.nome}`)
      return
    }

    updateLead(lead.id, { status: newStatus })
    logAudit({
      leadId: lead.id,
      leadNome: lead.nome,
      usuarioNome,
      tipo: "etapa",
      descricao: `Etapa alterada: ${STATUS_LABEL[lead.status]} → ${STATUS_LABEL[newStatus]}`,
    })
    notify(`${lead.nome} movido para "${STATUS_LABEL[newStatus]}" por ${usuarioNome}`, {
      tipo: "pipeline",
      paraRole: "gestor",
      leadId: lead.id,
    })
    if (lead.corretorId && lead.corretorId !== user?.id) {
      notify(`Seu lead ${lead.nome} foi movido para "${STATUS_LABEL[newStatus]}"`, {
        tipo: "pipeline",
        paraUsuarioId: lead.corretorId,
        leadId: lead.id,
      })
    }

    if (newStatus === "visita agendada") {
      setVData(new Date().toISOString().slice(0, 10))
      setVHora("10:00")
      setVCorretor(lead.corretorId || currentCorretorId)
      setVRefs(refsTexto(lead))
      setVObs("")
      setVisitLead(lead)
    } else if (newStatus === "negociando") {
      setPValor(lead.valorNegociacao ? String(lead.valorNegociacao) : "")
      setPRefs(lead.refProposta || refsTexto(lead))
      setPObs("")
      setPropLead(lead)
    } else {
      toast(`${lead.nome} movido para "${STATUS_LABEL[newStatus]}"`)
    }
  }

  function confirmVisit(e: React.FormEvent) {
    e.preventDefault()
    if (!visitLead || !vData) return
    if (!vRefs.trim()) {
      toast("Informe a(s) referência(s) do imóvel da visita.", "error")
      return
    }
    addVisit({
      leadId: visitLead.id,
      data: vData,
      hora: vHora,
      corretorId: vCorretor,
      imovelRef: vRefs.trim(),
      referencias: vRefs.trim(),
      observacoes: vObs,
    })
    addInteraction(visitLead.id, {
      corretor: userName(vCorretor),
      texto: `Visita agendada para ${vData.split("-").reverse().join("/")} às ${vHora} — Ref: ${vRefs.trim()}.`,
    })
    toast("Visita agendada e enviada para a agenda.")
    setVisitLead(null)
  }

  function confirmProposal(e: React.FormEvent) {
    e.preventDefault()
    if (!propLead) return
    const valor = Number(pValor)
    if (!valor || valor <= 0) {
      toast("Informe um valor válido.", "error")
      return
    }
    if (!pRefs.trim()) {
      toast("Informe a(s) referência(s) da proposta.", "error")
      return
    }
    updateLead(propLead.id, { valorNegociacao: valor, refProposta: pRefs.trim() })
    if (pObs) addInteraction(propLead.id, { corretor: userName(propLead.corretorId), texto: pObs })
    logAudit({
      leadId: propLead.id,
      leadNome: propLead.nome,
      usuarioNome,
      tipo: "proposta",
      descricao: `Proposta registrada: ${brl(valor)} por ${userName(propLead.corretorId)}`,
      referencias: pRefs.trim(),
    })
    notify(
      `Nova proposta: ${propLead.nome} — Ref: ${pRefs.trim()} — ${brl(valor)} por ${userName(propLead.corretorId)}`,
      { tipo: "proposta", paraRole: "gestor", leadId: propLead.id }
    )
    if (propLead.corretorId) {
      notify(`Proposta registrada no seu lead ${propLead.nome}: ${brl(valor)}`, {
        tipo: "proposta",
        paraUsuarioId: propLead.corretorId,
        leadId: propLead.id,
      })
    }
    toast("Proposta registrada. Gestores notificados.")
    fetch("/api/whatsapp/notify-proposta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        nome: propLead.nome,
        valor,
        corretorNome: userName(propLead.corretorId),
        corretorId: propLead.corretorId ?? null,
        refProposta: pRefs.trim(),
        modulo: "venda",
      }),
    })
      .then(async (r) => {
        if (!r.ok) {
          toast(
            "Proposta salva, mas o aviso de WhatsApp foi bloqueado — recarregue a página (Ctrl/Cmd+Shift+R).",
            "error"
          )
        }
      })
      .catch(() => {})
    setPropLead(null)
  }

  function confirmClose(e: React.FormEvent) {
    e.preventDefault()
    if (!closeLead) return
    if (!fRefs.trim()) {
      toast("Informe a(s) referência(s) do fechamento.", "error")
      return
    }
    if (!fTipo) {
      toast("Selecione o tipo do imóvel vendido.", "error")
      return
    }
    updateLead(closeLead.id, { status: "fechado", refFechamento: fRefs.trim(), tipoImovelVendido: fTipo })
    logAudit({
      leadId: closeLead.id,
      leadNome: closeLead.nome,
      usuarioNome,
      tipo: "fechamento",
      descricao: `Fechamento realizado por ${userName(closeLead.corretorId)} — ${brl(closeLead.valorNegociacao)} — Tipo: ${fTipo}`,
      referencias: fRefs.trim(),
    })
    celebrate({
      nome: closeLead.nome,
      valor: closeLead.valorNegociacao,
      ref: fRefs.trim(),
      tipo: fTipo,
      corretor: userName(closeLead.corretorId),
    })
    broadcastSaleCelebration({
      nome: closeLead.nome,
      valor: closeLead.valorNegociacao ?? 0,
      ref: fRefs.trim(),
      tipo: fTipo,
      corretorNome: userName(closeLead.corretorId),
    })
    sendMetaSaleEvent(closeLead)
    notifyWhatsAppSale({
      nome: closeLead.nome,
      valor: closeLead.valorNegociacao ?? 0,
      corretorNome: userName(closeLead.corretorId),
      refFechamento: fRefs.trim(),
    })
    setCloseLead(null)
  }

  async function handleAssumir() {
    if (!assumirDialog || !user) return
    const novoGestor = assumirDialog.gestorResponsavel ? null : user.id
    const res = await updateLead(assumirDialog.id, { gestorResponsavel: novoGestor })
    if (!res.ok) return toast(res.error ?? "Erro ao assumir lead.", "error")
    const msg = novoGestor
      ? `Gestor ${userName(user.id)} assumiu a supervisão do lead ${assumirDialog.nome}`
      : `Gestor ${userName(user.id)} removeu a supervisão do lead ${assumirDialog.nome}`
    logAudit({
      leadId: assumirDialog.id,
      leadNome: assumirDialog.nome,
      usuarioNome: userName(user.id),
      tipo: "responsavel",
      descricao: msg,
    })
    notify(msg, { tipo: "responsavel", paraRole: "gestor", leadId: assumirDialog.id })
    if (assumirDialog.corretorId) {
      notify(
        novoGestor
          ? `Seu lead ${assumirDialog.nome} foi assumido pela gestão`
          : `A supervisão do lead ${assumirDialog.nome} foi removida pela gestão`,
        { tipo: "responsavel", paraUsuarioId: assumirDialog.corretorId, leadId: assumirDialog.id }
      )
    }
    setAssumirDialog(null)
    toast(novoGestor ? "Lead assumido com sucesso!" : "Supervisão removida.")
  }

  async function handleUploadMeta() {
    if (!uploadMeta || !user || submitting) return
    if (!user.role || !isGestorNivel(user.role)) {
      setUploadMeta(null)
      return
    }
    setSubmitting(true)
    const alvo = uploadMeta
    try {
      const res = await fetch("/api/meta/lead-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: alvo.id, usuario_id: user.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast(data?.erro ?? "Erro ao enviar ao Meta.", "error")
        setSubmitting(false)
        return
      }
      logAudit({
        leadId: alvo.id,
        leadNome: alvo.nome,
        usuarioNome: userName(user.id),
        tipo: "edicao",
        descricao: `Enviado ao Meta (CAPI) manualmente por ${userName(user.id)} — ${brl(alvo.valorNegociacao)}${alvo.refFechamento ? ` — Ref: ${alvo.refFechamento}` : ""}`,
      })
      setUploadMeta(null)
      setSubmitting(false)
      toast(`Enviado ao Meta (${data.events_received ?? 0} evento).`)
    } catch {
      setSubmitting(false)
      toast("Falha de conexão ao enviar.", "error")
    }
  }

  async function handleDesarquivar() {
    if (!desarquivarLead || !user || submitting) return
    setSubmitting(true)
    const alvo = desarquivarLead
    const res = await storeDesarquivarLead(alvo.id)
    setSubmitting(false)
    setDesarquivarLead(null)
    if (!res.ok) {
      toast(res.error || "Erro ao desarquivar lead.", "error")
      return
    }
    toast("Lead desarquivado com sucesso.")
  }

  return {
    canManage,
    onDragEnd,
    moveLead,
    setEditLead,
    setDelLead,
    setAssumirDialog,
    setUploadMeta,
    setArchiveLead,
    setDesarquivarLead,
    dialogProps: {
      visitLead,
      setVisitLead,
      vData,
      setVData,
      vHora,
      setVHora,
      vRefs,
      setVRefs,
      vCorretor,
      setVCorretor,
      vObs,
      setVObs,
      confirmVisit,
      corretores,
      propLead,
      setPropLead,
      pValor,
      setPValor,
      pRefs,
      setPRefs,
      pObs,
      setPObs,
      confirmProposal,
      closeLead,
      setCloseLead,
      fRefs,
      setFRefs,
      fTipo,
      setFTipo,
      confirmClose,
      editLead,
      setEditLead,
      handleEditSubmit,
      submitting,
      isGestor,
      assumirDialog,
      setAssumirDialog,
      handleAssumir,
      userName,
      uploadMeta,
      setUploadMeta,
      handleUploadMeta,
      archiveLead,
      setArchiveLead,
      onConfirmArchive: async ({ motivo, dataReaparecimento, observacao }: { motivo: string; dataReaparecimento: string; observacao?: string }) => {
        if (!archiveLead) return
        const res = await arquivarLeadComData(archiveLead.id, {
          motivo,
          dataReaparecimento,
          observacao,
        })
        if (!res.ok) {
          toast(res.error || "Erro ao arquivar lead.", "error")
          return
        }
        toast("Lead arquivado com sucesso.")
      },
      desarquivarLead,
      setDesarquivarLead,
      handleDesarquivar,
      delLead,
      closeDelete,
      delMotivo,
      setDelMotivo,
      delDetalhe,
      setDelDetalhe,
      handleDeleteConfirm,
    },
  }
}
