"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, MessageCircle, Search, Send, Smartphone } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { isGestorNivel } from "@/lib/roles"
import { supabase } from "@/lib/supabase/client"
import { Badge, useToast } from "@/components/ui/primitives"
import { PageHeading } from "@/components/ui/page-heading"
import { STATUS_LABEL, STATUS_VARIANT } from "@/lib/labels"
import type { LeadStatus } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

type Instancia = { id: string; instance_name: string; numero: string | null; status: string; corretorNome: string }
type Conversa = {
  leadId: string
  telefone: string
  nome: string
  status: LeadStatus | null
  ultima: string
  ultimaEm: string
  ultimaDeMim: boolean
  total: number
}
type Mensagem = {
  id: string
  corpo: string
  de_mim: boolean
  criado_em: string
  veio_de_anuncio?: boolean
  anuncio_titulo?: string | null
}

function horaCurta(iso: string) {
  const d = new Date(iso)
  const hoje = new Date()
  const mesmoDia = d.toDateString() === hoje.toDateString()
  return mesmoDia
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

export default function ChatPage() {
  const { user } = useAuth()
  const router = useRouter()
  const toast = useToast()
  const isGestor = isGestorNivel(user?.role ?? "corretor")

  const [instancias, setInstancias] = useState<Instancia[]>([])
  const [instAtiva, setInstAtiva] = useState<string | null>(null)
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [leadAtivo, setLeadAtivo] = useState<string | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [busca, setBusca] = useState("")
  const [texto, setTexto] = useState("")
  const [carregandoConversas, setCarregandoConversas] = useState(false)
  const [carregandoMensagens, setCarregandoMensagens] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (user && !isGestor) router.replace("/painel-corretor")
  }, [user, isGestor, router])

  // Carrega as instâncias (uma por corretor)
  useEffect(() => {
    if (!isGestor) return
    fetch("/api/whatsapp/lookup", { method: "GET" }).catch(() => {})
    fetch("/api/whatsapp/instancias")
      .then((r) => r.json())
      .then((j) => {
        const lista: Instancia[] = j.data ?? []
        setInstancias(lista)
        if (lista.length && !instAtiva) setInstAtiva(lista[0].instance_name)
      })
      .catch(() => {})
  }, [isGestor]) // eslint-disable-line react-hooks/exhaustive-deps

  const carregarConversas = useCallback(async (instanceName: string) => {
    setCarregandoConversas(true)
    try {
      const r = await fetch(`/api/whatsapp/chat/conversas?instanceName=${encodeURIComponent(instanceName)}`)
      const j = await r.json()
      setConversas(j.conversas ?? [])
    } catch {
      setConversas([])
    } finally {
      setCarregandoConversas(false)
    }
  }, [])

  const carregarMensagens = useCallback(async (instanceName: string, leadId: string) => {
    setCarregandoMensagens(true)
    try {
      const r = await fetch(`/api/whatsapp/chat/mensagens?instanceName=${encodeURIComponent(instanceName)}&leadId=${encodeURIComponent(leadId)}`)
      const j = await r.json()
      setMensagens(j.mensagens ?? [])
    } catch {
      setMensagens([])
    } finally {
      setCarregandoMensagens(false)
    }
  }, [])

  // Troca de instância: recarrega conversas e limpa a thread
  useEffect(() => {
    if (!instAtiva) return
    setLeadAtivo(null)
    setMensagens([])
    carregarConversas(instAtiva)
  }, [instAtiva, carregarConversas])

  // Troca de conversa: carrega a thread
  useEffect(() => {
    if (instAtiva && leadAtivo) carregarMensagens(instAtiva, leadAtivo)
  }, [instAtiva, leadAtivo, carregarMensagens])

  // Realtime: qualquer nova mensagem da tabela recarrega a lista e a thread aberta
  useEffect(() => {
    if (!isGestor) return
    const canal = supabase
      .channel("whatsapp-chat")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "whatsapp_mensagens" }, (payload) => {
        const row: any = payload.new
        if (instAtiva && row?.instance_name === instAtiva) {
          carregarConversas(instAtiva)
          if (leadAtivo && row?.lead_id === leadAtivo) carregarMensagens(instAtiva, leadAtivo)
        }
      })
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [isGestor, instAtiva, leadAtivo, carregarConversas, carregarMensagens])

  // Rola a thread para o fim quando chegam mensagens
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight
  }, [mensagens])

  const conversaAtiva = useMemo(() => conversas.find((c) => c.leadId === leadAtivo) ?? null, [conversas, leadAtivo])
  const conversasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return conversas
    return conversas.filter((c) => c.nome.toLowerCase().includes(q) || c.telefone.includes(q))
  }, [conversas, busca])

  async function enviar() {
    if (!texto.trim() || !instAtiva || !conversaAtiva) return
    setEnviando(true)
    try {
      const r = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceName: instAtiva, telefone: conversaAtiva.telefone, texto: texto.trim() }),
      })
      const j = await r.json()
      if (j.ok) {
        setTexto("")
        // A mensagem enviada aparece via Realtime quando a Evolution confirma o envio (fromMe).
      } else {
        toast(j.erro ?? "Não foi possível enviar.", "error")
      }
    } catch {
      toast("Falha de conexão ao enviar.", "error")
    } finally {
      setEnviando(false)
    }
  }

  if (!user || !isGestor) return null

  return (
    <div className="flex flex-col gap-5">
      <PageHeading
        title="Chat"
        badge="WhatsApp"
        subtitle="Conversas dos leads cadastrados, separadas por instância de cada corretor."
      />

      {instancias.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card/60 py-12 text-center text-sm text-muted-foreground">
          Nenhuma instância de WhatsApp conectada. Configure em Conexões WhatsApp.
        </p>
      ) : (
        <div className="flex flex-col gap-4 lg:h-[calc(100vh-11rem)] lg:flex-row">
          {/* Coluna 1 — instâncias */}
          <div className="flex shrink-0 gap-2 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible">
            {instancias.map((inst) => (
              <button
                key={inst.id}
                onClick={() => setInstAtiva(inst.instance_name)}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition",
                  inst.instance_name === instAtiva
                    ? "border-primary/40 bg-primary/5 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                <span className={cn("size-2 shrink-0 rounded-full", inst.status === "conectado" ? "bg-emerald-500" : "bg-muted-foreground/40")} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{inst.corretorNome}</span>
                  {inst.numero && <span className="truncate text-xs text-muted-foreground">{inst.numero}</span>}
                </span>
              </button>
            ))}
          </div>

          {/* Coluna 2 — conversas */}
          <div className="flex h-[26rem] w-full shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card lg:h-full lg:w-80">
            <div className="border-b border-border p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por nome ou telefone"
                  className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {carregandoConversas ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
              ) : conversasFiltradas.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhuma conversa de lead cadastrado nesta instância.</p>
              ) : (
                conversasFiltradas.map((c) => (
                  <button
                    key={c.leadId}
                    onClick={() => setLeadAtivo(c.leadId)}
                    className={cn(
                      "flex w-full flex-col gap-1 border-b border-border/60 px-4 py-3 text-left transition last:border-0",
                      c.leadId === leadAtivo ? "bg-primary/5" : "hover:bg-muted",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{c.nome}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{horaCurta(c.ultimaEm)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {c.ultimaDeMim && <span className="text-muted-foreground/70">Você: </span>}
                        {c.ultima || "—"}
                      </span>
                      {c.status && <Badge variant={STATUS_VARIANT[c.status]} className="shrink-0 text-[10px]">{STATUS_LABEL[c.status]}</Badge>}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Coluna 3 — thread */}
          <div className="flex h-[32rem] flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card lg:h-full">
            {!conversaAtiva ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
                <MessageCircle className="size-8 opacity-40" />
                <p className="text-sm">Selecione uma conversa para ver as mensagens.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 border-b border-border p-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {conversaAtiva.nome.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{conversaAtiva.nome}</span>
                    <span className="flex items-center gap-1 truncate text-xs text-muted-foreground"><Smartphone className="size-3" />{conversaAtiva.telefone}</span>
                  </div>
                  {conversaAtiva.status && <Badge variant={STATUS_VARIANT[conversaAtiva.status]} className="ml-auto shrink-0">{STATUS_LABEL[conversaAtiva.status]}</Badge>}
                </div>

                <div ref={threadRef} className="flex-1 space-y-2 overflow-y-auto bg-muted/30 p-4">
                  {carregandoMensagens ? (
                    <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
                  ) : mensagens.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">Sem mensagens nesta conversa.</p>
                  ) : (
                    mensagens.map((m) => (
                      <div key={m.id} className={cn("flex", m.de_mim ? "justify-end" : "justify-start")}>
                        <div
                          className={cn(
                            "max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                            m.de_mim ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-card text-foreground",
                          )}
                        >
                          {m.veio_de_anuncio && (
                            <p className={cn("mb-1 text-[10px] font-medium uppercase tracking-wide", m.de_mim ? "text-primary-foreground/70" : "text-primary")}>
                              Via anúncio{m.anuncio_titulo ? ` · ${m.anuncio_titulo.slice(0, 40)}` : ""}
                            </p>
                          )}
                          <p className="whitespace-pre-wrap break-words">{m.corpo}</p>
                          <p className={cn("mt-1 text-right text-[10px]", m.de_mim ? "text-primary-foreground/60" : "text-muted-foreground")}>
                            {horaCurta(m.criado_em)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex items-center gap-2 border-t border-border p-3">
                  <input
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar() } }}
                    placeholder="Escreva uma mensagem..."
                    disabled={enviando}
                    className="h-10 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
                  />
                  <button
                    onClick={enviar}
                    disabled={enviando || !texto.trim()}
                    aria-label="Enviar"
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                  >
                    {enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
