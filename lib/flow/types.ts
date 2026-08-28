// =============================================================================
// flow/types.ts — Tipos do builder de Fluxos de Automação (UI somente)
// =============================================================================

export type FlowCategory = "gatilho" | "conteudo" | "logica" | "acao" | "integracao" | "fluxo"

export type FlowNodeType =
  | "start"
  | "webhook_recebido"
  | "lead_criado"
  | "tag_aplicada"
  | "tempo_decorrido"
  | "enviar_mensagem"
  | "enviar_email"
  | "enviar_whatsapp"
  | "notificacao_interna"
  | "condicao"
  | "split"
  | "aguardar_resposta"
  | "loop"
  | "aplicar_tag"
  | "remover_tag"
  | "mover_segmento"
  | "atualizar_campo"
  | "disparar_webhook"
  | "criar_tarefa"
  | "encaminhar_humano"
  | "consultar_api"
  | "salvar_banco"
  | "ir_para_fluxo"
  | "fim"

export type FieldValue = string | number | boolean

export interface FlowNode {
  id: string
  position: { x: number; y: number }
  data: {
    nodeType: FlowNodeType
    nome: string
    config: Record<string, FieldValue>
    erro?: boolean
  }
}

export type BranchHandle = "out" | "else"

export interface FlowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: BranchHandle | null
  label?: string
  main?: boolean
}

export type FlowTipo = "Captura" | "Qualificacao" | "Venda" | "Nutricao" | "Reengajamento"
export type FlowStatus = "ativo" | "inativo" | "rascunho"

export interface FlowDoc {
  id: string
  nome: string
  tipo: FlowTipo
  descricao: string
  status: FlowStatus
  sessoesAtivas: number
  taxaConversao: number
  updatedAt: number
  nodes: FlowNode[]
  edges: FlowEdge[]
  arquivado?: boolean
}

export interface FlowValidation {
  temInicio: boolean
  multiplosInicios: boolean
  orfaos: string[]
  semSaida: string[]
}