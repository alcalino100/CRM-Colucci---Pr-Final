// =============================================================================
// flow/flow-store.ts — Store Zustand (persist em localStorage) + seeds + valid.
// =============================================================================

"use client"

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { NODE_TYPES, defaultConfig, nomeSugerido } from "./palette"
import type {
  FlowDoc, FlowNode, FlowEdge, FlowNodeType, FlowStatus, FlowTipo,
  BranchHandle, FlowValidation,
} from "./types"

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function novoNode(tipo: FlowNodeType, x: number, y: number): FlowNode {
  const def = NODE_TYPES[tipo]
  return {
    id: uid(),
    position: { x, y },
    data: { nodeType: tipo, nome: nomeSugerido(tipo), config: defaultConfig(def) },
  }
}

export function novaAresta(source: string, target: string, sourceHandle?: BranchHandle | null): FlowEdge {
  const main = sourceHandle !== "else"
  const label = sourceHandle === "else" ? "Não" : ""
  return { id: uid(), source, target, sourceHandle: sourceHandle ?? "out", label, main }
}

export function validarFluxo(flow: FlowDoc): FlowValidation {
  const starts = flow.nodes.filter((n) => n.data.nodeType === "start")
  const orfaos = flow.nodes.filter((n) => n.data.nodeType !== "start" && !flow.edges.some((e) => e.target === n.id)).map((n) => n.data.nome)
  const semSaida = flow.nodes
    .filter((n) => n.data.nodeType !== "fim" && !flow.edges.some((e) => e.source === n.id))
    .map((n) => n.data.nome)
  return {
    temInicio: starts.length > 0,
    multiplosInicios: starts.length > 1,
    orfaos,
    semSaida,
  }
}

export interface FlowState {
  flows: Record<string, FlowDoc>
  createFlow: (tipo: FlowTipo) => string
  renameFlow: (id: string, nome: string) => void
  setFluxoTipo: (id: string, tipo: FlowTipo) => void
  setDescricao: (id: string, descricao: string) => void
  setStatus: (id: string, status: FlowStatus) => void
  addNode: (id: string, tipo: FlowNodeType, position: { x: number; y: number }) => string
  moveNode: (id: string, nodeId: string, position: { x: number; y: number }) => void
  updateNode: (id: string, nodeId: string, patch: Partial<FlowNode["data"]>) => void
  removeNode: (id: string, nodeId: string) => void
  addEdge: (id: string, edge: Omit<FlowEdge, "id">) => void
  removeEdge: (id: string, edgeId: string) => void
  touch: (id: string) => void
  duplicateFlow: (id: string) => string
  deleteFlow: (id: string) => void
  archiveFlow: (id: string, arquivado: boolean) => void
  resetDemo: () => void
}

const TIPOS_POOL: FlowTipo[] = ["Captura", "Qualificacao", "Venda", "Nutricao", "Reengajamento"]

function seedFlows(): Record<string, FlowDoc> {
  const agora = Date.now()
  const mk = (
    nome: string, tipo: FlowTipo, status: FlowStatus, sessoesAtivas: number, taxaConversao: number, n: number
  ): FlowDoc => {
    const start = novoNode("start", 0, 0)
    const msg = novoNode("enviar_mensagem", 280, 0)
    const fim = novoNode("fim", 560, 0)
    const nodes = [start]
    const edges: FlowEdge[] = []
    if (n >= 2) nodes.push(msg)
    if (n >= 3) nodes.push(fim)
    if (nodes.length > 1) edges.push(novaAresta(nodes[0].id, nodes[1].id))
    if (nodes.length > 2) edges.push(novaAresta(nodes[1].id, nodes[2].id))
    return {
      id: `seed-${Math.random().toString(36).slice(2, 8)}`,
      nome, tipo, status,
      descricao: "",
      sessoesAtivas, taxaConversao,
      updatedAt: agora,
      nodes, edges, arquivado: false,
    }
  }

  const f1 = mk("Boas-vindas Novo Lead", "Captura", "ativo", 1284, 38, 3)
  f1.nodes[1].data.config.mensagem = "Olá {{primeiro_nome}}! 👋 Sou {{nome_corretor}} da {{nome_imobiliaria}}. Recebi seu interesse e quero te apresentar as melhores opções. Podemos conversar?"
  f1.nodes[2].data.nome = "Fim do Fluxo"

  const f2 = mk("Follow-up Locação Barracão", "Nutricao", "ativo", 342, 22, 3)

  const f3 = mk("Reengajamento 30 dias", "Reengajamento", "rascunho", 0, 0, 3)

  const f4 = mk("Murmúrio de Aniversário", "Nutricao", "inativo", 98, 12, 3)

  const f5 = mk("Qualificação de Interesse", "Qualificacao", "ativo", 771, 51, 3)

  return { [f1.id]: f1, [f2.id]: f2, [f3.id]: f3, [f4.id]: f4, [f5.id]: f5 }
}

const STORAGE_KEY = "colucci-fluxos-v1"

