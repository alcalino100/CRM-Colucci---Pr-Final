import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"
import { generateAIResponse } from "./generateResponse"

function db() {
  return createClient(SUPABASE_URL, SUPABASE_KEY)
}

export type Qualificacao = {
  imovel_interesse: string
  faixa_valor: string
  regiao: string
  tipo_imovel: string
  forma_pagamento: string
  prazo: string
  pontos_positivos: string[]
  pontos_negativos: string[]
  resumo: string
  pronto_para_humano: boolean
}

const VAZIA: Qualificacao = {
  imovel_interesse: "",
  faixa_valor: "",
  regiao: "",
  tipo_imovel: "",
  forma_pagamento: "",
  prazo: "",
  pontos_positivos: [],
  pontos_negativos: [],
  resumo: "",
  pronto_para_humano: false,
}

// Extrai a qualificação da conversa via LLM (tolerante: cerca JSON, fallback null).
export async function extrairQualificacao(
  aiId: string,
  history: { role: string; content: string }[],
): Promise<Qualificacao | null> {
  try {
    const ultimas = history.slice(-20)
    if (!ultimas.length) return null
    const { message } = await generateAIResponse({
      aiId,
      userMessage:
        "TAREFA INTERNA (não é mensagem para o cliente): analise o histórico e retorne SOMENTE um JSON válido, sem cercas de código, com as chaves: " +
        '{"imovel_interesse":"","faixa_valor":"","regiao":"","tipo_imovel":"","forma_pagamento":"","prazo":"","pontos_positivos":[],"pontos_negativos":[],"resumo":"","pronto_para_humano":true}. ' +
        "Preencha com o que foi apurado (string vazia/[] quando não houver). " +
        "pontos_negativos = objeções, pendências e o que o lead NÃO quer. " +
        "resumo = 1 linha para o corretor continuar. pronto_para_humano = true se já dá para atender.",
      conversationHistory: ultimas,
      regrasSuplementares: "Responda SOMENTE com o JSON. Nada além disso.",
    })
    const ini = message.indexOf("{")
    const fim = message.lastIndexOf("}")
    if (ini < 0 || fim <= ini) return null
    const obj = JSON.parse(message.slice(ini, fim + 1)) as Partial<Qualificacao>
    return {
      imovel_interesse: String(obj.imovel_interesse ?? ""),
      faixa_valor: String(obj.faixa_valor ?? ""),
      regiao: String(obj.regiao ?? ""),
      tipo_imovel: String(obj.tipo_imovel ?? ""),
      forma_pagamento: String(obj.forma_pagamento ?? ""),
      prazo: String(obj.prazo ?? ""),
      pontos_positivos: Array.isArray(obj.pontos_positivos) ? obj.pontos_positivos.map(String) : [],
      pontos_negativos: Array.isArray(obj.pontos_negativos) ? obj.pontos_negativos.map(String) : [],
      resumo: String(obj.resumo ?? ""),
      pronto_para_humano: obj.pronto_para_humano === true,
    }
  } catch {
    return null
  }
}

function dataBR(): string {
  return new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
}

// Bloco legível para as observações do lead (olhou, entendeu, atendeu).
export function blocoQualificacao(q: Qualificacao | null, motivo: string): string {
  const cab = `[QUALIFICAÇÃO IA — ${dataBR()}] ${motivo}`
  if (!q) return `${cab}\nExtração indisponível — ver histórico da conversa.`
  const L = (rot: string, v: string) => (v ? `${rot}: ${v}` : "")
  const linhas = [
    cab,
    L("Imóvel de interesse", q.imovel_interesse),
    `Valor: ${q.faixa_valor || "—"} | Região: ${q.regiao || "—"} | Tipo: ${q.tipo_imovel || "—"}`,
    `Pagamento: ${q.forma_pagamento || "—"} | Prazo: ${q.prazo || "—"}`,
    q.pontos_positivos.length ? `Pontos positivos: ${q.pontos_positivos.join("; ")}` : "",
    q.pontos_negativos.length ? `Pontos negativos/pendências: ${q.pontos_negativos.join("; ")}` : "",
    q.resumo ? `Resumo: ${q.resumo}` : "",
  ].filter(Boolean)
  return linhas.join("\n")
}

