import { NextResponse } from "next/server"
import { mapConnectionState, onlyDigits, wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

// Sempre responde 200 para não interromper o fluxo da Evolution
const ok = () => NextResponse.json({ received: true })

function getInstanceName(payload: any): string | null {
  return payload?.instance ?? payload?.instanceName ?? payload?.data?.instance ?? null
}

async function handleConnectionUpdate(payload: any) {
  const instanceName = getInstanceName(payload)
  if (!instanceName) return
  const state = payload?.data?.state ?? payload?.data?.connection ?? payload?.state
  const status = mapConnectionState(state)
  const numeroRaw = payload?.data?.wuid ?? payload?.data?.number ?? payload?.wuid ?? null
  const numero = numeroRaw ? onlyDigits(String(numeroRaw).split("@")[0]) : null

  const patch: Record<string, unknown> = { status, atualizado_em: new Date().toISOString() }
  if (status === "conectado" && numero) patch.numero = numero
  if (status === "conectado") patch.qr_code = null
  await wsupabase.from("whatsapp_instancias").update(patch).eq("instance_name", instanceName)
}

async function handleMessageUpsert(payload: any) {
  const instanceName = getInstanceName(payload)
  if (!instanceName) return
  const msg = Array.isArray(payload?.data) ? payload.data[0] : payload?.data
  if (!msg || msg?.key?.fromMe === true) return

  const remoteJid: string = msg?.key?.remoteJid ?? ""
  // Ignora grupos e transmissões
  if (remoteJid.includes("@g.us") || remoteJid.includes("broadcast")) return
  const telefone = onlyDigits(remoteJid.split("@")[0])
  if (!telefone) return
  const nome = msg?.pushName || telefone
  const corpo =
    msg?.message?.conversation ??
    msg?.message?.extendedTextMessage?.text ??
    "[mídia]"

  // Descobre o corretor dono da instância
  const { data: inst } = await wsupabase
    .from("whatsapp_instancias")
    .select("corretor_id")
    .eq("instance_name", instanceName)
    .maybeSingle()
  const corretorId = inst?.corretor_id
  if (!corretorId) return

  // Procura lead existente por telefone (compara só dígitos)
  const { data: candidatos } = await wsupabase.from("leads").select("id, telefone, corretor_id, nome")
  const existente = (candidatos ?? []).find((l) => onlyDigits(l.telefone) === telefone)

  let leadId: string | null = existente?.id ?? null

  if (!existente) {
    // Caso A: novo lead
    const { data: novo, error } = await wsupabase
      .from("leads")
      .insert({
        nome,
        telefone,
        email: "",
        referencia_imovel: "",
        referencias: [],
        temperatura: "morno",
        origem: "WhatsApp",
        observacoes: "Lead recebido automaticamente via WhatsApp.",
        status: "novo",
        corretor_id: corretorId,
      })
      .select("id")
      .maybeSingle()
    if (error) {
      // Corrida: telefone já inserido em paralelo — trata como existente
      const { data: again } = await wsupabase.from("leads").select("id").eq("telefone", telefone).maybeSingle()
      leadId = again?.id ?? null
    } else {
      leadId = novo?.id ?? null
      await wsupabase.from("notificacoes").insert({
        mensagem: `Novo lead via WhatsApp: ${nome}`,
        tipo: "lead_novo",
        usuario_id: corretorId,
        para_role: "gestor",
        lead_id: leadId,
      })
    }
  } else if (existente.corretor_id && existente.corretor_id !== corretorId) {
    // Caso B: telefone já pertence a outro corretor
    await wsupabase.from("notificacoes").insert({
      mensagem: `Possível lead duplicado no WhatsApp: ${nome} já está com outro corretor.`,
      tipo: "possivel_duplicado",
      usuario_id: corretorId,
      para_role: "gestor",
      lead_id: existente.id,
    })
  }

  // Registra a mensagem recebida
  await wsupabase.from("whatsapp_mensagens").insert({
    instance_name: instanceName,
    telefone,
    nome_contato: nome,
    corpo,
    lead_id: leadId,
  })
}

export async function POST(request: Request) {
  try {
    // Se um segredo estiver configurado, exige-o na query ou header
    const secret = process.env.WHATSAPP_WEBHOOK_SECRET
    if (secret) {
      const url = new URL(request.url)
      const provided = url.searchParams.get("secret") ?? request.headers.get("x-webhook-secret")
      if (provided !== secret) return ok()
    }

    const payload = await request.json().catch(() => null)
    if (!payload) return ok()

    const event: string = payload.event ?? payload.type ?? ""
    if (event.includes("connection")) await handleConnectionUpdate(payload)
    else if (event.includes("messages")) await handleMessageUpsert(payload)

    return ok()
  } catch (error) {
    console.log("[v0] whatsapp webhook error:", error instanceof Error ? error.message : String(error))
    return ok()
  }
}
