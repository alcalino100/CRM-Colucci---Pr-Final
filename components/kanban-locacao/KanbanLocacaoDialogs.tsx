"use client"

import { Button } from "@/components/ui/button"
import { Dialog, Input, Label, Select, Textarea } from "@/components/ui/primitives"
import { LocacaoLeadForm, type LocacaoLeadFormValues } from "@/components/locacao-lead-form"
import {
  MOTIVOS_EXCLUSAO,
  LOCACAO_STATUS_LABEL,
  brl,
  refsTexto,
} from "@/lib/locacao-labels"
import type { LocacaoLead } from "@/lib/locacao-labels"

interface KanbanLocacaoDialogsProps {
  // Visit
  visitLead: LocacaoLead | null
  onCloseVisit: () => void
  onConfirmVisit: (e: React.FormEvent) => void
  vData: string
  setVData: (val: string) => void
  vHora: string
  setVHora: (val: string) => void
  vCorretor: string
  setVCorretor: (val: string) => void
  vRefs: string
  setVRefs: (val: string) => void
  vObs: string
  setVObs: (val: string) => void

  // Proposal
  propLead: LocacaoLead | null
  onCloseProp: () => void
  onConfirmProposal: (e: React.FormEvent) => void
  pValor: string
  setPValor: (val: string) => void
  pRefs: string
  setPRefs: (val: string) => void
  pObs: string
  setPObs: (val: string) => void

  // Close (Fechamento)
  closeLead: LocacaoLead | null
  onCloseClose: () => void
  onConfirmClose: (e: React.FormEvent) => void
  fRefs: string
  setFRefs: (val: string) => void
  fValor: string
  setFValor: (val: string) => void

  // Edit
  editLead: LocacaoLead | null
  onCloseEdit: () => void
  onEditSubmit: (v: LocacaoLeadFormValues) => void
  isGestor: boolean

  // Assumir
  assumirDialog: LocacaoLead | null
  onCloseAssumir: () => void
  onConfirmAssumir: () => void

  // Archive
  archiveLead: LocacaoLead | null
  onCloseArchive: () => void
  onConfirmArchive: () => void

  // Desarquivar
  desarquivarLead: LocacaoLead | null
  onCloseDesarquivar: () => void
  onConfirmDesarquivar: () => void

  // Delete
  delLead: LocacaoLead | null
  onCloseDelete: () => void
  onConfirmDelete: () => void
  delMotivo: string
  setDelMotivo: (val: string) => void
  delDetalhe: string
  setDelDetalhe: (val: string) => void

  // Common
  submitting: boolean
  corretores: { id: string; nome: string }[]
  userName: (id: string) => string
}

