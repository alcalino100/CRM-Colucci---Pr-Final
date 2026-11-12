// =============================================================================
// ia-coordination.ts — Semáforo e Coordenação entre IA e Automações de Leads
// =============================================================================

import { wsupabase } from "@/lib/whatsapp/server"
import { getRules } from "@/lib/ai/rules"
import { normalizePhone } from "@/lib/labels"
import { getTagsCatalog } from "@/lib/ai/tags-catalog"
import { createLog } from "@/lib/automation-services"

/**
 * Quando um agente IA está respondendo um lead (conversa IA ativa), o worker NÃO
 * cria follow-up/reativação para aquele lead — evita conflito entre IA e automação.
 */
export async function leadsComIAAtiva(): Promise<Set<string>> {
  const { data } = await wsupabase
    .from("conversations_ia")
    .select("contact_id,external_id")
    .eq("ai_responding", true)
    .neq("channel", "test")

  const set = new Set<string>()
  for (const r of (data || []) as { contact_id?: string; external_id?: string }[]) {
    if (r.contact_id) set.add(String(r.contact_id))
    // Conversas orgânicas usam o telefone como chave — inclui variações com/sem 55.
    if (r.external_id) {
      const d = String(r.external_id).replace(/\D/g, "")
      if (!d) continue
      set.add(d)
      set.add(d.startsWith("55") ? d.slice(2) : `55${d}`)
    }
  }
  return set
}

/**
 * Retorna true se o lead possui conversa IA ativa (por id do lead ou por telefone).
 */
export function leadTemIAAtiva(
  skipIA: Set<string> | null,
  lead: { id: string; telefone?: string | null }
): boolean {
  if (!skipIA) return false
  if (skipIA.has(lead.id)) return true
  const digits = String(lead.telefone || "").replace(/\D/g, "")
  if (digits && skipIA.has(digits)) return true
  const norm = normalizePhone(String(lead.telefone || ""))
  if (norm && skipIA.has(norm)) return true
  return false
}

/**
 * Retorna true se o worker deve respeitar o semáforo (pular leads com conversa IA ativa).
 */
export async function coordenarComIA(): Promise<boolean> {
  const { data: agentes } = await wsupabase.from("ai_agents").select("is_active,config")
  const ativos = (agentes || []).filter(
    (a: { is_active?: boolean; config?: unknown }) => a.is_active && getRules(a.config).enable
  )
  if (!ativos.length) return false
  return !ativos.every((a: { config?: unknown }) => getRules(a.config).coordination.paraleloComAutomacao)
}

/**
 * Tags marcadas como "Follow-up" no catálogo.
 */
export async function tagsDeFollowUp(): Promise<Set<string>> {
  try {
    const catalog = await getTagsCatalog(false)
    return new Set(catalog.tags.filter((t) => t.followUp).map((t) => t.name))
  } catch {
    return new Set()
  }
}

/**
 * Normaliza as tags do lead para array de strings minúsculas.
 */
export function tagsDoLead(referencias: unknown): string[] {
  if (!Array.isArray(referencias)) return []
  const out: string[] = []
  for (const r of referencias) {
    const v = typeof r === "string" ? r : (r as { ref?: unknown })?.ref ?? ""
    const s = String(v).trim().toLowerCase()
    if (s) out.push(s)
  }
  return out
}

/**
 * Auto-pausa conversas IA inativas há mais de 1 hora para liberar o semáforo de follow-up.
 */
export async function liberarConversasIAInativas(): Promise<number> {
  try {
    const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { data: presas } = await wsupabase
      .from("conversations_ia")
      .select("id")
      .eq("ai_responding", true)
      .neq("channel", "test")
      .lt("last_message_at", umaHoraAtras)
      .limit(300)

    if (!presas || presas.length === 0) return 0
    const ids = presas.map((c) => c.id)
    for (let i = 0; i < ids.length; i += 100) {
      await wsupabase.from("conversations_ia").update({ ai_responding: false }).in("id", ids.slice(i, i + 100))
    }
    await createLog({
      automation_id: null,
      event_type: "ia_inativa_auto_pausa",
      event_title: `Auto-pausa IA: ${ids.length} conversas liberadas para follow-up`,
      event_description: `Conversas sem resposta do lead há mais de 1h tiveram ai_responding desmarcado para permitir a régua D+1, D+2 e D+3.`,
    })
    return ids.length
  } catch {
    return 0
  }
}
