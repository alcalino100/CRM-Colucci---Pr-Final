"use client"
import { useCallback, useEffect, useState } from "react"
import { RefreshCw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, useToast } from "@/components/ui/primitives"
import { chamar, type DadosOficial } from "./use-oficial"

type Modelo = { nome: string; idioma: string; status: string; categoria: string | null; corpo: string; variaveis: number }
const COR: Record<string, string> = { APPROVED: "green", PENDING: "gray", REJECTED: "red", PAUSED: "gray", DISABLED: "red" }
const ROTULO: Record<string, string> = { APPROVED: "Aprovado", PENDING: "Em análise", REJECTED: "Rejeitado", PAUSED: "Pausado", DISABLED: "Desativado" }

/** Modelos (templates) da conta WhatsApp Business: listar com status, criar e excluir. */
export function Modelos({ dados }: { dados: DadosOficial }) {
  const toast = useToast()
  const comWaba = dados.canais.filter((c) => c.waba_id)
  const [canalId, setCanalId] = useState("")
  const [modelos, setModelos] = useState<Modelo[]>([])
  const [erro, setErro] = useState("")
  const [carregando, setCarregando] = useState(false)
  const [f, setF] = useState({ nome: "", idioma: "pt_BR", categoria: "UTILITY", corpo: "", exemplos: [] as string[] })
  const [criando, setCriando] = useState(false)

  useEffect(() => { if (!canalId && comWaba[0]) setCanalId(comWaba[0].id) }, [comWaba, canalId])

  const carregar = useCallback(async () => {
    if (!canalId) return
    setCarregando(true); setErro("")
    const j = await chamar(`/api/whatsapp/oficial/modelos/gerenciar?canalId=${encodeURIComponent(canalId)}`, "GET")
    if (j.ok) setModelos(j.modelos ?? []); else { setModelos([]); setErro(j.erro || "Falha ao listar") }
    setCarregando(false)
  }, [canalId])
  useEffect(() => { void carregar() }, [carregar])

  const qtdVars = new Set(Array.from(f.corpo.matchAll(/\{\{(\d+)\}\}/g), (m) => m[1])).size
  const exemplos = Array.from({ length: qtdVars }, (_, i) => f.exemplos[i] ?? "")

  async function criar(e: React.FormEvent) {
    e.preventDefault(); setCriando(true)
    const j = await chamar("/api/whatsapp/oficial/modelos/gerenciar", "POST", { canalId, nome: f.nome, idioma: f.idioma, categoria: f.categoria, corpo: f.corpo, exemplos })
    setCriando(false)
    if (!j.ok) return toast(j.erro || "Falha ao criar o modelo", "error")
    toast(`Modelo enviado para aprovação (${j.status}).`); setF({ nome: "", idioma: "pt_BR", categoria: "UTILITY", corpo: "", exemplos: [] }); await carregar()
  }
  async function criarDeTeste() {
    setCriando(true)
    const j = await chamar("/api/whatsapp/oficial/modelos/gerenciar", "POST", { canalId, nome: "teste_crm", idioma: "pt_BR", categoria: "UTILITY", corpo: "Olá! Esta é uma mensagem de teste do CRM da Colucci Imóveis. Se você recebeu, está tudo certo.", exemplos: [] })
    setCriando(false)
    if (!j.ok) return toast(j.erro || "Falha ao criar o modelo de teste", "error")
    toast(`Modelo teste_crm enviado para aprovação (${j.status}). Quando ficar Aprovado, use-o na aba Testes (idioma pt_BR).`); await carregar()
  }
  async function excluir(m: Modelo) {
    if (!window.confirm(`Excluir o modelo "${m.nome}" (todas as traduções)?`)) return
    const j = await chamar(`/api/whatsapp/oficial/modelos/gerenciar?canalId=${encodeURIComponent(canalId)}&nome=${encodeURIComponent(m.nome)}`, "DELETE")
    toast(j.ok ? "Modelo excluído." : j.erro || "Falha ao excluir", j.ok ? undefined : "error")
    if (j.ok) await carregar()
  }

  if (comWaba.length === 0) {
    return <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Para gerenciar modelos, cadastre um número com o <b>WABA ID</b> na aba “Números”.</CardContent></Card>
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Modelos da conta</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={canalId} onChange={(e) => setCanalId(e.target.value)} className="h-8 text-xs" aria-label="Número">{comWaba.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</Select>
            <Button size="sm" variant="outline" onClick={carregar} disabled={carregando}><RefreshCw className={carregando ? "size-3.5 animate-spin" : "size-3.5"} /></Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {erro && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
          {!erro && !carregando && modelos.length === 0 && (
            <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border p-4">
              <p className="text-sm text-muted-foreground">Nenhum modelo nesta conta. Sem modelo aprovado não é possível iniciar conversas nem enviar o primeiro teste fora da janela de 24h.</p>
              <Button size="sm" onClick={criarDeTeste} disabled={criando}>{criando ? "Criando…" : "Criar modelo de teste (teste_crm)"}</Button>
            </div>
          )}
          {modelos.map((m) => (
            <div key={`${m.nome}|${m.idioma}`} className="flex flex-col gap-1 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-semibold">{m.nome}</span><Badge variant="gray">{m.idioma}</Badge><Badge variant={COR[m.status] ?? "gray"}>{ROTULO[m.status] ?? m.status}</Badge>{m.categoria && <Badge variant="gray">{m.categoria.toLowerCase()}</Badge>}</div>
                <Button size="sm" variant="outline" onClick={() => excluir(m)} aria-label={`Excluir ${m.nome}`}><Trash2 className="size-3.5 text-destructive" /></Button>
              </div>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{m.corpo || "(sem texto)"}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Criar modelo (vai para aprovação da Meta)</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={criar} className="flex flex-col gap-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="flex flex-col gap-1"><Label htmlFor="m-nome">Nome (minúsculas, números e _)</Label><Input id="m-nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} placeholder="lembrete_boleto" /></div>
              <div className="flex flex-col gap-1"><Label htmlFor="m-idi">Idioma</Label><Input id="m-idi" value={f.idioma} onChange={(e) => setF({ ...f, idioma: e.target.value })} /></div>
              <div className="flex flex-col gap-1"><Label htmlFor="m-cat">Categoria</Label><Select id="m-cat" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}><option value="UTILITY">Utilidade (cobrança, avisos)</option><option value="MARKETING">Marketing (campanhas)</option><option value="AUTHENTICATION">Autenticação</option></Select></div>
            </div>
            <div className="flex flex-col gap-1"><Label htmlFor="m-corpo">Texto (use {"{{1}}"}, {"{{2}}"} para variáveis)</Label><textarea id="m-corpo" rows={4} value={f.corpo} onChange={(e) => setF({ ...f, corpo: e.target.value })} className="rounded-lg border border-input bg-background px-3 py-2 text-sm" placeholder="Olá {{1}}, seu boleto de {{2}} vence em {{3}}." /></div>
            {exemplos.map((ex, i) => (
              <div key={i} className="flex flex-col gap-1"><Label htmlFor={`m-ex${i}`}>Exemplo para {`{{${i + 1}}}`} (exigido pela Meta)</Label><Input id={`m-ex${i}`} value={ex} onChange={(e) => setF({ ...f, exemplos: exemplos.map((x, j) => (j === i ? e.target.value : x)) })} /></div>
            ))}
            <div><Button type="submit" disabled={criando || !f.nome || !f.corpo.trim() || exemplos.some((x) => !x.trim())}>{criando ? "Enviando…" : "Enviar para aprovação"}</Button></div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
