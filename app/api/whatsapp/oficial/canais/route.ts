import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"
import { exigirGestor, negarAcesso } from "@/lib/auth/sessao"
import { consultarNumero } from "@/lib/whatsapp-oficial/client"
import { instanceDoCanal, statusConfiguracao } from "@/lib/whatsapp-oficial/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Tabela nova (fora dos tipos gerados do Supabase até regenerá-los).
const canaisDb = wsupabase as unknown as { from: (t: string) => any }

const COLUNAS = "id, nome, phone_number_id, waba_id, numero, nome_verificado, qualidade, ativo, criado_em, modo, ai_agent_id"
const COLUNAS_BASE = "id, nome, phone_number_id, waba_id, numero, nome_verificado, qualidade, ativo, criado_em"

// Lista os canais oficiais e diz o que falta configurar no servidor (sem revelar valores).
export async function GET(request: Request) {
  const auth = exigirGestor(request)
  if (!auth.ok) return negarAcesso(auth)
  let { data, error } = await canaisDb.from("whatsapp_oficial_canais").select(COLUNAS).order("criado_em", { ascending: true })
  if (error) ({ data, error } = await canaisDb.from("whatsapp_oficial_canais").select(COLUNAS_BASE).order("criado_em", { ascending: true }))
  const { data: agentes } = await canaisDb.from("ai_agents").select("id, name, is_active")
  const webhookUrl = `${new URL(request.url).origin}/api/whatsapp/oficial/webhook`
  if (error) return NextResponse.json({ ok: true, canais: [], configuracao: statusConfiguracao(), webhookUrl, aviso: "Tabela de canais ainda não existe: rode a migration 20261125120000_whatsapp_oficial.sql no Supabase." })
  return NextResponse.json({ ok: true, canais: data ?? [], agentes: (agentes ?? []).filter((a: any) => a.is_active), configuracao: statusConfiguracao(), webhookUrl })
}

// Cadastra um número da API oficial (valida o token consultando o Graph).
export async function POST(request: Request) {
  const auth = exigirGestor(request)
  if (!auth.ok) return negarAcesso(auth)
  let body: { nome?: string; phoneNumberId?: string; wabaId?: string }
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, erro: "Dados inválidos." }, { status: 400 }) }
  const phoneNumberId = (body.phoneNumberId ?? "").replace(/\D/g, "")
  const nome = (body.nome ?? "").trim()
  if (!phoneNumberId || !nome) return NextResponse.json({ ok: false, erro: "Informe o nome e o ID do número (Phone Number ID)." }, { status: 400 })

  const info = await consultarNumero(phoneNumberId)
  if (!info.ok) return NextResponse.json({ ok: false, erro: `Não consegui validar o número na Meta: ${info.erro}` }, { status: 422 })

  const { data, error } = await canaisDb
    .from("whatsapp_oficial_canais")
    .upsert(
      { nome, phone_number_id: phoneNumberId, waba_id: (body.wabaId ?? "").replace(/\D/g, "") || null, numero: info.numero, nome_verificado: info.nomeVerificado, qualidade: info.qualidade, ativo: true, atualizado_em: new Date().toISOString() },
      { onConflict: "phone_number_id" },
    )
    .select(COLUNAS_BASE)
    .single()
  if (error) return NextResponse.json({ ok: false, erro: "Não foi possível salvar o canal (a migration foi aplicada?)." }, { status: 500 })
  return NextResponse.json({ ok: true, canal: data })
}

// Atualiza um canal: ativo, WABA ID e modo de atendimento (manual | assistente | ia).
// No modo "ia" o agente escolhido passa a atender este canal (vínculo na lista de instâncias do agente).
export async function PATCH(request: Request) {
  const auth = exigirGestor(request)
  if (!auth.ok) return negarAcesso(auth)
  let body: { id?: string; nome?: string; ativo?: boolean; wabaId?: string; modo?: string; aiAgentId?: string; revalidar?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, erro: "Dados inválidos." }, { status: 400 }) }
  if (!body.id) return NextResponse.json({ ok: false, erro: "Informe o id do canal." }, { status: 400 })

  const { data: canal } = await canaisDb.from("whatsapp_oficial_canais").select("phone_number_id").eq("id", body.id).maybeSingle()
  if (!canal) return NextResponse.json({ ok: false, erro: "Canal não encontrado." }, { status: 404 })

  const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  if (typeof body.ativo === "boolean") patch.ativo = body.ativo
  if (typeof body.nome === "string") {
    if (!body.nome.trim()) return NextResponse.json({ ok: false, erro: "O nome não pode ficar vazio." }, { status: 400 })
    patch.nome = body.nome.trim()
  }
  if (body.revalidar) {
    const info = await consultarNumero(canal.phone_number_id)
    if (!info.ok) return NextResponse.json({ ok: false, erro: `Não consegui validar na Meta: ${info.erro}` }, { status: 422 })
    Object.assign(patch, { numero: info.numero, nome_verificado: info.nomeVerificado, qualidade: info.qualidade })
  }
  if (typeof body.wabaId === "string") patch.waba_id = body.wabaId.replace(/\D/g, "") || null
  if (body.modo !== undefined) {
    if (!["manual", "assistente", "ia"].includes(body.modo)) return NextResponse.json({ ok: false, erro: "Modo inválido." }, { status: 400 })
    patch.modo = body.modo
    patch.ai_agent_id = body.modo === "ia" ? body.aiAgentId ?? null : null
    if (body.modo === "ia") {
      if (!body.aiAgentId) return NextResponse.json({ ok: false, erro: "Escolha o agente de IA." }, { status: 400 })
      const instancia = instanceDoCanal(canal.phone_number_id)
      const { data: ag } = await canaisDb.from("ai_agents").select("config").eq("id", body.aiAgentId).maybeSingle()
      if (!ag) return NextResponse.json({ ok: false, erro: "Agente não encontrado." }, { status: 404 })
      const cfg = typeof ag.config === "string" ? JSON.parse(ag.config) : ag.config ?? {}
      const lista: string[] = Array.isArray(cfg?.rules?.whitelistInstances) ? cfg.rules.whitelistInstances : []
      if (!lista.includes(instancia)) {
        cfg.rules = { ...(cfg.rules ?? {}), whitelistInstances: [...lista, instancia] }
        const { error: eAg } = await canaisDb.from("ai_agents").update({ config: cfg, updated_at: new Date().toISOString() }).eq("id", body.aiAgentId)
        if (eAg) return NextResponse.json({ ok: false, erro: "Não foi possível vincular o agente." }, { status: 500 })
      }
    }
  }
  const { error } = await canaisDb.from("whatsapp_oficial_canais").update(patch).eq("id", body.id)
  if (error) return NextResponse.json({ ok: false, erro: "Não foi possível atualizar o canal (a migration da fase 2 foi aplicada?)." }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// Remove o canal do CRM (o histórico de mensagens fica guardado; o número só deixa de aparecer no Inbox).
export async function DELETE(request: Request) {
  const auth = exigirGestor(request)
  if (!auth.ok) return negarAcesso(auth)
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return NextResponse.json({ ok: false, erro: "Informe o id do canal." }, { status: 400 })
  const { error } = await canaisDb.from("whatsapp_oficial_canais").delete().eq("id", id)
  if (error) return NextResponse.json({ ok: false, erro: "Não foi possível remover o canal." }, { status: 500 })
  return NextResponse.json({ ok: true })
}
