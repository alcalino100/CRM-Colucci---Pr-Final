import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

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
  const nomes: Record<string, { nome: string; status: string }> = {}
  if (leadIds.length) {
    const { data: leads } = await wsupabase.from("leads").select("id, nome, status").in("id", leadIds)
    for (const l of leads ?? []) nomes[l.id] = { nome: l.nome, status: l.status }
  }

  const conversas = Array.from(porConversa.values())
    .map((c) => ({
      ...c,
      nome: c.leadId ? (nomes[c.leadId]?.nome ?? c.nomeContato ?? c.telefone) : (c.nomeContato ?? c.telefone),
      status: c.leadId ? (nomes[c.leadId]?.status ?? null) : null,
    }))
    .sort((a, b) => (a.ultimaEm < b.ultimaEm ? 1 : -1))

  return NextResponse.json({ conversas })
}