export function KanbanLocacaoDialogs({
  visitLead,
  onCloseVisit,
  onConfirmVisit,
  vData,
  setVData,
  vHora,
  setVHora,
  vCorretor,
  setVCorretor,
  vRefs,
  setVRefs,
  vObs,
  setVObs,

  propLead,
  onCloseProp,
  onConfirmProposal,
  pValor,
  setPValor,
  pRefs,
  setPRefs,
  pObs,
  setPObs,

  closeLead,
  onCloseClose,
  onConfirmClose,
  fRefs,
  setFRefs,
  fValor,
  setFValor,

  editLead,
  onCloseEdit,
  onEditSubmit,
  isGestor,

  assumirDialog,
  onCloseAssumir,
  onConfirmAssumir,

  archiveLead,
  onCloseArchive,
  onConfirmArchive,

  desarquivarLead,
  onCloseDesarquivar,
  onConfirmDesarquivar,

  delLead,
  onCloseDelete,
  onConfirmDelete,
  delMotivo,
  setDelMotivo,
  delDetalhe,
  setDelDetalhe,

  submitting,
  corretores,
  userName,
}: KanbanLocacaoDialogsProps) {
  return (
    <>
      <Dialog open={!!visitLead} onClose={onCloseVisit} title="Agendar Visita">
        <form onSubmit={onConfirmVisit} className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Lead: <span className="font-medium text-foreground">{visitLead?.nome}</span> — {visitLead?.imovelRef || "sem imóvel"}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="vd">Data *</Label>
              <Input id="vd" type="date" value={vData} onChange={(e) => setVData(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="vh">Horário *</Label>
              <Input id="vh" type="time" value={vHora} onChange={(e) => setVHora(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="vr">Referência(s) do imóvel *</Label>
            <Input id="vr" value={vRefs} onChange={(e) => setVRefs(e.target.value)} placeholder="Ex: AP-1006, CA-2005" required />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="vc">Corretor responsável</Label>
            <Select id="vc" value={vCorretor} onChange={(e) => setVCorretor(e.target.value)}>
              {corretores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="vo">Observações</Label>
            <Textarea id="vo" value={vObs} onChange={(e) => setVObs(e.target.value)} />
          </div>
          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCloseVisit}>
              Cancelar
            </Button>
            <Button type="submit">Agendar visita</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={!!propLead} onClose={onCloseProp} title="Registrar Proposta de Locação">
        <form onSubmit={onConfirmProposal} className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Lead: <span className="font-medium text-foreground">{propLead?.nome}</span> — {propLead?.imovelRef || "sem imóvel"}
          </p>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pv">Valor do aluguel (R$) *</Label>
            <Input id="pv" type="number" value={pValor} onChange={(e) => setPValor(e.target.value)} placeholder="2500" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pr">Referência(s) da proposta *</Label>
            <Input id="pr" value={pRefs} onChange={(e) => setPRefs(e.target.value)} placeholder="Ex: AP-1006" required />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="po">Observações</Label>
            <Textarea id="po" value={pObs} onChange={(e) => setPObs(e.target.value)} />
          </div>
          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCloseProp}>
              Cancelar
            </Button>
            <Button type="submit">Registrar proposta</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={!!closeLead} onClose={onCloseClose} title="Registrar Locação Fechada">
        <form onSubmit={onConfirmClose} className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Lead: <span className="font-medium text-foreground">{closeLead?.nome}</span> — {closeLead ? brl(closeLead.valorAluguel) : ""}
          </p>
          <div className="flex flex-col gap-1">
            <Label htmlFor="fr">Referência(s) do imóvel locado *</Label>
            <Input id="fr" value={fRefs} onChange={(e) => setFRefs(e.target.value)} placeholder="Ex: AP-1006" required />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="fvalor">Valor do aluguel (R$) *</Label>
            <Input id="fvalor" type="number" value={fValor} onChange={(e) => setFValor(e.target.value)} placeholder="2500" required />
          </div>
          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCloseClose}>
              Cancelar
            </Button>
            <Button type="submit">Confirmar locação</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={!!editLead} onClose={onCloseEdit} title="Editar Lead">
        {editLead && (
          <LocacaoLeadForm
            initial={editLead}
            defaultCorretorId={editLead.corretorId}
            showCorretor={isGestor}
            showStatus
            submitting={submitting}
            onSubmit={onEditSubmit}
            onCancel={onCloseEdit}
          />
        )}
      </Dialog>

      <Dialog open={!!assumirDialog} onClose={onCloseAssumir} title="Assumir Atendimento">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Lead: <span className="font-medium text-foreground">{assumirDialog?.nome}</span>
            {assumirDialog && assumirDialog.corretorId && (
              <> — Corretor: <span className="font-medium text-foreground">{userName(assumirDialog.corretorId)}</span></>
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            {assumirDialog?.gestorResponsavel
              ? `Este lead está atualmente sob responsabilidade de ${userName(assumirDialog.gestorResponsavel)}. Deseja remover a supervisão deste lead?`
              : "Você está assumindo a supervisão deste lead. O corretor será notificado sobre sua supervisão."}
          </p>
          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCloseAssumir}>
              Cancelar
            </Button>
            <Button type="button" onClick={onConfirmAssumir}>
              {assumirDialog?.gestorResponsavel ? "Remover supervisão" : "Assumir lead"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!archiveLead} onClose={() => (!submitting ? onCloseArchive() : undefined)} title="Arquivar Lead">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Lead: <span className="font-medium text-foreground">{archiveLead?.nome}</span>
            {archiveLead && archiveLead.corretorId && (
              <> — Corretor: <span className="font-medium text-foreground">{userName(archiveLead.corretorId)}</span></>
            )}
          </p>
          {archiveLead && (
            <p className="text-sm font-display font-semibold text-primary">
              {brl(archiveLead.valorAluguel)}
              {refsTexto(archiveLead) ? ` — Ref: ${refsTexto(archiveLead)}` : ""}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            O lead será <strong className="text-foreground">arquivado</strong> (sai do quadro, mas permanece no histórico). Nenhum evento será enviado ao Meta.
          </p>
          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCloseArchive} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="button" onClick={onConfirmArchive} disabled={submitting}>
              {submitting ? "Arquivando…" : "Arquivar"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!desarquivarLead} onClose={() => (!submitting ? onCloseDesarquivar() : undefined)} title="Desarquivar Lead">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Lead: <span className="font-medium text-foreground">{desarquivarLead?.nome}</span>
            {desarquivarLead && desarquivarLead.corretorId && (
              <> — Corretor: <span className="font-medium text-foreground">{userName(desarquivarLead.corretorId)}</span></>
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            O lead voltará para o quadro (etapa: <strong className="text-foreground">{desarquivarLead ? LOCACAO_STATUS_LABEL[desarquivarLead.status] : ""}</strong>).
          </p>
          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCloseDesarquivar} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="button" onClick={onConfirmDesarquivar} disabled={submitting}>
              {submitting ? "Desarquivando…" : "Desarquivar"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!delLead} onClose={() => (!submitting ? onCloseDelete() : undefined)} title="Excluir Lead">
        <p className="text-sm text-muted-foreground">
          Tem certeza que deseja excluir este lead? Esta ação não pode ser desfeita e será registrada na auditoria.
        </p>
        {delLead && (
          <p className="mt-2 text-sm font-medium text-foreground">
            {delLead.nome} — {delLead.imovelRef || "sem imóvel"}
          </p>
        )}
        <div className="mt-4 grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="del-motivo">Motivo da exclusão</Label>
            <Select id="del-motivo" value={delMotivo} onChange={(e) => setDelMotivo(e.target.value)}>
              <option value="">Selecione…</option>
              {MOTIVOS_EXCLUSAO.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="del-detalhe">Detalhe (obrigatório)</Label>
            <Textarea
              id="del-detalhe"
              rows={3}
              value={delDetalhe}
              onChange={(e) => setDelDetalhe(e.target.value)}
              placeholder="Explique o motivo desta exclusão para o registro de auditoria."
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCloseDelete} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={onConfirmDelete}
            disabled={submitting}
          >
            {submitting ? "Excluindo…" : "Excluir"}
          </Button>
        </div>
      </Dialog>
    </>
  )
}
