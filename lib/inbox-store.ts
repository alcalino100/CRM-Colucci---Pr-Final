"use client"
import { create } from "zustand"
import { mockConversas, mockMensagens, type InboxConversation, type InboxMessage } from "./inbox-mock"

export type OrdenacaoInbox = "recente" | "antigo" | "status" | "origem" | "corretor" | "prioridade_ia"

type InboxState = {
  conversas: InboxConversation[]
  mensagens: Record<string, InboxMessage[]>
  selectedId: string | null
  filtro: string
  modoReal: boolean
  instanciaSelecionada: string
  ordenacao: OrdenacaoInbox
  filtroOrigem: string
  filtroStatus: string
  filtroCorretor: string
  // actions
  setSelected: (id: string | null) => void
  setFiltro: (v: string) => void
  setConversas: (c: InboxConversation[]) => void
  setConversaLead: (id: string, leadId: string, tags?: string[]) => void
  setConversaTags: (id: string, tags: string[]) => void
  setMensagens: (m: Record<string, InboxMessage[]>) => void
  setModoReal: (v: boolean) => void
  setInstancia: (v: string) => void
  setOrdenacao: (v: OrdenacaoInbox) => void
  setFiltroOrigem: (v: string) => void
  setFiltroStatus: (v: string) => void
  setFiltroCorretor: (v: string) => void
  enviarMensagem: (conversationId: string, content: string) => void
  assumirConversa: (id: string) => void
  cancelarFollowUp: (id: string) => void
  marcarRespondido: (id: string) => void
  criarFollowUp: (id: string) => void
}

export const useInboxStore = create<InboxState>((set, get) => ({
  conversas: mockConversas,
  mensagens: mockMensagens,
  selectedId: null,
  filtro: "",
  modoReal: false,
  instanciaSelecionada: "patricia-6c2875b4",
  ordenacao: "prioridade_ia" as OrdenacaoInbox,
  filtroOrigem: "todas",
  filtroStatus: "todos",
  filtroCorretor: "todos",
  setSelected: (id) => set({ selectedId: id }),
  setFiltro: (v) => set({ filtro: v }),
  setConversas: (c) => set({ conversas: c }),
  setConversaLead: (id, leadId, tags) =>
    set((s) => ({
      conversas: s.conversas.map((c) => (c.id === id ? { ...c, leadId, ...(tags ? { tags } : {}) } : c)),
    })),
  setConversaTags: (id, tags) =>
    set((s) => ({
      conversas: s.conversas.map((c) => (c.id === id ? { ...c, tags } : c)),
    })),
  setMensagens: (m) => set({ mensagens: m }),
  setModoReal: (v) => set({ modoReal: v }),
  setInstancia: (v) => {
    if(typeof window!=="undefined") try{ localStorage.setItem("inbox-instancia", v) }catch{}
    set({ instanciaSelecionada: v })
  },
  setOrdenacao: (v) => set({ ordenacao: v }),
  setFiltroOrigem: (v) => set({ filtroOrigem: v }),
  setFiltroStatus: (v) => set({ filtroStatus: v }),
  setFiltroCorretor: (v) => set({ filtroCorretor: v }),
  enviarMensagem: (conversationId, content) =>
    set((s) => {
      const nova: InboxMessage = {
        id: `m-${Date.now()}`,
        conversationId,
        timestamp: new Date().toISOString(),
        sender: "você",
        origem: "outbound",
        content,
      }
      const lista = s.mensagens[conversationId] ? [...s.mensagens[conversationId], nova] : [nova]
      const conversas = s.conversas.map((c) =>
        c.id === conversationId ? { ...c, ultimaMensagem: `Você: ${content}`, timestamp: nova.timestamp, status: "respondido" as const, unread: 0 } : c
      )
      return { mensagens: { ...s.mensagens, [conversationId]: lista }, conversas }
    }),
  assumirConversa: (id) =>
    set((s) => ({
      conversas: s.conversas.map((c) => (c.id === id ? { ...c, status: "respondido" as const, followUpAtivo: false, unread: 0 } : c)),
    })),
  cancelarFollowUp: (id) =>
    set((s) => ({
      conversas: s.conversas.map((c) => (c.id === id ? { ...c, followUpAtivo: false, status: "aguardando_resposta" as const } : c)),
    })),
  marcarRespondido: (id) =>
    set((s) => ({
      conversas: s.conversas.map((c) => (c.id === id ? { ...c, status: "respondido" as const, unread: 0, followUpAtivo: false } : c)),
    })),
  criarFollowUp: (id) =>
    set((s) => ({
      conversas: s.conversas.map((c) =>
        c.id === id ? { ...c, followUpAtivo: true, status: "em_follow_up" as const, tentativasRestantes: 3, proximaTentativaISO: new Date(Date.now()+3*3600_000).toISOString() } : c
      ),
    })),
}))
