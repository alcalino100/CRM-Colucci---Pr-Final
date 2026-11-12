"use client"

import { Input, Label, Select, Textarea } from "@/components/ui/primitives"
import { MESSAGE_VARIABLES } from "@/lib/automation-types"

interface NovaAutomacaoMessageStepProps {
  templates: { id: string; name: string; content: string }[]
  messageTemplateId: string
  setMessageTemplateId: (id: string) => void
  messageContent: string
  setMessageContent: React.Dispatch<React.SetStateAction<string>>
  previewMessage: string
}

export function NovaAutomacaoMessageStep({
  templates,
  messageTemplateId,
  setMessageTemplateId,
  messageContent,
  setMessageContent,
  previewMessage,
}: NovaAutomacaoMessageStepProps) {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold">Mensagem</h2>
      <div>
        <Label>Template de Mensagem</Label>
        <Select value={messageTemplateId} onChange={(e) => setMessageTemplateId(e.target.value)}>
          <option value="">Selecionar template...</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Conteúdo da Mensagem</Label>
        <Textarea
          value={messageContent}
          onChange={(e) => setMessageContent(e.target.value)}
          rows={8}
          placeholder="Digite a mensagem..."
        />
      </div>
      <div>
        <Label>Variáveis disponíveis</Label>
        <div className="mt-1 flex flex-wrap gap-1">
          {MESSAGE_VARIABLES.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setMessageContent((prev) => prev + `{{${v.key}}}`)}
              className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
            >
              {`{{${v.key}}}`}
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label>Prévia da Mensagem</Label>
        <div className="mt-1 rounded-lg border border-border bg-muted/30 p-4 text-sm whitespace-pre-wrap">
          {previewMessage || "Selecione um template ou digite uma mensagem..."}
        </div>
      </div>
    </div>
  )
}
