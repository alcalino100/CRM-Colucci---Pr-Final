import { db } from "./inbox-common"

// Tools de agenda expostas à IA (quando rules.coordination.agendarVisitas).
export const AGENDA_TOOLS = [
  {
    name: "consultar_disponibilidade",
    description:
      "Consulta os horários livres da agenda (blocos de 30min, seg–sex 08–18h). Chame SEMPRE antes de sugerir data/horário. Retorna dias (AAAA-MM-DD) com horários livres.",
    input_schema: {
      type: "object",
      properties: {
        dias: {
          type: "number",
          description: "Quantos dias úteis à frente (1-10, padrão 5)",
        },
      },
    },
  },
  {
    name: "agendar_reuniao",
    description:
      "Marca a reunião (ou REMARCA se o lead já tiver visita futura — nunca duplica). Chame somente após o lead confirmar dia e horário. Data em AAAA-MM-DD, horário HH:MM.",
    input_schema: {
      type: "object",
      properties: {
        data: { type: "string", description: "Data em AAAA-MM-DD" },
        horario: { type: "string", description: "Horário HH:MM (ex.: 09:30)" },
      },
      required: ["data", "horario"],
    },
  },
]

export function suplementoAgendaHoje(): string {
  const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
  return [
    `[AGENDAMENTO — leia com atenção] Hoje é ${agora} (America/Sao_Paulo).`,
    "Você agenda reuniões de qualificação (30min, seg–sex 08–18h).",
    "REGRA DE OURO: NUNCA invente data/horário. SEMPRE chame consultar_disponibilidade antes de sugerir, ofereça 2-3 opções reais, e SÓ chame agendar_reuniao depois que o lead confirmar dia e horário.",
    "Se o lead pedir outra data/horário, consulte de novo e, ao confirmar, chame agendar_reuniao (ela remarca sozinha se já houver visita — avise isso ao lead).",
    "Após agendar, confirme data/hora por extenso na resposta.",
    "NUNCA prometa link de reunião (não há integração de agenda externa): confirme dia e data por extenso e diga que os detalhes chegam por aqui.",
  ].join("\n")
}

// Janela de memória da conversa: ÚLTIMAS 30 mensagens (ordem cronológica).
// 10 era pouco para qualificação (o lead repete dados e a IA "esquecia").
// Custo: ~2-4k tokens extras por resposta (fração de centavo).
export const HISTORICO_LIMITE = 30

// Metas ativas do agente injetadas no prompt (só tipos estruturados; legados
// "goal" fragmentados são ignorados para não poluir o contexto).
export async function metasAtivasParaPrompt(aiId: string): Promise<string> {
  try {
    const { data } = await db()
      .from("goals")
      .select("name,type,description,questions,prompt,config")
      .eq("ai_id", aiId)
      .eq("is_active", true)
      .in("type", ["qualification", "booking", "info", "custom"])
      .order("created_at", { ascending: true })
      .limit(10)
    const goals = (
      (data ?? []) as {
        name: string
        type: string
        description: string
        questions: unknown
        prompt: string
        config: { success_criteria?: unknown; next_step?: string; fallback?: string } | null
      }[]
    )
      .filter((g) => g.prompt && String(g.prompt).trim().length >= 10)
      .slice(0, 6)
    if (!goals.length) return ""
    const linhas = goals.map((g, i) => {
      const cfg = g.config ?? {}
      const qs =
        Array.isArray(g.questions) && g.questions.length
          ? ` Perguntas: ${(g.questions as string[]).join(" | ")}.`
          : ""
      const sc = cfg.success_criteria ? ` Sucesso: ${JSON.stringify(cfg.success_criteria)}.` : ""
      const nx = cfg.next_step ? ` Depois: ${cfg.next_step}.` : ""
      const fb = cfg.fallback ? ` Se falhar: ${cfg.fallback}.` : ""
      return `${i + 1}. ${g.name} (${g.type}): ${g.description || ""} Conduta: ${String(g.prompt).trim()}.${qs}${sc}${nx}${fb}`
    })
    return ["[METAS ATIVAS — siga nesta ordem; conclua uma antes de avançar]", ...linhas].join("\n")
  } catch {
    return ""
  }
}