export const useFlowStore = create<FlowState>()(
  persist(
    (set) => ({
      flows: seedFlows(),

      createFlow: (tipo) => {
        const id = uid()
        const start = novoNode("start", 0, 0)
        set((s) => ({
          flows: {
            ...s.flows,
            [id]: {
              id, nome: "Novo fluxo",
              tipo, status: "rascunho", descricao: "",
              sessoesAtivas: 0, taxaConversao: 0,
              updatedAt: Date.now(),
              nodes: [start], edges: [], arquivado: false,
            },
          },
        }))
        return id
      },

      renameFlow: (id, nome) =>
        set((s) => s.flows[id] && { flows: { ...s.flows, [id]: { ...s.flows[id], nome, updatedAt: Date.now() } } }),

      setFluxoTipo: (id, tipo) =>
        set((s) => s.flows[id] && { flows: { ...s.flows, [id]: { ...s.flows[id], tipo, updatedAt: Date.now() } } }),

      setDescricao: (id, descricao) =>
        set((s) => s.flows[id] && { flows: { ...s.flows, [id]: { ...s.flows[id], descricao, updatedAt: Date.now() } } }),

      setStatus: (id, status) =>
        set((s) => s.flows[id] && { flows: { ...s.flows, [id]: { ...s.flows[id], status, updatedAt: Date.now() } } }),

      addNode: (id, tipo, position) => {
        const node = novoNode(tipo, position.x, position.y)
        set((s) =>
          s.flows[id] && {
            flows: { ...s.flows, [id]: { ...s.flows[id], nodes: [...s.flows[id].nodes, node], updatedAt: Date.now() } },
          }
        )
        return node.id
      },

      moveNode: (id, nodeId, position) =>
        set((s) =>
          s.flows[id] && {
            flows: {
              ...s.flows,
              [id]: {
                ...s.flows[id],
                nodes: s.flows[id].nodes.map((n) => (n.id === nodeId ? { ...n, position } : n)),
                updatedAt: Date.now(),
              },
            },
          }
        ),

      updateNode: (id, nodeId, patch) =>
        set((s) =>
          s.flows[id] && {
            flows: {
              ...s.flows,
              [id]: {
                ...s.flows[id],
                nodes: s.flows[id].nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)),
                updatedAt: Date.now(),
              },
            },
          }
        ),

      removeNode: (id, nodeId) =>
        set((s) =>
          s.flows[id] && {
            flows: {
              ...s.flows,
              [id]: {
                ...s.flows[id],
                nodes: s.flows[id].nodes.filter((n) => n.id !== nodeId),
                edges: s.flows[id].edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
                updatedAt: Date.now(),
              },
            },
          }
        ),

      addEdge: (id, edge) =>
        set((s) =>
          s.flows[id] && {
            flows: {
              ...s.flows,
              [id]: {
                ...s.flows[id],
                edges: [...s.flows[id].edges, novaAresta(edge.source, edge.target, edge.sourceHandle)],
                updatedAt: Date.now(),
              },
            },
          }
        ),

      removeEdge: (id, edgeId) =>
        set((s) =>
          s.flows[id] && {
            flows: {
              ...s.flows,
              [id]: {
                ...s.flows[id],
                edges: s.flows[id].edges.filter((e) => e.id !== edgeId),
                updatedAt: Date.now(),
              },
            },
          }
        ),

      touch: (id) =>
        set((s) => s.flows[id] && { flows: { ...s.flows, [id]: { ...s.flows[id], updatedAt: Date.now() } } }),

      duplicateFlow: (id) => {
        const copyId = uid()
        set((s) => {
          const src = s.flows[id]
          if (!src) return {}
          const nodeMap: Record<string, string> = {}
          const nodes = src.nodes.map((n) => {
            const novaId = uid()
            nodeMap[n.id] = novaId
            return { ...n, id: novaId }
          })
          const edges = src.edges.map((e) => ({
            ...e, id: uid(),
            source: nodeMap[e.source] ?? e.source,
            target: nodeMap[e.target] ?? e.target,
          }))
          return {
            flows: {
              ...s.flows,
              [copyId]: {
                ...src, id: copyId, nome: `${src.nome} (cópia)`,
                status: "rascunho", sessoesAtivas: 0, taxaConversao: 0,
                updatedAt: Date.now(), nodes, edges,
              },
            },
          }
        })
        return copyId
      },

      deleteFlow: (id) =>
        set((s) => {
          if (!s.flows[id]) return {}
          const next = { ...s.flows }
          delete next[id]
          return { flows: next }
        }),

      archiveFlow: (id, arquivado) =>
        set((s) =>
          s.flows[id] && {
            flows: { ...s.flows, [id]: { ...s.flows[id], arquivado, updatedAt: Date.now() } },
          }
        ),

      resetDemo: () => set({ flows: seedFlows() }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ flows: s.flows }),
      onRehydrateStorage: () => (state) => {
        if (!state || !state.flows || Object.keys(state.flows).length === 0) {
          // nunca deixa vazio — se o usuário apagou tudo, mantém vazio de proposta
        }
      },
    }
  )
)

export const TIPOS_FLUXO: FlowTipo[] = TIPOS_POOL