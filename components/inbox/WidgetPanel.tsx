"use client"
import { useEffect, useState } from "react"
import { useInboxStore } from "@/lib/inbox-store"
import { useAuth } from "@/lib/auth-context"
import { useToast, Select } from "@/components/ui/primitives"
import { normalizePhone, LEAD_STATUSES, STATUS_LABEL, MOTIVOS_EXCLUSAO } from "@/lib/labels"
import { tagColor } from "@/lib/ai/tags-catalog"
import type { LeadStatus } from "@/lib/mock-data"

type TagItem = { name: string; color: string; emUso?: number; responderIA?: boolean; followUp?: boolean }

export function WidgetPanel(){
  const { conversas, selectedId, criarFollowUp, cancelarFollowUp } = useInboxStore()
  const { user } = useAuth()
  const toast = useToast()
  const [salvandoTags, setSalvandoTags] = useState(false)
  const [tagInput, setTagInput] = useState("")
  const [tagsExistentes, setTagsExistentes] = useState<TagItem[]>([])
  const [modalVincular, setModalVincular] = useState(false)
  const [modalDesvincular, setModalDesvincular] = useState(false)
  const [modalExcluir, setModalExcluir] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [desvinculando, setDesvinculando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [salvandoStatus, setSalvandoStatus] = useState(false)
  const [motivoExcluir, setMotivoExcluir] = useState(MOTIVOS_EXCLUSAO[0])
  const [detalheExcluir, setDetalheExcluir] = useState("")
  const [acaoIniciando, setAcaoIniciando] = useState<string | null>(null)
  const conv = conversas.find(c=>c.id===selectedId) || null

  useEffect(() => {
    fetch("/api/tags")
      .then(r => r.json())
      .then(j => { if (j.ok && Array.isArray(j.tags)) setTagsExistentes(j.tags) })
      .catch(() => {})
  }, [])

  if(!conv){
    const statusPeso: Record<string,number> = { aguardando_resposta:0, em_follow_up:1, respondido:2 }
    const prioritarios = [...conversas].sort((a,b)=>{
      const pa=(statusPeso[a.status]??9)*100000 + (a.unread? -10000:0)
      const pb=(statusPeso[b.status]??9)*100000 + (b.unread? -10000:0)
      if(pa!==pb) return pa-pb
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    }).slice(0,3)
    return (
      <div className="hidden w-[240px] shrink-0 flex-col gap-3 lg:flex">
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Selecione uma conversa</div>
        {prioritarios.length>0 && (
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3">
            <h4 className="mb-2 text-xs font-bold text-cyan-700 dark:text-cyan-300">🤖 IA — atender primeiro</h4>
            <div className="flex flex-col gap-1.5">
              {prioritarios.map(p=>(
                <div key={p.id} className="rounded-lg bg-white px-2 py-1.5 text-xs dark:bg-slate-800">
                  <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{p.leadName}</p>
                  <p className="text-[11px] text-slate-500">{p.status.replace("_"," ")} · {p.origem} · {new Date(p.timestamp).toLocaleDateString("pt-BR")}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-400">Ordenado por funil + recência + histórico</p>
          </div>
        )}
      </div>
    )
  }
  const iaLigada = conv.iaRespondendo !== undefined ? conv.iaRespondendo : conv.followUpAtivo
  const tags = conv.tags || []
  const leadId = (conv as any).leadId
  const leadStatus = (conv as any).leadStatus as string | undefined
  const temLead = !!leadId
  const proxima = conv.proximaTentativaISO ? new Date(conv.proximaTentativaISO).toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit"}) : "-"

  async function toggleIA(){
    try{
      const r = await fetch("/api/whatsapp/chat/ia-pause",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ telefone: conv.telefone, pausado: iaLigada })})
      const j = await r.json()
      if(!j.ok) throw new Error(j.erro || "falha")
      if(iaLigada) cancelarFollowUp(conv.id); else criarFollowUp(conv.id)
      toast(iaLigada ? "Atendimento IA pausado" : "IA ativada para esta conversa")
    }catch(e:any){
      toast(e.message || "Erro ao alterar IA","error")
    }
  }

  async function salvarTags(t: string[]){
    if(!leadId) { toast("Sem lead vinculado — associe a um lead para salvar tags","error"); return }
    setSalvandoTags(true)
    try{
      const r = await fetch(`/api/leads/${encodeURIComponent(leadId)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({ tags: t })})
      const j = await r.json()
      if(!j.ok) throw new Error(j.erro || "falha")
      useInboxStore.getState().setConversaTags(conv.id, t)
      toast("Tags salvas")
    }catch(e:any){
      toast(e.message || "Erro ao salvar tags","error")
    }finally{ setSalvandoTags(false) }
  }

  function toggleTag(t: string){
    const next = tags.includes(t) ? tags.filter(x=>x!==t) : [...tags, t]
    salvarTags(next)
  }

  async function addCustomTag(){
    const t = tagInput.trim().toLowerCase()
    if(!t || tags.includes(t)) { setTagInput(""); return }
    if(!leadId) { toast("Vincule um lead para salvar tags","error"); return }
    salvarTags([...tags, t])
    setTagsExistentes((prev) => prev.some(x=>x.name===t) ? prev : [...prev, { name: t, color: tagColor(t) }])
    setTagInput("")
  }

  async function vincularLead(criarNovo: boolean){
    setBuscando(true)
    try{
      const rPhone = normalizePhone(conv.telefone)
      let lid = leadId
      let leadTags: string[] = tags
      if(!lid){
        // busca lead existente por telefone
        const busca = await fetch(`/api/leads?search=${encodeURIComponent(rPhone)}`).then(r=>r.json())
        const existente = busca?.leads?.find((l:any)=> normalizePhone(String(l.telefone||"")) === rPhone)
        if(existente){
          lid = existente.id
          leadTags = ((existente.referencias||[]) as any[]).map((x:any)=> typeof x === "string" ? x : x?.ref ?? "").filter(Boolean)
        }
        else if(criarNovo){
          const criado = await fetch("/api/leads",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ nome: conv.leadName, telefone: conv.telefone, origem: conv.origem === "Instagram" ? "Instagram" : conv.origem === "Site" ? "Site" : "WhatsApp", status:"novo", referencias: tags, observacoes: "Criado pelo inbox WhatsApp" })}).then(r=>r.json())
          if(criado?.lead?.id){ lid = criado.lead.id; leadTags = tags }
        }
      }
      if(!lid) throw new Error("Não foi possível encontrar/criar um lead")
      // reflete o vínculo no store para a UI e o salvamento de tags funcionarem já
      const st = useInboxStore.getState()
      st.setConversaLead(conv.id, lid, leadTags)
      // persiste o vínculo nas mensagens da instância (sobrevive ao reload)
      await fetch("/api/whatsapp/chat/vincular",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ instanceName: st.instanciaSelecionada, telefone: conv.telefone, leadId: lid })}).catch(()=>{})
      toast("Conversa vinculada ao lead")
      setModalVincular(false)
    }catch(e:any){
      toast(e.message || "Erro ao vincular lead","error")
    }finally{ setBuscando(false) }
  }

  async function iniciarAcao(acao: "ia" | "automacao"){
    setAcaoIniciando(acao)
    try{
      const instanciaSelecionada = useInboxStore.getState().instanciaSelecionada
      const r = await fetch(`/api/whatsapp/chat/ia-pause`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ telefone: conv.telefone, instanceName: instanciaSelecionada, pausado: acao === "automacao" })})
      const j = await r.json()
      if(!j.ok) throw new Error(j.erro || "falha")
      if(acao === "ia"){ criarFollowUp(conv.id); toast(j.aviso ? `IA iniciada (aviso: ${j.aviso})` : "IA iniciada e respondendo agora nesta conversa") }
      else { cancelarFollowUp(conv.id); toast("Automação de follow-up iniciada (IA pausada)") }
    }catch(e:any){
      toast(e.message || "Erro ao iniciar","error")
    }finally{ setAcaoIniciando(null) }
  }

  async function mudarStatus(s: string){
    if(!leadId) return
    setSalvandoStatus(true)
    try{
      const r = await fetch(`/api/leads/${encodeURIComponent(leadId)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({ status: s })})
      const j = await r.json()
      if(!j.ok) throw new Error(j.erro || "falha")
      useInboxStore.getState().setConversaStatus(conv.id, s)
      toast("Status atualizado")
    }catch(e:any){
      toast(e.message || "Erro ao atualizar status","error")
    }finally{ setSalvandoStatus(false) }
  }

  async function desvincularLead(){
    setDesvinculando(true)
    try{
      const st = useInboxStore.getState()
      await fetch("/api/whatsapp/chat/vincular",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ instanceName: st.instanciaSelecionada, telefone: conv.telefone, unlink: true })}).catch(()=>{})
      st.setConversaLead(conv.id, "", [])
      setModalDesvincular(false)
      toast("Conversa desvinculada do lead")
    }catch(e:any){
      toast(e.message || "Erro ao desvincular","error")
    }finally{ setDesvinculando(false) }
  }

  async function excluirLead(){
    if(!leadId) return
    const det = detalheExcluir.trim()
    if(!det) { toast("Descreva o detalhe do motivo para excluir","error"); return }
    setExcluindo(true)
    try{
      const r = await fetch(`/api/leads/${encodeURIComponent(leadId)}`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({ motivo: motivoExcluir, detalhe: det, usuario: user?.nome ?? "Inbox" })})
      const j = await r.json()
      if(!j.ok) throw new Error(j.erro || "falha")
      const st = useInboxStore.getState()
      st.setConversaLead(conv.id, "", [])
      setModalExcluir(false)
      setDetalheExcluir("")
      setMotivoExcluir(MOTIVOS_EXCLUSAO[0])
      toast("Lead excluído")
    }catch(e:any){
      toast(e.message || "Erro ao excluir lead","error")
    }finally{ setExcluindo(false) }
  }

  return (
    <div className="flex w-full shrink-0 flex-col gap-3 lg:w-[260px]">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-2 font-display text-sm font-bold text-slate-900 dark:text-slate-100" style={{fontFamily:"var(--font-inter)"}}>Lead Details</h3>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{conv.leadName}</p>
        <p className="text-xs text-slate-600 dark:text-slate-400">{conv.telefone}</p>
        <p className="text-xs text-slate-600 dark:text-slate-400">{conv.email}</p>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Responsável: <span className="text-slate-700 dark:text-slate-200">{conv.responsavel}</span></p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Origem: <span className="text-slate-700 dark:text-slate-200">{conv.origem}</span></p>
        <button onClick={()=>setModalVincular(true)} className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
          {temLead ? "Vincular a outro lead" : "Vincular a lead / criar lead"}
        </button>
        {temLead && (
          <div className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
            <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Status do lead</label>
            <Select value={leadStatus || ""} disabled={salvandoStatus} onChange={(e)=>mudarStatus(e.target.value)} className="h-8 text-xs">
              <option value="" disabled>Selecione…</option>
              {LEAD_STATUSES.map((s: LeadStatus) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </Select>
            <button onClick={()=>setModalDesvincular(true)} disabled={desvinculando} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 disabled:opacity-50">
              {desvinculando ? "Desvinculando…" : "Desvincular lead"}
            </button>
            <button onClick={()=>setModalExcluir(true)} disabled={excluindo} className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-500/20 dark:text-red-400 disabled:opacity-50">
              {excluindo ? "Excluindo…" : "Excluir lead"}
            </button>
          </div>
        )}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-2 flex items-center gap-1.5 font-display text-sm font-bold text-slate-900 dark:text-slate-100" style={{fontFamily:"var(--font-inter)"}}>🤖 Atendimento IA</h3>
        <div className="flex items-center justify-between gap-2">
          <span className={`text-xs ${iaLigada ? "text-amber-300" : "text-slate-400"}`}>
            {iaLigada ? "IA respondendo" : "IA pausada"}
          </span>
          <button onClick={toggleIA} className={`rounded-lg px-3 py-1.5 text-xs font-bold border transition ${iaLigada ? "border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20" : "border-cyan-500/40 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20"}`}>
            {iaLigada ? "Pausar IA" : "Retomar IA"}
          </button>
        </div>
        <div className="mt-2 flex flex-col gap-1.5">
          <button disabled={acaoIniciando!==null} onClick={()=>iniciarAcao("ia")} className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-400 hover:bg-cyan-500/20 disabled:opacity-50">
            {acaoIniciando==="ia" ? "Iniciando…" : "▶ Iniciar IA aqui"}
          </button>
          <button disabled={acaoIniciando!==null} onClick={()=>iniciarAcao("automacao")} className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-400 hover:bg-amber-500/20 disabled:opacity-50">
            {acaoIniciando==="automacao" ? "Iniciando…" : "⟳ Iniciar automação"}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">Com IA ligada o bot responde sozinho. Automação mantém a IA pausada e roda follow-ups programados.</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-2 font-display text-sm font-bold text-slate-900 dark:text-slate-100" style={{fontFamily:"var(--font-inter)"}}>Etiquetas / Tags</h3>
        <div className="flex flex-wrap gap-1.5">
          {tagsExistentes.map(tagItem=>{
            const t = tagItem.name
            const ativa = tags.includes(t)
            return (
              <button key={t} disabled={salvandoTags} onClick={()=>toggleTag(t)} title={ativa ? `Remover tag ${t}` : `Adicionar tag ${t}`} style={ativa ? { borderColor: tagItem.color, backgroundColor: `${tagItem.color}22`, color: tagItem.color } : undefined} className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50 ${ativa ? "" : "border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>
                {ativa ? "✕ " : "#"}{t}
              </button>
            )
          })}
        </div>
        {tags.length>0 && (
          <button disabled={salvandoTags} onClick={()=>salvarTags([])} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50">
            {salvandoTags ? "salvando…" : "Limpar todas as tags"}
          </button>
        )}
        <div className="mt-2 flex gap-1.5">
          <input value={tagInput} onChange={(e)=>setTagInput(e.target.value)} onKeyDown={(e)=>{ if(e.key==="Enter") addCustomTag() }} placeholder="nova tag…" className="h-7 flex-1 rounded border border-slate-700 bg-slate-800 px-2 text-[11px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500" disabled={salvandoTags} />
          <button onClick={addCustomTag} disabled={salvandoTags || !tagInput.trim()} className="h-7 rounded bg-violet-600 px-2 text-[11px] font-semibold text-white disabled:opacity-50">+</button>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">{salvandoTags ? "salvando…" : (temLead ? "tags salvas no lead" : "vincule um lead p/ salvar tags")}</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-2 font-display text-sm font-bold text-slate-900 dark:text-slate-100" style={{fontFamily:"var(--font-inter)"}}>Follow-up Status</h3>
        {conv.followUpAtivo ? (
          <>
            <p className="text-xs text-amber-300">🤖 IA respondendo</p>
            <p className="text-xs text-slate-400">Tentativas restantes: <span className="text-slate-100">{conv.tentativasRestantes}</span></p>
            <p className="text-xs text-slate-400">Próxima em: <span className="text-slate-100">{proxima}</span></p>
          </>
        ) : <p className="text-xs text-slate-400">Sem follow-up ativo</p>}
      </div>

      {modalVincular && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={()=>setModalVincular(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900" onClick={(e)=>e.stopPropagation()}>
            <h3 className="mb-1 font-display text-base font-bold text-slate-900 dark:text-slate-100">Vincular conversa a um lead</h3>
            <p className="mb-4 text-xs text-slate-500">Conversa: {conv.leadName} · {conv.telefone}. O sistema busca automaticamente um lead pelo telefone; se não houver, você cria um novo.</p>
            <div className="flex flex-col gap-2">
              <button disabled={buscando} onClick={()=>vincularLead(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 disabled:opacity-50">
                {buscando ? "Buscando…" : "Vincular a lead existente"}
              </button>
              <button disabled={buscando} onClick={()=>vincularLead(true)} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {buscando ? "Criando…" : "Criar novo lead"}
              </button>
              <button onClick={()=>setModalVincular(false)} className="rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {modalDesvincular && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={()=>setModalDesvincular(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900" onClick={(e)=>e.stopPropagation()}>
            <h3 className="mb-1 font-display text-base font-bold text-slate-900 dark:text-slate-100">Desvincular lead</h3>
            <p className="mb-4 text-xs text-slate-500">A conversa de {conv.leadName} deixa de apontar para o lead, mas o lead e o histórico seguem intactos no CRM. É possível vincular novamente depois.</p>
            <div className="flex flex-col gap-2">
              <button disabled={desvinculando} onClick={()=>desvincularLead()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 disabled:opacity-50">
                {desvinculando ? "Desvinculando…" : "Confirmar desvinculação"}
              </button>
              <button onClick={()=>setModalDesvincular(false)} className="rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {modalExcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={()=>setModalExcluir(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900" onClick={(e)=>e.stopPropagation()}>
            <h3 className="mb-1 font-display text-base font-bold text-red-600 dark:text-red-400">Excluir lead</h3>
            <p className="mb-3 text-xs text-slate-500">Isso exclui permanentemente o lead {conv.leadName} (id <span className="font-mono">{leadId}</span>) do CRM. A conversa permanece no Inbox, apenas sem lead vinculado. A ação fica registrada na auditoria.</p>
            <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">Motivo</label>
            <Select value={motivoExcluir} onChange={(e)=>setMotivoExcluir(e.target.value)} className="mb-3 h-8 w-full text-xs">
              {MOTIVOS_EXCLUSAO.map((m)=> <option key={m} value={m}>{m}</option>)}
            </Select>
            <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">Detalhe do motivo</label>
            <textarea value={detalheExcluir} onChange={(e)=>setDetalheExcluir(e.target.value)} rows={2} placeholder="Descreva por que está excluindo…" className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-red-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
            <div className="flex flex-col gap-2">
              <button disabled={excluindo || !detalheExcluir.trim()} onClick={()=>excluirLead()} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                {excluindo ? "Excluindo…" : "Excluir permanentemente"}
              </button>
              <button onClick={()=>setModalExcluir(false)} className="rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
