"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search, SearchX, X } from "lucide-react"
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd"
import { Button } from "@/components/ui/button"
import { Dialog, Input, Label, Select, Textarea, useToast } from "@/components/ui/primitives"
import { LeadCard } from "@/components/lead-card"
import { LeadForm, type LeadFormValues } from "@/components/lead-form"
import { useLeads } from "@/lib/leads-store"
import { useAuth } from "@/lib/auth-context"
import { LEAD_STATUSES, MOTIVOS_EXCLUSAO, STATUS_ACCENT, STATUS_LABEL, TEMPERATURAS, TEMP_LABEL, brl, normalizePhone, refsTexto } from "@/lib/labels"
import { type Lead, type LeadStatus, type Temperatura } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

export function KanbanBoard({
  leads,
  showCorretor = false,
  currentCorretorId,
  isGestor = false,
  heightClass = "h-[calc(100vh-13rem)]",
}: {
  leads: Lead[]
  showCorretor?: boolean
  currentCorretorId: string
  isGestor?: boolean
  heightClass?: string
}) {
  const { updateLead, deleteLead, addVisit, addInteraction, notify, logChange, logAudit, addJustification, justifications, visits, corretores, userName } = useLeads()
  const { user } = useAuth()
  const router = useRouter()
  const toast = useToast()
  const [visitLead, setVisitLead] = useState<Lead | null>(null)
  const [propLead, setPropLead] = useState<Lead | null>(null)
  const [closeLead, setCloseLead] = useState<Lead | null>(null)
  const [editLead, setEditLead] = useState<Lead | null>(null)
  const [delLead, setDelLead] = useState<Lead | null>(null)
  const [delMotivo, setDelMotivo] = useState("")
  const [delDetalhe, setDelDetalhe] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [tempFilter, setTempFilter] = useState<Temperatura | "todas">("todas")
  const [query, setQuery] = useState("")
  const [justificationLead, setJustificationLead] = useState<Lead | null>(null)
  const [justificationReason, setJustificationReason] = useState("")
  const [justificationNote, setJustificationNote] = useState("")
  const [pendingAction, setPendingAction] = useState<null | (() => void)>(null)

  const usuarioNome = user ? userName(user.id) : "Sistema"
  const canManage = (lead: Lead) => isGestor || lead.corretorId === currentCorretorId
}
