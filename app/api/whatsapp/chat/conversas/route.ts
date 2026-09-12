import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"
import { getBoundInstances, getRules } from "@/lib/ai/rules"
import { normalizePhone } from "@/lib/labels"
import { TELEFONES_BLOQUEADOS } from "@/lib/telefones-bloqueados"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const normTel = (v: string) => (v || "").replace(/\D/g, "")
const ehBloqueado = (telefone: string) => {
  const d = normTel(telefone)
  return TELEFONES_BLOQUEADOS.has(d) || TELEFONES_BLOQUEADOS.has(normalizePhone(telefone))
}

// Lista as conversas de uma instância: um item por LEAD (ou por telefone, quando a
// mensagem não tem lead vinculado) que tem mensagens nessa instância, com a última
// mensagem e a contagem. Inclui contatos que ainda não viraram lead do CRM, para o
// gestor ver TODAS as conversas reais do WhatsApp.
export async function GET(request: Request) {
  const instanceName = new URL(request.url).searchParams.get("instanceName")
  if (!instanceName) return NextResponse.json({ error: "Instância não informada." }, { status: 400 })

  const PAGE = 900
  const mensagens: Array<{ lead_id: string | null; telefone: string; nome_contato: string | null; corpo: string | null; de_mim: boolean; criado_em: string; tipo_midia: string | null }> = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await wsupabase
      .from("whatsapp_mensagens")
      .select("lead_id, telefone, nome_contato, corpo, de_mim, criado_em, tipo_midia")
      .eq("instance_name", instanceName)
      .order("criado_em", { ascending: false })
      .range(offset, offset + PAGE - 1)
    if (error) return NextResponse.json({ error: "Não foi possível carregar as conversas." }, { status: 500 })
    if (!data?.length) break
    mensagens.push(...data)
    if (data.length < PAGE) break
  }

  // Rótulo curto para a prévia da conversa quando a última mensagem é mídia sem legenda.
  const rotuloMidia: Record<string, string> = {
    image: "📷 Foto", audio: "🎤 Áudio", video: "🎬 Vídeo", document: "📄 Documento", sticker: "🌟 Figurinha",
  }
  const previa = (m: { corpo: string | null; tipo_midia: string | null }) =>
    m.corpo?.trim() ? m.corpo : m.tipo_midia ? (rotuloMidia[m.tipo_midia] ?? "Mídia") : (m.corpo ?? "")

  // Agrupa por lead quando existe; senão, por telefone (contato fora da base).
  // A lista já vem da mais recente para a mais antiga.
  const porConversa = new Map<
    string,
    { leadId: string | null; telefone: string; nomeContato: string | null; ultima: string; ultimaEm: string; ultimaDeMim: boolean; total: number }
  >()
  for (const m of mensagens) {
    const chave = m.lead_id ?? `tel:${m.telefone}`
    const existente = porConversa.get(chave)
    if (existente) {
      existente.total++
      // Nome: a lista vem da mais recente p/ mais antiga e fromMe tem nome null —
      // usa o pushName não-vazio mais recente em vez do telefone.
      if (!existente.nomeContato && m.nome_contato) existente.nomeContato = m.nome_contato
    } else {
      porConversa.set(chave, {
        leadId: m.lead_id,
        telefone: m.telefone,
        nomeContato: m.nome_contato,
        ultima: previa(m),
        ultimaEm: m.criado_em,
        ultimaDeMim: !!m.de_mim,
        total: 1,
      })
    }
  }

  const leadIds = Array.from(porConversa.values())
    .map((c) => c.leadId)
    .filter((id): id is string => !!id)
  const nomes: Record<string, { nome: string; status: string; origem: string; tags: string[] }> = {}
  if (leadIds.length) {
    const { data: leads } = await wsupabase.from("leads").select("id, nome, status, origem, referencias").in("id", leadIds)
    for (const l of leads ?? []) nomes[l.id] = { nome: l.nome, status: l.status, origem: (l as { origem?: string }).origem ?? "", tags: (l.referencias ?? []).map((r: any) => (typeof r === "string" ? r : r?.ref ?? "")).filter(Boolean) }
  }

  // Estado da IA por telefone/lead (conversations_ia.ai_responding)
  const telefones = Array.from(new Set(Array.from(porConversa.values()).map((c) => c.telefone))).filter(Boolean)
  const iaAtiva: Record<string, boolean> = {}
  if (telefones.length) {
    const { data: convs } = await wsupabase
      .from("conversations_ia")
      .select("external_id, ai_responding")
      .in("external_id", telefones)
      .eq("status", "active")
    for (const cv of convs ?? []) iaAtiva[cv.external_id ?? ""] = cv.ai_responding !== false
  }

  // Regras do agente vinculado à instância (para o selo de elegibilidade da IA).
  let regrasAgente: ReturnType<typeof getRules> | null = null
  try {
    const { data: agentes } = await wsupabase.from("ai_agents").select("is_active,config")
    const agente = (agentes ?? []).find(
      (a: { is_active?: boolean; config?: unknown }) => a.is_active && getRules(a.config).enable && getBoundInstances(a.config).includes(instanceName),
    )
    if (agente) regrasAgente = getRules((agente as { config?: unknown }).config)
  } catch { /* sem regras: tudo aparece como não-elegível */ }

  const conversas = Array.from(porConversa.values())
    .map((c) => ({
      ...c,
      nome: c.leadId ? (nomes[c.leadId]?.nome ?? c.nomeContato ?? c.telefone) : (c.nomeContato ?? c.telefone),
      status: c.leadId ? (nomes[c.leadId]?.status ?? null) : null,
      tags: c.leadId ? (nomes[c.leadId]?.tags ?? []) : [],
      iaRespondendo: iaAtiva[c.telefone] ?? false,
      ia: elegibilidadeIA(c.telefone, c.leadId ? nomes[c.leadId] : undefined, iaAtiva[c.telefone] ?? false, regrasAgente),
    }))
    .sort((a, b) => (a.ultimaEm < b.ultimaEm ? 1 : -1))

  return NextResponse.json({ conversas })
}

