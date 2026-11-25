import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"
import { exigirGestor, negarAcesso } from "@/lib/auth/sessao"
import { consultarNumero } from "@/lib/whatsapp-oficial/client"
import { statusConfiguracao } from "@/lib/whatsapp-oficial/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Tabela nova (fora dos tipos gerados do Supabase até regenerá-los).
const canaisDb = wsupabase as unknown as { from: (t: string) => any }

const COLUNAS = "id, nome, phone_number_id, waba_id, numero, nome_verificado, qualidade, ativo, criado_em"

// Lista os canais oficiais e diz o que falta configurar no servidor (sem revelar valores).
export async function GET(request: Request) {
  const auth = exigirGestor(request)
  if (!auth.ok) return negarAcesso(auth)
  const { data, error } = await canaisDb.from("whatsapp_oficial_canais").select(COLUNAS).order("criado_em", { ascending: true })
  const webhookUrl = `${new URL(request.url).origin}/api/whatsapp/oficial/webhook`
  if (error) return NextResponse.json({ ok: true, canais: [], configuracao: statusConfiguracao(), webhookUrl, aviso: "Tabela de canais ainda não existe: rode a migration 20261125120000_whatsapp_oficial.sql no Supabase." })
  return NextResponse.json({ ok: true, canais: data ?? [], configuracao: statusConfiguracao(), webhookUrl })
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
    .select(COLUNAS)
    .single()
  if (error) return NextResponse.json({ ok: false, erro: "Não foi possível salvar o canal (a migration foi aplicada?)." }, { status: 500 })
  return NextResponse.json({ ok: true, canal: data })
}

// Ativa/desativa um canal.
export async function PATCH(request: Request) {
  const auth = exigirGestor(request)
  if (!auth.ok) return negarAcesso(auth)
  let body: { id?: string; ativo?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, erro: "Dados inválidos." }, { status: 400 }) }
  if (!body.id || typeof body.ativo !== "boolean") return NextResponse.json({ ok: false, erro: "Informe id e ativo." }, { status: 400 })
  const { error } = await canaisDb.from("whatsapp_oficial_canais").update({ ativo: body.ativo, atualizado_em: new Date().toISOString() }).eq("id", body.id)
  if (error) return NextResponse.json({ ok: false, erro: "Não foi possível atualizar o canal." }, { status: 500 })
  return NextResponse.json({ ok: true })
}
