import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"
import { sendWhatsAppText } from "@/lib/whatsapp/server"
import { generateAIResponse } from "@/lib/ai/generateResponse"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

// Resumo diário das automações para o gestor (Kleber), todo dia útil às 18h BRT.
// Texto gerado pela IA (Claude) com os números do dia; enviado pela Patricia.
// Cron: "0 21 * * 1-5" (21h UTC = 18h BRT, sem horário de verão).
const TELEFONE_GESTOR = "5518991975661"
const INSTANCIA_ENVIO = "patricia-6c2875b4"
const AI_ID = "ai_patricia_01"

// 00:00 BRT de hoje em ISO (BRT = UTC-3 fixo).
function inicioDiaBRT(d = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
  const [y, m, day] = fmt.format(d).split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, day, 3, 0, 0)).toISOString()
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const dry = url.searchParams.get("dry") === "1"
  // Prévia (dry) é só leitura de agregados — liberada sem segredo.
  // O envio real exige CRON_SECRET.
  const secret = process.env.CRON_SECRET
  if (secret && !dry) {
    const auth = request.headers.get("authorization")
    const qs = url.searchParams.get("secret")
    const ok = auth === `Bearer ${secret}` || qs === secret
    if (!ok) return NextResponse.json({ ok: false, erro: "não autorizado" }, { status: 401 })
  }

  const ini = inicioDiaBRT()
  const fim = new Date(new Date(ini).getTime() + 86400000).toISOString()

  // Contagens server-side por evento (nunca baixa linhas: em dia cheio o
  // limit cortava a noite e zerava métricas — foi o bug do "nada atendido").
  const conta = async (ev: string): Promise<number> => {
    const r = await wsupabase.from("automation_logs").select("id", { count: "exact", head: true }).eq("event_type", ev).gte("created_at", ini).lt("created_at", fim)
    return (r as { count: number | null }).count ?? 0
  }
  const [nEnv, nResp, anal, fila, viraramIA, handoffs, triagens, reativacoes, respIA] = await Promise.all([
    wsupabase.from("automation_jobs").select("id", { count: "exact", head: true }).gte("sent_at", ini).lt("sent_at", fim),
    wsupabase.from("automation_jobs").select("id", { count: "exact", head: true }).gte("responded_at", ini).lt("responded_at", fim),
    wsupabase.from("conversation_analytics").select("tokens_used,api_cost_usd").gte("created_at", ini).lt("created_at", fim).limit(5000),
    wsupabase.from("automation_jobs").select("id", { count: "exact", head: true }).in("status", ["scheduled", "retrying"]),
    conta("lead_respondeu_atendimento_ia"),
    conta("ia_handoff_humano"),
    conta("lead_followup_sem_resposta_triagem"),
    conta("lead_reativado_trafego_pago_reativacao_base"),
    conta("ia_resposta_enviada"),
  ])
  const enviadas = (nEnv as { count: number | null }).count ?? 0
  const respondidas = (nResp as { count: number | null }).count ?? 0
  const A = ((anal.data ?? []) as { tokens_used: number | null; api_cost_usd: number | null }[])
  const tokens = A.reduce((s, a) => s + (a.tokens_used ?? 0), 0)
  const custo = A.reduce((s, a) => s + Number(a.api_cost_usd ?? 0), 0)
  const taxaIA = respondidas ? Math.round((viraramIA / respondidas) * 1000) / 10 : 0
  const taxaResp = enviadas ? Math.round((respondidas / enviadas) * 1000) / 10 : 0
  const naFila = (fila as { count: number | null }).count ?? 0
  const dataBR = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })

  const dados = [
    `Data: ${dataBR}`,
    `Mensagens enviadas (reativação+follow-up): ${enviadas}`,
    `Leads que responderam: ${respondidas} (taxa de resposta ${taxaResp}%)`,
    `Respostas da IA no WhatsApp: ${respIA} (viraram Atendimento IA: ${viraramIA}, taxa ${taxaIA}%)`,
    `Entraram em automação hoje: ${reativacoes}`,
    `Handoffs para humano: ${handoffs} | Triagens humanas: ${triagens}`,
    `Tokens IA gastos: ${tokens.toLocaleString("pt-BR")} (~US$ ${custo.toFixed(4)})`,
    `Leads na fila de envio agora: ${naFila}`,
  ].join("\n")

  let texto = ""
  try {
    const { message } = await generateAIResponse({
      aiId: AI_ID,
      userMessage: `Gere o resumo diário do CRM para o gestor Kleber, em português, direto e animador, formato WhatsApp (curto, com 2-4 emojis no máximo, sem asteriscos excessivos). Dados de hoje:\n${dados}`,
      conversationHistory: [],
      regrasSuplementares: "Resposta com no máximo 12 linhas. Comece com 'Resumo do dia'. Feche com 1 insight ou alerta (ex.: fila alta, taxa baixa).",
    })
    texto = message.trim().slice(0, 1500)
  } catch { /* fallback abaixo */ }
  if (!texto) {
    texto = `Resumo do dia ${dataBR}:\n${dados
      .split("\n")
      .slice(1)
      .map((l) => `• ${l}`)
      .join("\n")}`
  }

  if (!dry) {
    const env = await sendWhatsAppText(INSTANCIA_ENVIO, TELEFONE_GESTOR, texto)
    try {
      await wsupabase.from("automation_logs").insert({
        event_type: "resumo_diario_enviado",
        event_title: `Resumo diário enviado ao gestor (${dataBR})`,
        event_description: env.ok ? `Enviado via ${INSTANCIA_ENVIO}.` : `FALHA no envio: ${env.erro}`,
        actor_type: "ia",
      })
    } catch { /* best-effort */ }
    if (!env.ok) return NextResponse.json({ ok: false, erro: env.erro }, { status: 500 })
  }
  return NextResponse.json({ ok: true, dry, texto })
}
