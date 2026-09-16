import { supabase } from "@/lib/supabase/client"
import { LEAD_STATUSES, STATUS_ACCENT, STATUS_LABEL, STATUS_VARIANT } from "@/lib/labels"
import type { LeadStatus } from "@/lib/mock-data"

// Fase 2 Master: etapas editáveis pelo painel com default idêntico ao código.
// Estratégia sem refactor: ao carregar, MUTAMOS os registros compartilhados
// (STATUS_LABEL/VARIANT/ACCENT + ordem/filtro de LEAD_STATUSES). Todas as telas
// passam a refletir sem nenhuma edição nelas. Chaves nunca mudam (automações).
export interface StageRow {
  key: string
  label: string
  variant: string
  accent: string
  ordem: number
  visivel_corretor: boolean
  ativo: boolean
}

// Etapas invisíveis ao corretor (default = comportamento atual do kanban).
// Mutável via banco; o kanban lê este Set em vez de literais.
export const CORRETOR_HIDDEN: Set<string> = new Set(["em_followup", "em_automacao", "atendimento_ia", "perdido"])

function isLeadStatus(k: string): k is LeadStatus {
  return (LEAD_STATUSES as string[]).includes(k)
}

// Aplica overrides do banco. Idempotente; falha silenciosa (mantém código).
export async function loadStagesOverride(): Promise<boolean> {
  try {
    const { data, error } = await supabase.from("pipeline_stages").select("*")
    if (error || !data) return false
    const rows = (data as StageRow[]).filter((r) => isLeadStatus(r.key))
    if (!rows.length) return false
    for (const r of rows) {
      const k = r.key as LeadStatus
      if (r.label) STATUS_LABEL[k] = r.label
      if (r.variant) STATUS_VARIANT[k] = r.variant
      if (r.accent) STATUS_ACCENT[k] = r.accent
    }
    const byKey = new Map(rows.map((r) => [r.key, r] as const))
    const ordenadas = [...LEAD_STATUSES].sort(
      (a, b) => (byKey.get(a)?.ordem ?? 99) - (byKey.get(b)?.ordem ?? 99),
    )
    const ativas = ordenadas.filter((s) => byKey.get(s)?.ativo !== false)
    LEAD_STATUSES.length = 0
    LEAD_STATUSES.push(...ativas)
    CORRETOR_HIDDEN.clear()
    for (const r of rows) if (!r.visivel_corretor) CORRETOR_HIDDEN.add(r.key)
    return true
  } catch {
    return false
  }
}

export async function listStages(): Promise<{ ok: boolean; rows: StageRow[]; faltaTabela: boolean }> {
  try {
    const { data, error } = await supabase.from("pipeline_stages").select("*").order("ordem")
    if (error) {
      const faltaTabela = String(error.message || "").toLowerCase().includes("does not exist")
        || String((error as { code?: string }).code || "") === "42P01"
      return { ok: false, rows: [], faltaTabela }
    }
    return { ok: true, rows: (data ?? []) as StageRow[], faltaTabela: false }
  } catch {
    return { ok: false, rows: [], faltaTabela: false }
  }
}

export async function saveStage(row: StageRow): Promise<{ ok: boolean; erro?: string }> {
  try {
    const { error } = await supabase.from("pipeline_stages").update({
      label: row.label,
      variant: row.variant,
      accent: row.accent,
      ordem: row.ordem,
      visivel_corretor: row.visivel_corretor,
      ativo: row.ativo,
      updated_at: new Date().toISOString(),
    }).eq("key", row.key)
    if (error) throw new Error(error.message)
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}
