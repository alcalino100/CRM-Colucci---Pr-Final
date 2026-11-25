import { NextResponse } from "next/server"
import { onlyDigits, sendWhatsAppText } from "@/lib/whatsapp/server"
import { ehCanalOficial, phoneNumberIdDoCanal } from "@/lib/whatsapp-oficial/config"
import { enviarModeloOficial, renderizarModelo } from "@/lib/whatsapp-oficial/client"
import { enviarTextoPorCanalOficial } from "@/lib/whatsapp-oficial/despacho"
import { MSG_JANELA_EXPIRADA } from "@/lib/whatsapp-oficial/janela"
import { registrarEnvioOficial } from "@/lib/whatsapp-oficial/envio"
import { registrarEnvioManual } from "@/lib/whatsapp-webhook/registrar-envio"
import { exigirSessao, negarAcesso } from "@/lib/auth/sessao"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Envia uma mensagem de texto pelo WhatsApp de um corretor (usado pelo Chat do gestor).
// A mensagem é gravada aqui mesmo (pelo id devolvido pela Evolution); se o eco fromMe do
// webhook chegar depois, o id repetido é ignorado — sem duplicar a linha.
export async function POST(request: Request) {
  const auth = exigirSessao(request)
  if (!auth.ok) return negarAcesso(auth)

  let body: { instanceName?: string; telefone?: string; texto?: string; modelo?: { nome: string; idioma?: string; variaveis?: string[]; corpo?: string } }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, erro: "Dados inválidos." }, { status: 400 })
  }

  const instanceName = body.instanceName?.trim()
  const telefone = onlyDigits(body.telefone ?? "")
  const texto = body.texto?.trim() ?? ""

  if (!instanceName || !telefone || (!texto && !body.modelo?.nome)) {
    return NextResponse.json({ ok: false, erro: "instanceName, telefone e texto são obrigatórios." }, { status: 400 })
  }

  // Canal da API oficial (Meta): texto livre só dentro da janela de 24h; fora dela, só modelo aprovado.
  if (ehCanalOficial(instanceName)) {
    if (body.modelo?.nome) {
      const r = await enviarModeloOficial(phoneNumberIdDoCanal(instanceName), telefone, body.modelo.nome, body.modelo.idioma || "pt_BR", body.modelo.variaveis ?? [])
      if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: 502 })
      await registrarEnvioOficial({ instanceName, telefone, texto: texto || renderizarModelo(body.modelo.corpo ?? `[modelo ${body.modelo.nome}]`, body.modelo.variaveis ?? []), wamid: r.wamid })
      return NextResponse.json({ ok: true })
    }
    const r = await enviarTextoPorCanalOficial(instanceName, telefone, texto)
    if (!r.ok) {
      const expirou = r.erro === MSG_JANELA_EXPIRADA
      return NextResponse.json({ ok: false, ...(expirou ? { codigo: "JANELA_EXPIRADA" } : {}), erro: r.erro }, { status: expirou ? 409 : 502 })
    }
    await registrarEnvioOficial({ instanceName, telefone, texto, wamid: r.keyId! })
    return NextResponse.json({ ok: true })
  }

  if (!texto) return NextResponse.json({ ok: false, erro: "Texto é obrigatório." }, { status: 400 })

  const res = await sendWhatsAppText(instanceName, telefone, texto)
  if (!res.ok) return NextResponse.json({ ok: false, erro: res.erro }, { status: 502 })
  await registrarEnvioManual({ instanceName, telefone, texto, keyId: res.keyId })
  return NextResponse.json({ ok: true })
}