// Resolve quem deve ser notificado: corretor do lead, senão dono da instância.
async function responsavelHandoff(leadId: string, instanceName?: string): Promise<string | null> {
  try {
    const { data: lead } = await db().from("leads").select("corretor_id").eq("id", leadId).maybeSingle()
    const c = (lead as { corretor_id?: string } | null)?.corretor_id
    if (c) return c
    if (instanceName) {
      const { data: inst } = await db().from("whatsapp_instancias").select("corretor_id").eq("instance_name", instanceName).maybeSingle()
      const dono = (inst as { corretor_id?: string } | null)?.corretor_id
      if (dono) return dono
    }
  } catch { /* best-effort */ }
  return null
}

// Handoff completo: resumo nas observações + etapa Atendimento Humano + notificação.
// Idempotente por evento (cada chamada = um marco); observações limitadas a 6000 chars.
export async function finalizarParaHumano(params: {
  leadId: string
  convId: string
  aiId: string
  motivo: string
  triggerName?: string
  telefone: string
  instanceName?: string
}): Promise<void> {
  const { leadId, convId, aiId, motivo, triggerName, telefone, instanceName } = params
  try {
    const { data: history } = await db()
      .from("messages_ia")
      .select("role,content")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true })
      .limit(30)
    const hist = ((history ?? []) as { role: string; content: string }[]).map((m) => ({ role: m.role, content: m.content }))
    const q = hist.length ? await extrairQualificacao(aiId, hist) : null
    const bloco = blocoQualificacao(q, triggerName ? `${motivo} (${triggerName})` : motivo)

    const { data: lead } = await db().from("leads").select("nome,observacoes,status").eq("id", leadId).maybeSingle()
    const l = lead as { nome?: string; observacoes?: string; status?: string } | null
    if (!l) return
    const obs = `${(l.observacoes ?? "").trim()}\n${bloco}`.trim().slice(-6000)
    const patch: Record<string, unknown> = { observacoes: obs, atualizado_em: new Date().toISOString() }
    if (["novo", "em_atendimento", "em_followup"].includes(String(l.status || ""))) {
      patch.status = "atendimento_humano"
    }
    await db().from("leads").update(patch).eq("id", leadId)

    const responsavel = await responsavelHandoff(leadId, instanceName)
    const nome = l.nome || telefone
    const umaLinha = q?.resumo || motivo
    try {
      await db().from("notificacoes").insert({
        mensagem: `🤝 Lead qualificado pela IA: ${nome} — ${umaLinha} → etapa Atendimento Humano. Ver observações.`,
        tipo: "handoff_ia",
        modulo: "vendas",
        usuario_id: responsavel,
        para_role: responsavel ? null : "gestor",
        para_usuario_id: responsavel,
        lead_id: leadId,
      })
    } catch { /* notificação é best-effort */ }

    try {
      await db().from("automation_logs").insert({
        lead_id: leadId,
        event_type: "ia_handoff_humano",
        event_title: `Lead entregue ao atendimento humano (${nome})`,
        event_description: `${motivo}${triggerName ? ` (${triggerName})` : ""} → etapa Atendimento Humano${responsavel ? "" : " (sem responsável resolvido)"}.`,
        actor_type: "ia",
        payload: JSON.stringify({ convId, instance: instanceName, responsavel }).slice(0, 400),
      })
    } catch { /* log é best-effort */ }
  } catch (e) {
    console.error("[IA] erro finalizarParaHumano", e)
  }
}

export { VAZIA as QUALIFICACAO_VAZIA }
