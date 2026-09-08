"use client"
import { useEffect, useState } from "react"
import { useAIAgentsStore } from "@/lib/ai-agents-store"
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Textarea } from "@/components/ui/primitives"
import { Button } from "@/components/ui/button"
import { Bot, Zap, MessageCircle, Clock, Save, Eye, EyeOff, CheckCircle, AlertCircle, Pause, Play } from "lucide-react"
import { useToast } from "@/components/ui/primitives"

export function BotSettings({ id }: { id: string }){
  const agent = useAIAgentsStore(s=> s.agents.find(a=>a.id===id))
  const updateLocal = useAIAgentsStore(s=> s.updateAgent)
  const toast = useToast()
  const [local, setLocal] = useState(agent)
  const [saving, setSaving] = useState<string|null>(null)
  const [showToken, setShowToken] = useState(false)
  const [testResult, setTestResult] = useState<null|{ok:boolean; msg:string}>(null)
  const hasUnsavedToken = (local as any)?.apiToken !== (agent as any)?.apiToken

  useEffect(()=>{ setLocal(agent) }, [agent?.id])

  if(!agent || !local) return null

  const save = async (section: string, patch: any)=>{
    setSaving(section)
    try{
      const r = await fetch(`/api/ai/${id}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body: JSON.stringify(patch)})
      const j = await r.json()
      if(!r.ok) throw new Error(j.error || "falha ao salvar")
      updateLocal(id, patch)
      toast(`Seção ${section} salva com sucesso`)
    }catch(e:any){
      toast(e.message || "Erro ao salvar", "error")
    }finally{ setSaving(null) }
  }

  const testarConexao = async()=>{
    setTestResult(null)
    const token = (local as any).apiToken || ""
    const endpoint = (local as any).apiEndpoint || "https://api.openai.com/v1"
    const model = (local as any).modelName || "gpt-4o-mini"
    if(!token){
      // tenta com GEMINI do servidor
      setTestResult({ok:true, msg:"Sem token local, usará GEMINI_API_KEY do servidor (ok para teste)"})
      return
    }
    try{
      const r = await fetch("/api/ai/test-connection", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ apiToken: token, apiEndpoint: endpoint, modelName: model }) })
      const j = await r.json()
      if(r.ok) setTestResult({ok:true, msg:`Conexão ok: ${j.model || model} respondeu`})
      else setTestResult({ok:false, msg: j.error || "Falha na conexão"})
    }catch(e:any){
      setTestResult({ok:false, msg: e.message})
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600"><Bot className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-bold">Identidade do Agente</h3>
          <p className="text-xs text-muted-foreground">Defina quem é sua IA. Clique em Salvar em cada seção — nada é auto-salvo.</p>
        </div>
        {local.isActive ? (
          <button
            onClick={async ()=>{ await save("status", { isActive: false }) }}
            disabled={saving!=null}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
          >
            <Pause className="size-4" /> {saving==="status" ? "Pausando..." : "Pausar IA"}
          </button>
        ) : (
          <button
            onClick={async ()=>{ await save("status", { isActive: true }) }}
            disabled={saving!=null}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
          >
            <Play className="size-4" /> {saving==="status" ? "Ativando..." : "Ativar IA"}
          </button>
        )}
      </div>

      <Card className="border-cyan-500/20">
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Bot className="size-4" /> Perfil</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5"><Label>Nome da IA *</Label><Input value={local.name} onChange={e=>setLocal({...local, name:e.target.value})} placeholder="Ex: Patrícia - Reativação" className="font-medium" /></div>
          <div className="grid gap-1.5"><Label>Descrição curta</Label><Textarea rows={2} value={local.description||""} onChange={e=>setLocal({...local, description:e.target.value})} placeholder="Ex: IA para reativar base fria de Tráfego Pago via WhatsApp" /></div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="grid gap-1.5"><Label>Template</Label><Select value={local.botTemplate} onChange={e=>setLocal({...local, botTemplate:e.target.value as any})}><option value="vendas">Vendas</option><option value="locacao">Locação</option><option value="suporte">Suporte</option></Select></div>
            <div className="grid gap-1.5"><Label>Modo de resposta</Label><Select value={local.responseMode} onChange={e=>setLocal({...local, responseMode:e.target.value as any})}><option value="auto">Automático (responde sozinha)</option><option value="sugestao">Sugestão (humano aprova)</option></Select></div>
            <div className="grid gap-1.5"><Label>Status</Label><label className="flex h-10 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm"><input type="checkbox" checked={local.isActive} onChange={e=>setLocal({...local, isActive:e.target.checked})} className="rounded text-cyan-500" /> <span className={local.isActive?"text-emerald-600 font-medium":"text-muted-foreground"}>{local.isActive?"Ativa - respondendo":"Pausada"}</span></label></div>
          </div>
          <div className="flex justify-end"><Button onClick={()=>save("Perfil", {name: local.name, description: local.description, botTemplate: local.botTemplate, responseMode: local.responseMode, isActive: local.isActive})} disabled={saving==="Perfil"} className="gap-2"><Save className="size-4" /> {saving==="Perfil"?"Salvando...":"Salvar Perfil"}</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><MessageCircle className="size-4" /> Canais & Comportamento</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="grid gap-1.5"><Label className="flex items-center gap-1.5"><Clock className="size-3" /> Espera antes de responder (ms)</Label><Input type="number" value={local.waitTimeMs} onChange={e=>setLocal({...local, waitTimeMs: parseInt(e.target.value)||0})} /></div>
            <div className="grid gap-1.5"><Label>Limite de mensagens por conversa</Label><Input type="number" value={local.messageCap} onChange={e=>setLocal({...local, messageCap: parseInt(e.target.value)||0})} /></div>
            <div className="grid gap-1.5"><Label>Instância WhatsApp vinculada *</Label><Select value={(local as any).testInstance || "patricia-6c2875b4"} onChange={e=>setLocal({...local, testInstance:e.target.value, apiEndpoint: e.target.value} as any)}>
                <option value="patricia-6c2875b4">Patrícia — patricia-6c2875b4 (5518991976332)</option>
                <option value="guilherme-garcia-c044c57d">Guilherme — guilherme-garcia-c044c57d</option>
                <option value="brayon-22b51e92">Brayon — brayon-22b51e92</option>
                <option value="gabriel-a8b53f96">Gabriel — gabriel-a8b53f96</option>
                <option value="joao-5e48be89">João — joao-5e48be89</option>
                <option value="aline-2f15d86a">Aline — aline-2f15d86a</option>
                <option value="daline-fba44ec9">Daline — daline-fba44ec9</option>
                <option value="abraao-d2c80ddf">Abraão — abraao-d2c80ddf</option>
                <option value="levi-284b8246">Levi — levi-284b8246</option>
              </Select><p className="text-xs text-muted-foreground">IA só responde nesta instância. Para testar com sua namorada (+5518981729340) selecione `Guilherme` e salve.</p></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["whatsapp","instagram","site"] as const).map(ch=>(
              <label key={ch} className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs">
                <input type="checkbox" checked={local.channels.includes(ch)} onChange={e=>{
                  const next = e.target.checked ? [...local.channels, ch] : local.channels.filter(c=>c!==ch)
                  setLocal({...local, channels: next as any})
                }} /> {ch}
              </label>
            ))}
          </div>
          <div className="flex justify-end"><Button onClick={()=>save("Canais", {waitTimeMs: local.waitTimeMs, messageCap: local.messageCap, testInstance: (local as any).testInstance, channels: local.channels})} disabled={saving==="Canais"} className="gap-2"><Save className="size-4" /> Salvar Canais</Button></div>
        </CardContent>
      </Card>

      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Zap className="size-4 text-amber-500" /> API da IA (para teste real)</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1.5"><Label>Provedor</Label><Select value={
            (local as any).modelName?.includes("gemini") ? "gemini" : (local as any).modelName?.includes("claude") ? "claude" : "openai"
          } onChange={e=>{
            const prov = e.target.value
            if(prov==="gemini") setLocal({...local, modelName:"gemini-2.5-flash", apiEndpoint:"https://generativelanguage.googleapis.com"} as any)
            else if(prov==="claude") setLocal({...local, modelName:"claude-sonnet-5", apiEndpoint:"https://api.anthropic.com"} as any)
            else setLocal({...local, modelName:"gpt-4o-mini", apiEndpoint:"https://api.openai.com/v1"} as any)
          }}><option value="openai">OpenAI</option><option value="gemini">Gemini (sua atual)</option><option value="claude">Claude (Anthropic)</option></Select></div>
          <div className="grid gap-1.5"><Label>Modelo</Label><Select value={(local as any).modelName || "gemini-1.5-flash"} onChange={e=>setLocal({...local, modelName:e.target.value} as any)}>
            {((local as any).modelName||"").includes("gemini") ? <>
              <option value="gemini-2.5-flash">gemini-2.5-flash (recomendado)</option>
              <option value="gemini-1.5-flash">gemini-1.5-flash</option>
              <option value="gemini-1.5-pro">gemini-1.5-pro</option>
            </> : (local as any).modelName?.includes("claude") ? <>
              <option value="claude-sonnet-5">claude-sonnet-5 (recomendado)</option>
              <option value="claude-haiku-4-5">claude-haiku-4-5 (rápido)</option>
              <option value="claude-opus-5">claude-opus-5</option>
              <option value="claude-fable-5-1">claude-fable-5-1</option>
            </> : <>
              <option value="gpt-4o-mini">gpt-4o-mini</option>
              <option value="gpt-4o">gpt-4o</option>
              <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
            </>}
          </Select>
            <p className="text-xs text-muted-foreground">Modelos atuais: Gemini 2.5 / Claude Sonnet 5 - use os recomendados.</p>
          </div>
          <div className="grid gap-1.5"><Label>API Endpoint (auto)</Label><Input value={(local as any).apiEndpoint || ""} onChange={e=>setLocal({...local, apiEndpoint:e.target.value} as any)} placeholder="auto preenchido ao trocar provedor" /></div>
          <div className="grid gap-1.5">
            <Label className="flex items-center gap-2">API Token / Chave * { (agent as any)?.apiToken ? <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700">● Salvo</span> : <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700">○ Não salvo</span>} {hasUnsavedToken && <span className="text-xs text-amber-600">· alterações não salvas</span>}</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input type={showToken ? "text" : "password"} value={(local as any).apiToken || ""} onChange={e=>setLocal({...local, apiToken:e.target.value} as any)} placeholder="sk-... ou GEMINI_API_KEY" className="pr-10" />
                <button type="button" onClick={()=>setShowToken(v=>!v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <Button variant="outline" onClick={testarConexao}>Testar Conexão</Button>
            </div>
            <p className="text-xs text-muted-foreground">Criptografado com AES-256 antes de salvar. Deixe vazio para usar GEMINI_API_KEY do servidor. { (agent as any)?.apiToken ? `Salvo como: ${(agent as any).apiToken.slice(0,8)}...${(agent as any).apiToken.slice(-4)}` : "Nenhum token salvo ainda."}</p>
            {testResult && <div className={`flex items-center gap-2 rounded-lg border p-2 text-xs ${testResult.ok?"border-emerald-500/20 bg-emerald-500/10 text-emerald-700":"border-red-500/20 bg-red-500/10 text-red-700"}`}>{testResult.ok ? <CheckCircle className="size-4" /> : <AlertCircle className="size-4" />} {testResult.msg}</div>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={testarConexao}>Validar Conexão</Button>
            <Button onClick={()=>save("API", {apiToken: (local as any).apiToken, apiEndpoint: (local as any).apiEndpoint, modelName: (local as any).modelName})} disabled={saving==="API"} className="gap-2"><Save className="size-4" /> Salvar API</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
