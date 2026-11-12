import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase/config"

let _inboxDb: SupabaseClient | null = null

export function db(): SupabaseClient {
  if (!_inboxDb) {
    _inboxDb = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false },
    })
  }
  return _inboxDb
}

export const normalize = (v: string): string => (v || "").toLowerCase().trim()

// Instâncias onde o pipeline é 100% manual: o lead NUNCA muda de etapa sozinho
// (nem novo→em_atendimento na resposta). Configurável via
// WHATSAPP_MANUAL_PIPELINE_INSTANCES (vírgula). Default: Brayon (não gosta do auto-move).
export const MANUAL_PIPELINE_INSTANCES = new Set<string>(
  (process.env.WHATSAPP_MANUAL_PIPELINE_INSTANCES || "brayon-22b51e92")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
)

// Chave da conversa IA de um contato: o lead vinculado quando existe, senão o
// telefone. É o que IMPEDE cruzamento entre contatos — cada remetente tem sua
// conversa, seu histórico e suas respostas. Nunca compartilhe/derive essa chave
// de outro dado (instância, agente, etc).
export function chaveConversa(leadIdEfetivo: string | undefined, telefone: string): string {
  return leadIdEfetivo || telefone
}

// Junta textos de uma rajada num bloco único (uma resposta só). Puro/testável.
export function juntarRajada(corpos: (string | null | undefined)[]): string {
  return corpos
    .map((c) => (c || "").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 2000)
}

// Estimativa de custo USD por 1k tokens (blend in/out; documentado como estimativa).
export function custoPor1k(modelo: string): number {
  const m = (modelo || "").toLowerCase()
  if (m.includes("gpt-4o-mini")) return 0.00015
  if (m.includes("gpt-4o")) return 0.0025
  if (m.includes("claude")) return 0.001
  if (m.includes("gemini")) return 0.0002
  return 0.0002
}

// Log visível de diagnóstico do teste/automação (Admin > Logs / automation_logs).
// Chamado SOMENTE em caminho de teste ou estágio de automação — nunca no
// tráfego normal dos corretores (sem spam de log).
export async function logIaDiagnostico({
  telefone,
  instanceName,
  leadId,
  evento,
  titulo,
  descricao,
}: {
  telefone: string
  instanceName?: string
  leadId?: string
  evento: string
  titulo: string
  descricao: string
}): Promise<void> {
  try {
    await db()
      .from("automation_logs")
      .insert({
        lead_id: leadId ?? null,
        event_type: evento,
        event_title: titulo,
        event_description: `${descricao} (tel ${telefone}${instanceName ? ` via ${instanceName}` : ""})`,
        actor_type: "ia",
      })
  } catch {
    /* best-effort */
  }
}

// Métrica por resposta (alimenta conversation_analytics → aba Analytics).
export async function registrarAnalytics(params: {
  convId: string
  aiId: string
  ms: number
  tokens: number
  modelo: string
  semEscalacao: boolean
}): Promise<void> {
  try {
    await db()
      .from("conversation_analytics")
      .insert({
        id: `an_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        conversation_id: params.convId,
        ai_id: params.aiId,
        resolved_without_escalation: params.semEscalacao,
        response_time_ms: Math.round(params.ms),
        user_satisfaction: null,
        api_cost_usd: Number(((params.tokens / 1000) * custoPor1k(params.modelo)).toFixed(6)),
        tokens_used: params.tokens,
      })
  } catch {
    /* analytics é best-effort */
  }
}

// Resumo da conversa IA gravado nas OBSERVAÇÕES do lead (mantém trilha da primeira
// linha/ações). Chamado quando a conversa pausa (limite, inatividade, virada manual).
export async function registrarResumoConversa(
  convId: string,
  leadId: string | undefined,
  motivo: string
): Promise<void> {
  if (!convId || !leadId) return
  try {
    const { data: history } = await db()
      .from("messages_ia")
      .select("role,content")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true })
      .limit(30)
    if (!history?.length) return
    const trecho = (history as { role: string; content: string }[])
      .slice(0, 14)
      .map((m) => `${m.role === "ai" ? "IA" : "Lead"}: ${String(m.content).slice(0, 160)}`)
      .join(" | ")
    const linha = `[Atendimento IA] ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} — ${motivo}. ${trecho}`
    const { data: lead } = await db()
      .from("leads")
      .select("observacoes")
      .eq("id", leadId)
      .maybeSingle()
    const obs = ((lead as { observacoes?: string })?.observacoes ?? "").trim()
    await db()
      .from("leads")
      .update({ observacoes: (obs ? `${obs}\n${linha}` : linha).slice(0, 6000) })
      .eq("id", leadId)
  } catch {
    /* best-effort */
  }
}

// Move o lead na pipeline conforme a conversa (novo → em_atendimento) quando o lead
// responde e a conversa é assumida (IA ou manual). Guarda de ranking: só muda de novo.
export async function moverLeadPipeline(leadId: string, para: string): Promise<void> {
  try {
    await db()
      .from("leads")
      .update({ status: para, atualizado_em: new Date().toISOString() })
      .eq("id", leadId)
      .eq("status", "novo")
  } catch {
    /* best-effort */
  }
}
