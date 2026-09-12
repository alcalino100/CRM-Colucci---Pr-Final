"use client"
import { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives"
import { Badge } from "@/components/ui/primitives"
import { ShieldCheck, Coins, Clock } from "lucide-react"

export function ApiAudit({ id }: { id: string }){
  const [logs, setLogs] = useState<any[]>([])
  const [total, setTotal] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [modoTotal, setModoTotal] = useState(true)
  const fallbackJaRodou = useRef(false)

  useEffect(()=>{
    const url = modoTotal ? `/api/ai/${id}/audit?total=1` : `/api/ai/${id}/audit`
    fetch(url).then(r=>r.json()).then(j=>{
      if(modoTotal && j.conversations){
        setTotal(j)
        const all = [...(j.messages||[]), ...(j.whatsapp||[])].sort((a:any,b:any)=> new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        setLogs(all)
      } else if(Array.isArray(j)) setLogs(j)
      else if(Array.isArray(j.logs)) setLogs(j.logs)
    }).catch(()=>{}).finally(()=>setLoading(false))
  },[id, modoTotal])

  // Fallback (uma única vez): busca conversas e mensagens para estimar tokens se audit não existir
  useEffect(()=>{
    if(logs.length>0 || !loading || fallbackJaRodou.current) return
    fallbackJaRodou.current = true
    fetch(`/api/conversations?aiId=${id}`).then(r=>r.json()).then(async (convs:any[])=>{
      if(!Array.isArray(convs) || convs.length===0) return
      const all:any[] = []
      for(const c of convs.slice(0,5)){
        const r = await fetch(`/api/conversations/${c.id}/messages`).then(x=>x.json()).catch(()=>null)
        const msgs = r?.messages || []
        if(Array.isArray(msgs)) all.push(...msgs.map((m:any)=> ({ ...m, conversation_id: c.id })))
      }
      // transforma em logs
      const mapped = all.map((m:any)=> ({
        id: m.id,
        role: m.role,
        content: m.content?.slice(0,80),
        tokens: m.metadata?.tokensUsed || 0,
        created_at: m.created_at,
        model: m.metadata?.model || "-"
      }))
      if(mapped.length) setLogs(mapped)
    }).catch(()=>{})
  },[logs.length, loading, id])

  const totalTokens = logs.reduce((a,b)=> a + (b.tokens||0), 0)
  const avgTokens = logs.length ? Math.round(totalTokens / logs.length) : 0
  // Histórico exibe SOMENTE o que envolve a IA (messages_ia: user/ia/assistant).
  // Linhas puras do WhatsApp ("lead (WA)"/"você (WA)") ficam de fora — o contador
  // "Msgs WhatsApp" acima continua mostrando o volume total como contexto.
  const soIA = (l: any) => {
    const r = String(l?.role || "")
    if (r.includes("+ IA")) return true
    return !r.includes("(WA)")
  }
  const logsIA = logs.filter(soIA)

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900"><ShieldCheck className="size-5" /></div>
          <div><h3 className="font-display text-base font-bold">Auditoria da API</h3><p className="text-xs text-muted-foreground">Veja o que a IA está fazendo, tokens gastos e custo estimado</p></div>
        </div>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={modoTotal} onChange={e=>setModoTotal(e.target.checked)} /> Auditoria total (WA + IA)</label>
      </div>
      {modoTotal && total && (
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg border border-border bg-card p-2"><p className="text-lg font-bold">{total.conversations?.length||0}</p><p className="text-muted-foreground">Conversas IA</p></div>
          <div className="rounded-lg border border-border bg-card p-2"><p className="text-lg font-bold">{total.whatsapp?.length||0}</p><p className="text-muted-foreground">Msgs WhatsApp</p></div>
          <div className="rounded-lg border border-border bg-card p-2"><p className="text-lg font-bold">{logsIA.length}</p><p className="text-muted-foreground">Total logs (IA)</p></div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 text-center"><p className="flex items-center justify-center gap-1 text-2xl font-bold"><Coins className="size-5" /> {totalTokens}</p><p className="text-xs text-muted-foreground">Tokens totais</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{avgTokens}</p><p className="text-xs text-muted-foreground">Média por resposta</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{logs.length}</p><p className="text-xs text-muted-foreground">Chamadas</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Clock className="size-4" /> Histórico de Chamadas da IA</CardTitle></CardHeader>
        <CardContent>
          {loading ? <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p> : logsIA.length===0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma chamada da IA ainda. Faça um teste em Testing.</p> : (
            <div className="max-h-[400px] overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted"><tr><th className="px-2 py-1.5 text-left">Quando</th><th className="px-2 py-1.5 text-left">Role</th><th className="px-2 py-1.5 text-left">Conteúdo</th><th className="px-2 py-1.5 text-right">Tokens</th></tr></thead>
                <tbody>
                  {logsIA.slice(0,50).map((l:any)=>(
                    <tr key={l.id} className="border-t border-border/50">
                      <td className="px-2 py-1.5 font-mono text-[11px]">{new Date(l.created_at).toLocaleString("pt-BR")}</td>
                      <td className="px-2 py-1.5"><Badge variant={l.role==="ai"?"default":"outline"}>{l.role}</Badge></td>
                      <td className="px-2 py-1.5 max-w-[300px] truncate">{l.content}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{l.tokens || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">Estimativa: ~$0.01 a cada 1k tokens (gpt-4o-mini). Para Gemini, custo similar. Use para ajustar `systemPrompt` e `Knowledge Base` e economizar.</p>
        </CardContent>
      </Card>
    </div>
  )
}
