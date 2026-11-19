"use client"

import { useEffect, useRef, useState } from "react"
import { Bot, RotateCcw, Send, ServerOff, ShieldCheck, Sparkles, User } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, Badge, Select } from "@/components/ui/primitives"
import { Button } from "@/components/ui/button"
import { estadoInicial, ROTULO_DEPARTAMENTO, ROTULO_INTENCAO, type Estado, type Evento } from "@/lib/assistente"

type Msg = { de: "cliente" | "assistente"; texto: string }

const PERSONAS = [
  { telefone: "5511999990001", rotulo: "Mariana Souza (inquilina) · CPF final 8901" },
  { telefone: "5511999990002", rotulo: "Roberto Almeida (proprietário) · CPF final 2100" },
  { telefone: "5511999990003", rotulo: "Fernanda Lima (contrato vencendo) · CPF final 3344" },
  { telefone: "5511900000000", rotulo: "Número não cadastrado" },
]

const SUGESTOES = ["Oi", "Preciso da segunda via do boleto", "Qual o reajuste do meu aluguel?", "Quero o informe de rendimentos", "Quando vence meu contrato?", "Tem um vazamento na pia", "Quero falar com um atendente"]

const ETAPA_ROTULO: Record<Estado["etapa"], string> = {
  inicio: "Início",
  aguardando_confirmacao: "Aguardando confirmação de identidade",
  identificado: "Cliente identificado",
  transferido: "Transferido para a equipe",
}

function descreverEvento(e: Evento): string {
  switch (e.tipo) {
    case "intencao": return `Intenção: ${ROTULO_INTENCAO[e.intencao]}`
    case "ferramenta": return `Ferramenta ${e.nome} ${e.ok ? "✓" : "✗"}`
    case "identidade": return `Identidade: ${e.resultado.replace(/_/g, " ")}`
    case "escalada": return `Escalada → ${ROTULO_DEPARTAMENTO[e.departamento]} (${e.motivo.replace(/_/g, " ")})`
    case "resolvido_automaticamente": return "Resolvido pela IA"
    case "ia": return `Claude (${e.funcao}) ${e.ok ? "✓" : "indisponível, usei o padrão"}`
  }
}

export function Simulador() {
  const [telefone, setTelefone] = useState(PERSONAS[0].telefone)
  const [indisponivel, setIndisponivel] = useState(false)
  const [usarIa, setUsarIa] = useState(false)
  const [avisoIa, setAvisoIa] = useState(false)
  const [estado, setEstado] = useState<Estado>(estadoInicial())
  const [mensagens, setMensagens] = useState<Msg[]>([])
  const [eventos, setEventos] = useState<Evento[]>([])
  const [texto, setTexto] = useState("")
  const [enviando, setEnviando] = useState(false)
  const fim = useRef<HTMLDivElement>(null)

  useEffect(() => { fim.current?.scrollIntoView({ behavior: "smooth" }) }, [mensagens])

  function reiniciar(novoTelefone = telefone) {
    setTelefone(novoTelefone)
    setEstado(estadoInicial())
    setMensagens([])
    setEventos([])
  }

  async function enviar(t: string) {
    const msg = t.trim()
    if (!msg || enviando) return
    setTexto("")
    setMensagens((m) => [...m, { de: "cliente", texto: msg }])
    setEnviando(true)
    try {
      const res = await fetch("/api/assistente/simular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: msg, telefone, indisponivel, usarIa, estado }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.erro || "erro")
      setEstado(json.estado)
      setAvisoIa(!!json.iaPedidaSemChave)
      setEventos((ev) => [...ev, ...json.eventos])
      setMensagens((m) => [...m, ...json.respostas.map((r: string) => ({ de: "assistente" as const, texto: r }))])
    } catch {
      setMensagens((m) => [...m, { de: "assistente", texto: "Erro ao falar com o simulador. Tente novamente." }])
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card className="flex h-[36rem] flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-emerald-600 px-4 py-3 text-white">
          <Bot className="size-5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Assistente Colucci</p>
            <p className="text-xs text-emerald-50">simulação · dados fictícios</p>
          </div>
          <Button size="sm" variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10" onClick={() => reiniciar()}>
            <RotateCcw className="size-3.5" /> Reiniciar
          </Button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto bg-muted/40 p-4">
          {mensagens.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">Envie uma mensagem ou escolha uma sugestão abaixo para testar o atendimento.</p>
          )}
          {mensagens.map((m, i) => (
            <div key={i} className={m.de === "cliente" ? "flex justify-end" : "flex justify-start"}>
              <div className={`max-w-[85%] whitespace-pre-line break-words rounded-2xl px-3 py-2 text-sm shadow-sm ${m.de === "cliente" ? "rounded-br-sm bg-emerald-100 text-emerald-950" : "rounded-bl-sm border border-border bg-card"}`}>
                {m.texto}
              </div>
            </div>
          ))}
          {enviando && <p className="text-xs text-muted-foreground">digitando…</p>}
          <div ref={fim} />
        </div>

        <div className="space-y-2 border-t border-border p-3">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {SUGESTOES.map((s) => (
              <button key={s} type="button" onClick={() => enviar(s)} disabled={enviando || estado.etapa === "transferido"} className="shrink-0 rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground disabled:opacity-50">
                {s}
              </button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); enviar(texto) }} className="flex gap-2">
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Digite como o cliente digitaria…" maxLength={1000} className="h-10 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
            <Button type="submit" disabled={enviando || !texto.trim()}><Send className="size-4" /><span className="sr-only">Enviar</span></Button>
          </form>
        </div>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><User className="size-4" /> Quem está falando</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Select value={telefone} onChange={(e) => reiniciar(e.target.value)} aria-label="Perfil do cliente simulado">
              {PERSONAS.map((p) => <option key={p.telefone} value={p.telefone}>{p.rotulo}</option>)}
            </Select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={indisponivel} onChange={(e) => setIndisponivel(e.target.checked)} className="size-4" />
              <ServerOff className="size-4 text-muted-foreground" /> Simular Immobillis fora do ar
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={usarIa} onChange={(e) => setUsarIa(e.target.checked)} className="size-4" />
              <Sparkles className="size-4 text-muted-foreground" /> Usar IA (Claude)
            </label>
            {avisoIa && <p className="text-xs text-amber-700">Nenhuma chave Claude encontrada no servidor: respondendo sem IA.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><ShieldCheck className="size-4" /> Estado da conversa</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <p><span className="text-muted-foreground">Etapa:</span> {ETAPA_ROTULO[estado.etapa]}</p>
            <p><span className="text-muted-foreground">Cliente:</span> {estado.cliente?.nome ?? "—"}</p>
            <p><span className="text-muted-foreground">Protocolo:</span> {estado.protocolo ?? "—"}</p>
            {estado.departamento && <Badge variant="amber">{ROTULO_DEPARTAMENTO[estado.departamento]}</Badge>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Raio-X das decisões</CardTitle></CardHeader>
          <CardContent>
            {eventos.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum evento ainda.</p> : (
              <ul className="max-h-56 space-y-1 overflow-y-auto text-xs">
                {eventos.map((e, i) => <li key={i} className="rounded-md bg-muted px-2 py-1">{descreverEvento(e)}</li>)}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
