"use client"
import { create } from "zustand"
import { mockConversas, mockMensagens, type InboxConversation, type InboxMessage } from "./inbox-mock"

type InboxState = {
  conversas: InboxConversation[]
  mensagens: Record<string, InboxMessage[]>
  selectedId: string | null
  filtro: string
  modoReal: boolean
  instanciaSelecionada: string
  // actions
  setSelected: (id: string | null) => void
  setFiltro: (v: string) => void
  setConversas: (c: InboxConversation[]) => void
  setMensagens: (m: Record<string, InboxMessage[]>) => void
  setModoReal: (v: boolean) => void
  setInstancia: (v: string) => void
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
  setSelected: (id) => set({ selectedId: id }),
  setFiltro: (v) => set({ filtro: v }),
  setConversas: (c) => set({ conversas: c }),
  setMensagens: (m) => set({ mensagens: m }),
  setModoReal: (v) => set({ modoReal: v }),
  setInstancia: (v) => {
    if(typeof window!=="undefined") try{ localStorage.setItem("inbox-instancia", v) }catch{}
    set({ instanciaSelecionada: v })
  },
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
