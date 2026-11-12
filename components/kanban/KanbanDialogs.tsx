"use client"

import { Button } from "@/components/ui/button"
import { Dialog, Input, Label, Select, Textarea } from "@/components/ui/primitives"
import { ArquivarLeadDialog } from "@/components/arquivar-lead-dialog"
import { LeadForm, type LeadFormValues } from "@/components/lead-form"
import { MOTIVOS_EXCLUSAO, STATUS_LABEL, brl } from "@/lib/labels"
import type { Lead } from "@/lib/mock-data"

export const TIPO_IMOVEL_VENDIDO = [
  "Casa",
  "Casa em condomínio fechado",
  "Apartamento",
  "Terreno",
  "Terreno em condomínio fechado",
  "Comercial - Casa",
  "Comercial - Barracão",
]

export function KanbanDialogs({
  // Visita
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

  // Proposta
  propLead,
  setPropLead,
  pValor,
  setPValor,
  pRefs,
  setPRefs,
  pObs,
  setPObs,
  confirmProposal,

  // Fechamento
  closeLead,
  setCloseLead,
  fRefs,
  setFRefs,
  fTipo,
  setFTipo,
  confirmClose,

  // Editar
  editLead,
  setEditLead,
  handleEditSubmit,
  submitting,
  isGestor,

  // Assumir
  assumirDialog,
  setAssumirDialog,
  handleAssumir,
  userName,

  // Enviar Meta
  uploadMeta,
  setUploadMeta,
  handleUploadMeta,

  // Arquivar com Data
  archiveLead,
  setArchiveLead,
  onConfirmArchive,

  // Desarquivar
  desarquivarLead,
  setDesarquivarLead,
  handleDesarquivar,

  // Excluir
  delLead,
  closeDelete,
  delMotivo,
  setDelMotivo,
  delDetalhe,
  setDelDetalhe,
  handleDeleteConfirm,
}: {
  visitLead: Lead | null
  setVisitLead: (l: Lead | null) => void
  vData: string
  setVData: (v: string) => void
  vHora: string
  setVHora: (v: string) => void
  vRefs: string
  setVRefs: (v: string) => void
  vCorretor: string
  setVCorretor: (v: string) => void
  vObs: string
  setVObs: (v: string) => void
  confirmVisit: (e: React.FormEvent) => void
  corretores: { id: string; nome: string }[]

  propLead: Lead | null
  setPropLead: (l: Lead | null) => void
  pValor: string
  setPValor: (v: string) => void
  pRefs: string
  setPRefs: (v: string) => void
  pObs: string
  setPObs: (v: string) => void
  confirmProposal: (e: React.FormEvent) => void

  closeLead: Lead | null
  setCloseLead: (l: Lead | null) => void
  fRefs: string
  setFRefs: (v: string) => void
  fTipo: string
  setFTipo: (v: string) => void
  confirmClose: (e: React.FormEvent) => void

  editLead: Lead | null
  setEditLead: (l: Lead | null) => void
  handleEditSubmit: (v: LeadFormValues) => void
  submitting: boolean
  isGestor: boolean

  assumirDialog: Lead | null
  setAssumirDialog: (l: Lead | null) => void
  handleAssumir: () => Promise<void>
  userName: (id: string) => string

  uploadMeta: Lead | null
  setUploadMeta: (l: Lead | null) => void
  handleUploadMeta: () => Promise<void>

  archiveLead: Lead | null
  setArchiveLead: (l: Lead | null) => void
  onConfirmArchive: (dados: { motivo: string; dataReaparecimento: string; observacao?: string }) => Promise<void>

  desarquivarLead: Lead | null
  setDesarquivarLead: (l: Lead | null) => void
  handleDesarquivar: () => Promise<void>

  delLead: Lead | null
  closeDelete: () => void
  delMotivo: string
  setDelMotivo: (v: string) => void
  delDetalhe: string
  setDelDetalhe: (v: string) => void
  handleDeleteConfirm: () => Promise<void>
}) {
  return (
    <>
      {/* Diálogo Agendar Visita */}
      <Dialog open={!!visitLead} onClose={() => setVisitLead(null)} title="Agendar Visita">
        <form onSubmit={confirmVisit} className="flex flex-col gap-3">
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
            <Button type="button" variant="outline" onClick={() => setVisitLead(null)}>
              Cancelar
            </Button>
            <Button type="submit">Agendar visita</Button>
          </div>
        </form>
      </Dialog>

      {/* Diálogo Registrar Proposta */}
      <Dialog open={!!propLead} onClose={() => setPropLead(null)} title="Valor da Proposta">
        <form onSubmit={confirmProposal} className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Lead: <span className="font-medium text-foreground">{propLead?.nome}</span> — {propLead?.imovelRef || "sem imóvel"}
          </p>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pv">Valor (R$) *</Label>
            <Input id="pv" type="number" value={pValor} onChange={(e) => setPValor(e.target.value)} placeholder="450000" />
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
            <Button type="button" variant="outline" onClick={() => setPropLead(null)}>
              Cancelar
            </Button>
            <Button type="submit">Registrar proposta</Button>
          </div>
        </form>
      </Dialog>

      {/* Diálogo Registrar Fechamento */}
      <Dialog open={!!closeLead} onClose={() => setCloseLead(null)} title="Registrar Fechamento">
        <form onSubmit={confirmClose} className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Lead: <span className="font-medium text-foreground">{closeLead?.nome}</span> — {closeLead ? brl(closeLead.valorNegociacao) : ""}
          </p>
          <div className="flex flex-col gap-1">
            <Label htmlFor="fr">Referência(s) do fechamento *</Label>
            <Input id="fr" value={fRefs} onChange={(e) => setFRefs(e.target.value)} placeholder="Ex: AP-1006" required />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ftipo">Tipo do imóvel vendido *</Label>
            <Select id="ftipo" value={fTipo} onChange={(e) => setFTipo(e.target.value)} aria-label="Tipo do imóvel vendido" required>
              <option value="">Selecione...</option>
              {TIPO_IMOVEL_VENDIDO.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCloseLead(null)}>
              Cancelar
            </Button>
            <Button type="submit">Confirmar fechamento</Button>
          </div>
        </form>
      </Dialog>

      {/* Diálogo Editar Lead */}
      <Dialog open={!!editLead} onClose={() => setEditLead(null)} title="Editar Lead">
        {editLead && (
          <LeadForm
            initial={editLead}
            defaultCorretorId={editLead.corretorId}
            showCorretor={isGestor}
            showStatus
            submitting={submitting}
            onSubmit={handleEditSubmit}
            onCancel={() => setEditLead(null)}
          />
        )}
      </Dialog>

      {/* Diálogo Assumir Supervisão */}
      <Dialog open={!!assumirDialog} onClose={() => setAssumirDialog(null)} title="Assumir Atendimento">
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
            <Button type="button" variant="outline" onClick={() => setAssumirDialog(null)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleAssumir}>
              {assumirDialog?.gestorResponsavel ? "Remover supervisão" : "Assumir lead"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Diálogo Enviar ao Meta */}
      <Dialog open={!!uploadMeta} onClose={() => (!submitting ? setUploadMeta(null) : undefined)} title="Enviar ao Meta">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Lead: <span className="font-medium text-foreground">{uploadMeta?.nome}</span>
            {uploadMeta && uploadMeta.corretorId && (
              <> — Corretor: <span className="font-medium text-foreground">{userName(uploadMeta.corretorId)}</span></>
            )}
          </p>
          {uploadMeta && (
            <p className="text-sm font-display font-semibold text-primary">
              {brl(uploadMeta.valorNegociacao)}
              {uploadMeta.refFechamento ? ` — Ref: ${uploadMeta.refFechamento}` : ""}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            O evento de compra será enviado ao Meta Ads. O lead <strong className="text-foreground">não</strong> será arquivado — use a opção &quot;Arquivar&quot; depois, se quiser.
          </p>
          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setUploadMeta(null)} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleUploadMeta} disabled={submitting}>
              {submitting ? "Enviando…" : "Enviar ao Meta"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Diálogo Arquivar com Data */}
      <ArquivarLeadDialog
        lead={archiveLead}
        open={!!archiveLead}
        onClose={() => setArchiveLead(null)}
        onConfirm={onConfirmArchive}
      />

      {/* Diálogo Desarquivar */}
      <Dialog open={!!desarquivarLead} onClose={() => (!submitting ? setDesarquivarLead(null) : undefined)} title="Desarquivar Lead">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Lead: <span className="font-medium text-foreground">{desarquivarLead?.nome}</span>
            {desarquivarLead && desarquivarLead.corretorId && (
              <> — Corretor: <span className="font-medium text-foreground">{userName(desarquivarLead.corretorId)}</span></>
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            O lead voltará para o quadro (etapa: <strong className="text-foreground">{desarquivarLead ? STATUS_LABEL[desarquivarLead.status] : ""}</strong>).
          </p>
          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDesarquivarLead(null)} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleDesarquivar} disabled={submitting}>
              {submitting ? "Desarquivando…" : "Desarquivar"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Diálogo Excluir Lead */}
      <Dialog open={!!delLead} onClose={() => (!submitting ? closeDelete() : undefined)} title="Excluir Lead">
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
          <Button type="button" variant="outline" onClick={closeDelete} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="button" className="bg-destructive text-white hover:bg-destructive/90" onClick={handleDeleteConfirm} disabled={submitting}>
            {submitting ? "Excluindo…" : "Excluir"}
          </Button>
        </div>
      </Dialog>
    </>
  )
}
