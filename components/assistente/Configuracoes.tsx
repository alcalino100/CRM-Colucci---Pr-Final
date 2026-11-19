"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Plug, Save, ShieldCheck, Sparkles } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, Badge, Input, Label, Select } from "@/components/ui/primitives"
import { Button } from "@/components/ui/button"
import { CAPACIDADES, MAX_NAO_ENTENDIDAS, MAX_TENTATIVAS_IDENTIDADE, type ConfigAssistente } from "@/lib/assistente"
import { FonteBadge } from "./FonteBadge"
import { useApi } from "./use-api"

type Resp = { fonte: string; config: ConfigAssistente; provedor: string; iaDisponivel: boolean; iaOrigem: string | null; instancias: string[]; agentesClaude: { id: string; nome: string }[] }

export function Configuracoes() {
  const { dados, erro, recarregar } = useApi<Resp>("/api/assistente/config")
  const [cfg, setCfg] = useState<ConfigAssistente | null>(null)
  const [testes, setTestes] = useState("")
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { if (dados) { setCfg(dados.config); setTestes(dados.config.numerosTeste.join("\n")) } }, [dados])

  async function salvar() {
    if (!cfg) return
    setSalvando(true); setMsg(null)
    try {
      const r = await fetch("/api/assistente/config", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...cfg, numerosTeste: testes.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean), aiAgentId: cfg.aiAgentId ?? "" }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.erro || "Falha ao salvar")
      setMsg({ tipo: "ok", texto: "Configuração salva." })
      recarregar()
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "Falha ao salvar" })
    } finally { setSalvando(false) }
  }

  if (erro) return <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</p>
  if (!cfg || !dados) return <p className="py-10 text-center text-muted-foreground">Carregando…</p>
  const simulado = dados.provedor === "simulado"
  const semBanco = dados.fonte !== "banco"

  return (
    <div className="space-y-4">
      {semBanco && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>As tabelas do assistente ainda não existem no banco, então não é possível salvar. Aplique a migration <code>20261119120000_assistente_virtual.sql</code> no Supabase (SQL Editor).</span>
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex flex-wrap items-center gap-2">Atendimento no WhatsApp <FonteBadge fonte={dados.fonte} /></CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border p-3">
                <span><span className="block text-sm font-medium">Assistente ligado</span><span className="block text-xs text-muted-foreground">Desligado por padrão. Desligado, nenhuma conversa é atendida por ele.</span></span>
                <input type="checkbox" className="size-5" checked={cfg.ativo} onChange={(e) => setCfg({ ...cfg, ativo: e.target.checked })} />
              </label>

              <div>
                <Label>Números de teste (um por linha)</Label>
                <textarea value={testes} onChange={(e) => setTestes(e.target.value)} rows={3} placeholder="5511999990001" className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
                <p className="mt-1 text-xs text-muted-foreground">Estes números sempre são atendidos, em qualquer instância. Comece por aqui.</p>
              </div>

              <div>
                <Label>Instâncias de WhatsApp atendidas</Label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {dados.instancias.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma instância encontrada.</p>}
                  {dados.instancias.map((i) => {
                    const on = cfg.instancias.includes(i)
                    return <button key={i} type="button" onClick={() => setCfg({ ...cfg, instancias: on ? cfg.instancias.filter((x) => x !== i) : [...cfg.instancias, i] })} className={`rounded-full border px-3 py-1 text-xs ${on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>{i}</button>
                  })}
                </div>
                {simulado && <p className="mt-2 text-xs text-amber-700">Com o Immobillis simulado, mesmo nas instâncias marcadas só os números de teste são atendidos: cliente real nunca recebe dado fictício.</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle>O que o assistente pode fazer</CardTitle><p className="text-xs text-muted-foreground">Somente leitura: ele nunca altera dados no Immobillis. O que estiver desligado vai direto para a equipe.</p></CardHeader>
            <CardContent className="space-y-2">
              {CAPACIDADES.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
                  <input type="checkbox" className="mt-1 size-4" checked={cfg.capacidades[c.id]} onChange={(e) => setCfg({ ...cfg, capacidades: { ...cfg.capacidades, [c.id]: e.target.checked } })} />
                  <span><span className="block text-sm font-medium">{c.rotulo}</span><span className="block text-xs text-muted-foreground">{c.desc}</span></span>
                </label>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><Sparkles className="size-4" /> Inteligência artificial (Claude)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">As decisões (identidade, dados, encaminhamento) são sempre por regras. A IA só deixa o texto mais natural e entende frases que as regras não pegam. Valores, datas, links e protocolos são conferidos e, se algo mudar, vale o texto original.</p>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border p-3">
                <span className="text-sm font-medium">Usar IA nas respostas</span>
                <input type="checkbox" className="size-5" checked={cfg.usarIa} onChange={(e) => setCfg({ ...cfg, usarIa: e.target.checked })} />
              </label>
              <div>
                <Label>Reaproveitar a chave de um agente da IA Conversacional</Label>
                <Select value={cfg.aiAgentId ?? ""} onChange={(e) => setCfg({ ...cfg, aiAgentId: e.target.value || undefined })}>
                  <option value="">Usar a chave do servidor (CLAUDE_API_KEY)</option>
                  {dados.agentesClaude.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </Select>
              </div>
              <p className="text-xs">{dados.iaDisponivel ? <Badge variant="green">chave Claude encontrada ({dados.iaOrigem === "agente" ? "do agente" : "do servidor"})</Badge> : <Badge variant="amber">nenhuma chave Claude encontrada: segue sem IA</Badge>}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex flex-wrap items-center gap-2"><Plug className="size-4" /> Integração Immobillis {simulado ? <Badge variant="amber">simulada</Badge> : <Badge variant="green">conectada</Badge>}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">A conexão real será habilitada quando a documentação da API estiver disponível. A chave de acesso ficará no servidor, nunca no navegador.</p>
              <div><Label>URL da API</Label><Input disabled placeholder="https://…" /></div>
              <div><Label>Chave de acesso</Label><Input disabled type="password" placeholder="Definida no servidor" /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4" /> Segurança e escalada</CardTitle></CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <p>• Dados financeiros só após confirmar os 4 últimos dígitos do CPF/CNPJ.</p>
              <p>• Até <strong>{MAX_TENTATIVAS_IDENTIDADE}</strong> tentativas, depois a conversa vai para a equipe.</p>
              <p>• Após <strong>{MAX_NAO_ENTENDIDAS}</strong> mensagens não entendidas, o assistente transfere.</p>
              <p>• Número não cadastrado nunca recebe dados.</p>
              <p>• Se alguém da equipe responder no WhatsApp, o assistente para de responder naquela conversa.</p>
              <p>• Cada escalada avisa o gestor por WhatsApp com o protocolo.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={salvar} disabled={salvando || semBanco}><Save className="size-4" /> {salvando ? "Salvando…" : "Salvar configuração"}</Button>
        {msg && <span className={`text-sm ${msg.tipo === "ok" ? "text-emerald-700" : "text-red-700"}`}>{msg.texto}</span>}
      </div>
    </div>
  )
}
