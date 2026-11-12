import { normalizePhone } from "@/lib/labels"
import { getBoundInstances, getRules } from "./rules"
import { db } from "./inbox-common"
import { AI_AGENTS_COLUMNS } from "@/lib/supabase/projections"

export interface AiAgentRecord {
  id: string
  name: string
  is_active: boolean
  config: unknown
  model_name?: string
  wait_time_ms?: number | null
  message_cap?: number | null
  response_mode?: string | null
  [key: string]: unknown
}

// Resolve a IA que responde numa instância. REGRA DE OURO: a instância precisa estar
// vinculada a um agente (config.testInstance ou whitelistInstances) E o agente precisa
// estar ATIVO (is_active) com regras habilitadas (rules.enable). Sem isso, não responde NUNCA.
export async function agenteParaInstancia(instanceName: string | undefined): Promise<AiAgentRecord | null> {
  if (!instanceName) return null
  const { data: agentes, error } = await db().from("ai_agents").select(AI_AGENTS_COLUMNS)
  if (error || !agentes?.length) return null
  const ativos = (agentes as AiAgentRecord[]).filter((a) => a.is_active && getRules(a.config).enable)
  return ativos.find((a) => getBoundInstances(a.config).includes(instanceName)) || null
}

// Agente cujo numeroTeste contém o telefone (ativo + regras habilitadas).
// Base do fallback de teste e do diagnóstico visível.
export async function agenteParaNumeroTeste(telefone: string | undefined): Promise<AiAgentRecord | null> {
  if (!telefone) return null
  const alvo = normalizePhone(telefone)
  if (!alvo) return null
  try {
    const { data: agentes, error } = await db().from("ai_agents").select(AI_AGENTS_COLUMNS)
    if (error || !agentes?.length) return null
    const ativos = (agentes as AiAgentRecord[]).filter((a) => a.is_active && getRules(a.config).enable)
    return (
      ativos.find((a) =>
        (getRules(a.config).target.numeroTeste || []).some(
          (n) => normalizePhone(String(n || "")) === alvo
        )
      ) || null
    )
  } catch {
    return null
  }
}

// Número de teste de algum agente ATIVO (com regras habilitadas)? Comparação
// normalizada (com/sem 55) para aceitar "18991502791" e "5518991502791" igual.
// Usado pelo webhook para NÃO descartar mensagens de teste vindas de números
// internos bloqueados — sem isso, testar o bot com o próprio time é impossível.
export async function isNumeroTesteIA(telefone: string | undefined): Promise<boolean> {
  if (!telefone) return false
  const alvo = normalizePhone(telefone)
  if (!alvo) return false
  try {
    const { data: agentes } = await db().from("ai_agents").select("config,is_active")
    return ((agentes ?? []) as { config?: unknown; is_active?: boolean }[]).some((a) => {
      if (!a?.is_active || !getRules(a.config).enable) return false
      const lista: string[] = getRules(a.config).target.numeroTeste || []
      return lista.some((n) => normalizePhone(String(n || "")) === alvo)
    })
  } catch {
    return false
  }
}

// Acha o lead cujo telefone bate com o contato (mesmo corretor da instância quando possível).
// Busca por variantes no BANCO (ilike) — varredura total quebra acima de 1000 leads.
export async function acharLeadVinculado(
  telefone: string | undefined,
  instanceName: string | undefined
): Promise<{ id: string; telefone: string; origem?: string; status?: string; corretor_id?: string; referencias?: unknown } | null> {
  if (!telefone) return null
  const digits = telefone.replace(/\D/g, "")
  if (!digits) return null
  const variantes = Array.from(new Set([digits, digits.startsWith("55") ? digits.slice(2) : `55${digits}`]))
  const { data: candidatos } = await db()
    .from("leads")
    .select("id, telefone, origem, status, corretor_id, referencias")
    .or(variantes.map((v) => `telefone.ilike.%${v}%`).join(","))
    .limit(20)

  // Família do agente: 1 operação pode ter N números (ex. Patricia + patricia2).
  // Expande os donos aceitos para todas as instâncias vinculadas ao MESMO agente —
  // assim o lead é vinculado pelo telefone em qualquer número da família.
  // Com 1 instância por agente, comporta-se exatamente como antes (zero impacto).
  let corretorIds: Set<string> | null = null
  if (instanceName) {
    const instancia = (
      await db()
        .from("whatsapp_instancias")
        .select("corretor_id")
        .eq("instance_name", instanceName)
        .maybeSingle()
    ).data as { corretor_id?: string | null } | null
    const proprio = instancia?.corretor_id ?? null
    try {
      const agente = await agenteParaInstancia(instanceName)
      const vinculadas: string[] = agente ? getBoundInstances(agente.config) : []
      if (agente && vinculadas.length > 1) {
        const { data: irmas } = await db()
          .from("whatsapp_instancias")
          .select("corretor_id")
          .in("instance_name", vinculadas)
        const ids = [
          proprio,
          ...(((irmas ?? []) as { corretor_id?: string | null }[]).map((r) => r.corretor_id)),
        ].filter(Boolean) as string[]
        if (ids.length) corretorIds = new Set(ids)
      }
    } catch {
      /* fallback abaixo */
    }
    if (!corretorIds && proprio) corretorIds = new Set([proprio])
  }

  const lista = (candidatos ?? []) as {
    id: string
    telefone: string
    origem?: string
    status?: string
    corretor_id?: string
    referencias?: unknown
  }[]

  return (
    lista
      .filter((l) => !corretorIds || !l.corretor_id || corretorIds.has(l.corretor_id))
      .find((l) => normalizePhone(l.telefone) === normalizePhone(telefone)) ?? null
  )
}
