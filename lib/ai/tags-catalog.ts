import { wsupabase } from "@/lib/whatsapp/server"

// =============================================================================
// Catálogo central de TAGS do CRM.
//
// Sem acesso a DDL/novas tabelas, o catálogo vive no `config` jsonb do agente
// de IA ATIVO (master). Ele é a fonte única de tags usada pelo Inbox, Kanban,
// Follow-ups e IA conversacional. O catálogo é SEMPRE a união de:
//   - tags configuradas (nome + cor + comportamento IA/follow-up) no agente master
//   - todas as tags em uso nos leads (leads.referencias[].ref)
// Assim, tags que já existem em qualquer lead aparecem mesmo sem configurar nada.
// =============================================================================

export type TagDef = {
  name: string
  color?: string
  responderIA?: boolean
  followUp?: boolean
}

export type TagCatalog = {
  tags: (TagDef & { emUso: number })[]
  masterAgentId: string | null
  totalLeads: number
}

const PALETA = ["#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#3b82f6", "#84cc16", "#f97316", "#14b8a6"]

// Cor determinística e estável por nome (mesma cor aparece no Kanban, Inbox e painel).
export function tagColor(name: string): string {
  let h = 0
  const s = (name ?? "").trim().toLowerCase()
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return PALETA[h % PALETA.length]
}

function parseConfig(cfg: unknown): Record<string, unknown> {
  if (!cfg) return {}
  if (typeof cfg === "string") {
    try { return JSON.parse(cfg) } catch { return {} }
  }
  return cfg as Record<string, unknown>
}

function parseCatalog(raw: unknown): TagDef[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((t) => t && typeof t === "object" && typeof (t as any).name === "string" && String((t as any).name).trim())
    .map((t) => ({
      name: String((t as any).name).trim().toLowerCase(),
      color: typeof (t as any).color === "string" ? (t as any).color : undefined,
      responderIA: Boolean((t as any).responderIA),
      followUp: Boolean((t as any).followUp),
    }))
}

// Encontra o agente "master": primeiro ativo; senão o primeiro da lista.
async function getMasterAgentId(): Promise<string | null> {
  const { data } = await wsupabase.from("ai_agents").select("id, is_active").order("updated_at", { ascending: false })
  if (!data || !data.length) return null
  return (data.find((a: any) => a.is_active) ?? data[0]).id
}

function normalizeTagRefs(referencias: unknown): string[] {
  if (!Array.isArray(referencias)) return []
  const out: string[] = []
  for (const r of referencias) {
    const v = typeof r === "string" ? r : (r as any)?.ref ?? ""
    const s = String(v).trim().toLowerCase()
    if (s) out.push(s)
  }
  return out
}

// Retorna o catálogo completo (configurado + em uso nos leads), com contagem de uso.
export async function getTagsCatalog(deparaCount = true): Promise<TagCatalog> {
  const masterAgentId = await getMasterAgentId()

  let configuradas: TagDef[] = []
  if (masterAgentId) {
    const { data } = await wsupabase.from("ai_agents").select("config").eq("id", masterAgentId).maybeSingle()
    configuradas = parseCatalog(parseConfig(data?.config as any).tagsCatalog)
  }

  // Coleta tags em uso em todos os leads.
  const emUso = new Map<string, number>()
  let totalLeads = 0
  if (deparaCount) {
    const { data: leads } = await wsupabase.from("leads").select("referencias").limit(20000)
    for (const l of leads ?? []) {
      totalLeads++
      for (const t of normalizeTagRefs(l.referencias)) {
        emUso.set(t, (emUso.get(t) ?? 0) + 1)
      }
    }
  }

  // Merge: configuração tem prioridade; tags apenas em uso ganham default e aparecem.
  const nomes = new Set<string>()
  const merged: (TagDef & { emUso: number })[] = []
  for (const c of configuradas) {
    nomes.add(c.name)
    merged.push({ ...c, color: c.color || tagColor(c.name), emUso: emUso.get(c.name) ?? 0 })
  }
  for (const [name, count] of Array.from(emUso.entries()).sort()) {
    if (nomes.has(name)) continue
    nomes.add(name)
    merged.push({ name, color: tagColor(name), emUso: count })
  }

  return { tags: merged, masterAgentId, totalLeads }
}

// Persiste o catálogo no config do agente master (preservando demais chaves do config).
export async function saveTagsCatalog(tags: TagDef[]): Promise<{ ok: boolean; error?: string }> {
  const masterAgentId = await getMasterAgentId()
  if (!masterAgentId) return { ok: false, error: "Nenhum agente de IA encontrado para guardar o catálogo." }
  const { data } = await wsupabase.from("ai_agents").select("config").eq("id", masterAgentId).maybeSingle()
  const cfg = parseConfig(data?.config as any)
  cfg.tagsCatalog = tags
  const { error } = await wsupabase.from("ai_agents").update({ config: cfg, updated_at: new Date().toISOString() }).eq("id", masterAgentId)
  if (error) return { ok: false, error: error.message }
  try {
    await wsupabase.from("automation_logs").insert({
      event_type: "ia_config_alterada",
      event_title: "Catálogo de tags atualizado",
      event_description: `Catálogo de tags do agente ${masterAgentId} atualizado no painel (${tags.length} tag(s)).`,
      actor_type: "gestor",
    })
  } catch { /* auditoria é best-effort */ }
  return { ok: true }
}