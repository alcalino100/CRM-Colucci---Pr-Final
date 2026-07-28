"use client"

import { useState, useRef, useEffect } from "react"
import { Bot, X, Send, MessageSquare, Sparkles } from "lucide-react"

interface Mensagem {
  role: "user" | "assistant"
  content: string
}

const SUGESTOES = [
  "Resumo geral do desempenho de ontem",
  "Qual campanha gastou mais sem gerar leads?",
  "Quantos leads tive e qual o CPL?",
  "Quais os melhores anúncios?",
]

export default function MetaAiChat() {
  const [aberto, setAberto] = useState(false)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [input, setInput] = useState("")
  const [carregando, setCarregando] = useState(false)
  const listaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listaRef.current) {
      listaRef.current.scrollTop = listaRef.current.scrollHeight
    }
  }, [mensagens])

  async function enviar(texto: string) {
    const msg = texto.trim()
    if (!msg || carregando) return
    setInput("")
    const novas: Mensagem[] = [...mensagens, { role: "user", content: msg }]
    setMensagens(novas)
    setCarregando(true)

    try {
      const res = await fetch("/api/meta-ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          history: mensagens.slice(-10),
        }),
      })
      const data = await res.json()
      setMensagens([...novas, { role: "assistant", content: data.response || "Não entendi. Pode reformular?" }])
    } catch {
      setMensagens([...novas, { role: "assistant", content: "Erro ao conectar. Tente novamente." }])
    } finally {
      setCarregando(false)
    }
  }

  function formatarTexto(texto: string) {
    return texto.split("\n").map((linha, i) => {
      if (linha.startsWith("•") || linha.startsWith("-")) {
        return <p key={i} className="pl-2 text-sm leading-relaxed">{linha}</p>
      }
      const bold = linha.replace(/\*(.*?)\*/g, (_, t) => `<strong>${t}</strong>`)
      return <p key={i} className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: bold }} />
    })
  }

  return (
    <>
      {aberto && (
        <div className="fixed inset-0 z-50 bg-black/20 md:bg-transparent md:pointer-events-none" onClick={() => setAberto(false)} />
      )}

      <div className={`fixed z-50 transition-all duration-300 ${aberto ? "bottom-0 right-0 w-full md:bottom-6 md:right-6 md:w-[420px]" : "bottom-4 right-4"}`}>
        {aberto ? (
          <div className="flex h-[90vh] flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl md:h-[600px] md:rounded-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-primary/10 to-primary/5 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-full bg-primary/15">
                  <Bot className="size-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Analista IA Meta Ads</p>
                  <p className="text-[11px] text-muted-foreground">Pergunte sobre seus anúncios</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="flex size-7 items-center justify-center rounded-full hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Messages */}
            <div ref={listaRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {mensagens.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
                    <Sparkles className="size-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Analista de Meta Ads</p>
                    <p className="mt-1 text-xs text-muted-foreground max-w-64">
                      Pergunte sobre o desempenho dos seus anúncios, leads, gastos e recomendações.
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {SUGESTOES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => enviar(s)}
                        className="rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {mensagens.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted/70 text-foreground rounded-bl-md"
                    }`}
                  >
                    {m.role === "assistant" ? formatarTexto(m.content) : <p className="text-sm">{m.content}</p>}
                  </div>
                </div>
              ))}

              {carregando && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-muted/70 px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="size-2 animate-bounce rounded-full bg-muted-foreground/40" style={{ animationDelay: "0ms" }} />
                      <span className="size-2 animate-bounce rounded-full bg-muted-foreground/40" style={{ animationDelay: "150ms" }} />
                      <span className="size-2 animate-bounce rounded-full bg-muted-foreground/40" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-border p-3">
              <form
                onSubmit={(e) => { e.preventDefault(); enviar(input) }}
                className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-1.5 focus-within:border-primary/50"
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Pergunte sobre os anúncios..."
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                  disabled={carregando}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || carregando}
                  className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-30"
                >
                  <Send className="size-4" />
                </button>
              </form>
              <p className="mt-1.5 text-[10px] text-muted-foreground/60 text-center">
                Respostas geradas por IA · Verifique dados importantes
              </p>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAberto(true)}
            className="flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg transition hover:opacity-90"
          >
            <MessageSquare className="size-4" />
            <span className="hidden sm:inline">Analista IA</span>
          </button>
        )}
      </div>
    </>
  )
}
