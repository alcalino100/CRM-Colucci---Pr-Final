"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input, Label, Select, useToast } from "@/components/ui/primitives"

type Canal = { id: string; nome: string; phone_number_id: string }
type Passo = { nome: string; ok: boolean; detalhe: string }

/** Painel de testes da API oficial: configuração, webhook, recebimento simulado, envio real e log de eventos. */
export function WhatsappOficialTestes({ canais }: { canais: Canal[] }) {
  const toast = useToast()
  const [canalId, setCanalId] = useState("")
  const [telefone, setTelefone] = useState("")
  const [texto, setTexto] = useState("")
  const [modelo, setModelo] = useState("hello_world")
  const [idioma, setIdioma] = useState("en_US")
  const [rodando, setRodando] = useState<string | null>(null)
  const [passos, setPassos] = useState<{ titulo: string; lista: Passo[] } | null>(null)

  useEffect(() => { if (!canalId && canais[0]) setCanalId(canais[0].id) }, [canais, canalId])


  async function rodar(acao: "config" | "webhook" | "receber" | "enviar" | "modelos", titulo: string, extra: Record<string, unknown> = {}) {
    setRodando(acao)
    try {
      const r = await fetch("/api/whatsapp/oficial/testes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao, canalId, telefone, texto, ...extra }) })
      const j = await r.json()
      if (j.passos) setPassos({ titulo, lista: j.passos })
      else toast(j.erro || "Falha no teste", "error")
    } catch (e) {
      toast(e instanceof Error ? e.message : "Falha no teste", "error")
    } finally {
      setRodando(null)
    }
  }

  const precisaNumero = !canalId || !telefone.replace(/\D/g, "")

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">Testes da integração</h3>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={!!rodando} onClick={() => rodar("config", "Configuração")}>{rodando === "config" ? "Testando…" : "Testar configuração"}</Button>
        <Button type="button" size="sm" variant="outline" disabled={!!rodando} onClick={() => rodar("webhook", "Webhook")}>{rodando === "webhook" ? "Testando…" : "Testar webhook"}</Button>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="t-canal">Número da API oficial</Label>
          <Select id="t-canal" value={canalId} onChange={(e) => setCanalId(e.target.value)}>
            {canais.length === 0 && <option value="">Cadastre um número primeiro</option>}
            {canais.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="t-tel">Telefone de teste (com DDI)</Label>
          <Input id="t-tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="5518999999999" inputMode="numeric" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="t-txt">Texto (opcional)</Label>
          <Input id="t-txt" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Mensagem do teste" />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Button type="button" size="sm" variant="outline" disabled={!!rodando || precisaNumero} onClick={() => rodar("receber", "Recebimento simulado")}>{rodando === "receber" ? "Simulando…" : "Simular mensagem recebida"}</Button>
        <Button type="button" size="sm" variant="outline" disabled={!!rodando || precisaNumero} onClick={() => rodar("enviar", "Envio de texto")}>{rodando === "enviar" ? "Enviando…" : "Enviar texto (janela 24h)"}</Button>
        <div className="flex items-end gap-1">
          <div className="flex flex-col gap-1"><Label htmlFor="t-mod">Modelo</Label><Input id="t-mod" value={modelo} onChange={(e) => setModelo(e.target.value)} className="h-8 w-40 text-xs" /></div>
          <div className="flex flex-col gap-1"><Label htmlFor="t-idi">Idioma</Label><Input id="t-idi" value={idioma} onChange={(e) => setIdioma(e.target.value)} className="h-8 w-24 text-xs" /></div>
          <Button type="button" size="sm" variant="outline" disabled={!!rodando || !canalId} onClick={() => rodar("modelos", "Modelos da conta")}>{rodando === "modelos" ? "Listando…" : "Listar modelos da conta"}</Button>
          <Button type="button" size="sm" disabled={!!rodando || precisaNumero || !modelo.trim()} onClick={() => rodar("enviar", "Envio de modelo", { modelo: modelo.trim(), idioma: idioma.trim() })}>Enviar modelo</Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        “Simular recebida” grava uma mensagem de teste no Inbox (não aciona IA nem assistente). “Enviar” manda de verdade pela Meta: em número de teste,
        o destino precisa estar na lista de destinatários permitidos do app. Fora da janela de 24h só funciona com modelo aprovado (o <b>hello_world</b> já vem pronto, em <b>en_US</b>; modelos próprios costumam ser <b>pt_BR</b>).
      </p>

      {passos && (
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="mb-2 text-sm font-semibold">Resultado: {passos.titulo}</p>
          <ul className="flex flex-col gap-1.5">
            {passos.lista.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                {p.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />}
                <span><b>{p.nome}</b> — <span className="text-muted-foreground">{p.detalhe}</span></span>
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  )
}