// Espelha as travas do handlePatriciaInbound para exibir no Inbox QUEM a IA
// responde (e por que não responde) — sem executar nada.
function elegibilidadeIA(
  telefone: string,
  lead: { status: string; origem: string; tags: string[] } | undefined,
  iaLigadaNoContato: boolean,
  regras: ReturnType<typeof getRules> | null,
): { responde: boolean; motivo: string } {
  if (!regras) return { responde: false, motivo: "sem IA vinculada a esta instância" }
  const teste = (regras.target.numeroTeste || []).some((n) => normTel(n) === normTel(telefone) || normalizePhone(String(n)) === normalizePhone(telefone))
  if (ehBloqueado(telefone) && !teste) return { responde: false, motivo: "número interno (bloqueado)" }
  if (teste) return { responde: true, motivo: "número de teste" }
  if (!lead) return { responde: false, motivo: "sem lead vinculado" }
  const norm = (v: string) => v.toLowerCase().trim()
  if (regras.target.origensPermitidas.length && !regras.target.origensPermitidas.some((o) => norm(o) === norm(String(lead.origem || "")))) {
    return { responde: false, motivo: `origem "${lead.origem || "—"}" não permitida` }
  }
  const tags = (lead.tags || []).map(norm)
  if (regras.target.tags.length && regras.target.tagsModo !== "none") {
    const alvos = regras.target.tags.map(norm)
    const ok = regras.target.tagsModo === "all" ? alvos.every((t) => tags.includes(t)) : alvos.some((t) => tags.includes(t))
    if (!ok) return { responde: false, motivo: "sem tag exigida" }
  }
  if (lead.status && regras.target.statusBloqueados.map(norm).includes(norm(String(lead.status)))) {
    return { responde: false, motivo: `status "${lead.status}" bloqueado` }
  }
  if (!iaLigadaNoContato) return { responde: false, motivo: "IA pausada neste contato" }
  return { responde: true, motivo: "apto (origem + tags)" }
}