import crypto from "crypto"
import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"
import { exigirGestor, negarAcesso } from "@/lib/auth/sessao"
import { consultarNumero, enviarModeloOficial, enviarTextoOficial, listarModelos } from "@/lib/whatsapp-oficial/client"
import { instanceDoCanal, segredoApp, statusConfiguracao, tokenVerificacao } from "@/lib/whatsapp-oficial/config"
import { registrarEnvioOficial } from "@/lib/whatsapp-oficial/envio"
import { dentroDaJanela } from "@/lib/whatsapp-oficial/janela"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

type Passo = { nome: string; ok: boolean; detalhe: string }
const db = wsupabase as unknown as { from: (t: string) => any }
const assinar = (corpo: string) => "sha256=" + crypto.createHmac("sha256", segredoApp()).update(corpo).digest("hex")
const payloadDe = (phoneNumberId: string, value: Record<string, unknown>) => JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "TESTE", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "0", phone_number_id: phoneNumberId }, ...value } }] }] })

/**
 * Painel de testes da API oficial. ações:
 *  - config: servidor configurado? token válido? números respondem na Meta?
 *  - webhook: auto-teste do webhook (verificação, assinatura inválida recusada, assinatura válida aceita)
 *  - receber: simula uma mensagem recebida (assinada) para ver o fluxo até o Inbox — nunca aciona IA/assistente
 *  - enviar: envia de verdade pela Meta (modelo hello_world ou texto dentro da janela)
 */
export async function POST(request: Request) {
  const auth = exigirGestor(request)
  if (!auth.ok) return negarAcesso(auth)
  let body: { acao?: string; canalId?: string; telefone?: string; texto?: string; modelo?: string; idioma?: string }
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, erro: "Dados inválidos." }, { status: 400 }) }
  const origem = new URL(request.url).origin
  const passos: Passo[] = []
  const passo = (nome: string, ok: boolean, detalhe: string) => passos.push({ nome, ok, detalhe })

  const { data: canais } = await db.from("whatsapp_oficial_canais").select("id, nome, phone_number_id, waba_id, ativo")
  const canal = (canais ?? []).find((c: any) => c.id === body.canalId) ?? (body.acao === "config" || body.acao === "webhook" ? null : undefined)
  const telefone = (body.telefone ?? "").replace(/\D/g, "")

  if (body.acao === "config") {
    const c = statusConfiguracao()
    passo("WHATSAPP_CLOUD_TOKEN", c.token, c.token ? "configurado" : "faltando na Vercel")
    passo("META_APP_SECRET", c.appSecret, c.appSecret ? "configurado" : "faltando na Vercel")
    passo("WHATSAPP_CLOUD_VERIFY_TOKEN", c.verifyToken, c.verifyToken ? "configurado" : "faltando na Vercel")
    passo("Números cadastrados", (canais ?? []).length > 0, `${(canais ?? []).length} número(s)`)
    if (c.token) for (const cn of canais ?? []) {
      const r = await consultarNumero(cn.phone_number_id)
      passo(`Token x número "${cn.nome}"`, r.ok, r.ok ? `${r.numero ?? ""} · ${r.nomeVerificado ?? ""} · qualidade ${r.qualidade ?? "?"}` : r.erro)
    }
    return NextResponse.json({ ok: passos.every((p) => p.ok), passos })
  }

  if (body.acao === "webhook") {
    const url = `${origem}/api/whatsapp/oficial/webhook`
    if (!tokenVerificacao() || !segredoApp()) {
      passo("Pré-requisitos", false, "Cadastre WHATSAPP_CLOUD_VERIFY_TOKEN e META_APP_SECRET na Vercel e faça um novo deploy.")
      return NextResponse.json({ ok: false, passos })
    }
    try {
      const v = await fetch(`${url}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(tokenVerificacao())}&hub.challenge=teste123`)
      passo("Verificação (GET)", v.ok && (await v.text()) === "teste123", v.ok ? "devolveu o desafio corretamente" : `HTTP ${v.status}`)
      const ruim = await fetch(`${url}?hub.mode=subscribe&hub.verify_token=token-errado&hub.challenge=x`)
      passo("Token errado é recusado", ruim.status === 403, `HTTP ${ruim.status} (esperado 403)`)
      const corpoRuim = payloadDe("TESTE", { statuses: [] })
      const semAss = await fetch(url, { method: "POST", body: corpoRuim, headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=invalida", "x-crm-autoteste": "1" } })
      passo("Assinatura inválida é recusada", semAss.status === 401, `HTTP ${semAss.status} (esperado 401)`)
      const corpoOk = payloadDe("TESTE", { statuses: [{ id: "wamid.TESTE.status", status: "sent", recipient_id: "0" }] })
      const comAss = await fetch(url, { method: "POST", body: corpoOk, headers: { "content-type": "application/json", "x-hub-signature-256": assinar(corpoOk) } })
      passo("Assinatura válida é aceita", comAss.status === 200, `HTTP ${comAss.status} (esperado 200)`)
    } catch (e) {
      passo("Chamada ao próprio webhook", false, e instanceof Error ? e.message : "falha de rede")
    }
    return NextResponse.json({ ok: passos.every((p) => p.ok), passos })
  }

  if (!canal) return NextResponse.json({ ok: false, erro: "Escolha um número cadastrado." }, { status: 400 })
  if (!telefone) return NextResponse.json({ ok: false, erro: "Informe o telefone de teste (com DDI, ex.: 5518999999999)." }, { status: 400 })
  const instanceName = instanceDoCanal(canal.phone_number_id)

  if (body.acao === "modelos") {
    if (!canal.waba_id) {
      passo("WABA ID do número", false, "Cadastre o WABA ID deste número (Configurações > WhatsApp > API Oficial) para listar os modelos.")
    } else {
      const r = await listarModelos(canal.waba_id)
      if (!r.ok) passo("Listar modelos na Meta", false, r.erro)
      else if (r.modelos.length === 0) passo("Modelos da conta", false, "Nenhum modelo encontrado nesta conta. Crie um no Gerenciador do WhatsApp (Meta).")
      else for (const m of r.modelos) passo(`${m.nome} (${m.idioma})`, m.status === "APPROVED", `${m.status}${m.categoria ? ` · ${m.categoria.toLowerCase()}` : ""}${m.variaveis ? ` · ${m.variaveis} variável(is)` : ""}`)
    }
    return NextResponse.json({ ok: passos.every((p) => p.ok), passos })
  }

  if (body.acao === "receber") {
    if (!segredoApp()) return NextResponse.json({ ok: false, erro: "META_APP_SECRET não configurado no servidor." }, { status: 422 })
    const wamid = `wamid.TESTE.${Date.now()}`
    const corpo = payloadDe(canal.phone_number_id, {
      contacts: [{ wa_id: telefone, profile: { name: "Teste do CRM" } }],
      messages: [{ from: telefone, id: wamid, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: body.texto?.trim() || "[TESTE] Mensagem simulada pelo painel de testes" } }],
    })
    const r = await fetch(`${origem}/api/whatsapp/oficial/webhook`, { method: "POST", body: corpo, headers: { "content-type": "application/json", "x-hub-signature-256": assinar(corpo) } })
    passo("Webhook aceitou o evento assinado", r.status === 200, `HTTP ${r.status}`)
    const { data: gravada } = await wsupabase.from("whatsapp_mensagens").select("id, lead_id").eq("mensagem_id", wamid).maybeSingle()
    passo("Mensagem gravada no banco", !!gravada, gravada ? "ok" : "não encontrada (o canal está ativo? a migration foi aplicada?)")
    passo("Aparece no Inbox", !!gravada, `Inbox > instância "${canal.nome} (API oficial)" > conversa ${telefone}. Mensagens de teste não acionam IA nem assistente.`)
    return NextResponse.json({ ok: passos.every((p) => p.ok), passos })
  }

  if (body.acao === "enviar") {
    if (body.modelo) {
      // O modelo padrão da Meta (hello_world) só existe em en_US; modelos próprios costumam ser pt_BR.
      const idioma = body.idioma?.trim() || (body.modelo === "hello_world" ? "en_US" : "pt_BR")
      const r = await enviarModeloOficial(canal.phone_number_id, telefone, body.modelo, idioma)
      passo(`Modelo "${body.modelo}" enviado`, r.ok, r.ok ? `aceito pela Meta (${r.wamid})` : r.erro)
      if (r.ok) await registrarEnvioOficial({ instanceName, telefone, texto: `[modelo ${body.modelo}] enviado pelo painel de testes`, wamid: r.wamid })
    } else {
      const { data: ultima } = await wsupabase.from("whatsapp_mensagens").select("criado_em").eq("instance_name", instanceName).eq("telefone", telefone).eq("de_mim", false).order("criado_em", { ascending: false }).limit(1).maybeSingle()
      const aberta = dentroDaJanela(ultima?.criado_em)
      passo("Janela de 24h", aberta, aberta ? "aberta" : "fechada: esse número não falou com o canal nas últimas 24h — use um modelo (ex.: hello_world)")
      if (aberta) {
        const r = await enviarTextoOficial(canal.phone_number_id, telefone, body.texto?.trim() || "Teste do CRM: mensagem de texto pela API oficial ✅")
        passo("Texto enviado", r.ok, r.ok ? `aceito pela Meta (${r.wamid})` : r.erro)
        if (r.ok) await registrarEnvioOficial({ instanceName, telefone, texto: body.texto?.trim() || "Teste do CRM: mensagem de texto pela API oficial ✅", wamid: r.wamid })
      }
    }
    return NextResponse.json({ ok: passos.every((p) => p.ok), passos })
  }

  return NextResponse.json({ ok: false, erro: "Ação desconhecida." }, { status: 400 })
}
