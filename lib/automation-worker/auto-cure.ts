// =============================================================================
// auto-cure.ts — Rotinas de Auto-Cura e Manutenção da Fila de Automações
// =============================================================================

import { wsupabase } from "@/lib/whatsapp/server"
import { createLog } from "@/lib/automation-services"

/**
 * Auto-cura: jobs presos em "processing" (rodada morta no meio) voltam à
 * fila se travados há +30min. Sem isso acumulam para sempre e a fila morre.
 * Restaura também configurações zeradas fora do app.
 */
export async function executarAutoCura(): Promise<void> {
  try {
    const limite = new Date(Date.now() - 30 * 60000).toISOString()
    const { data: presos } = await wsupabase
      .from("automation_jobs")
      .select("id")
      .eq("status", "processing")
      .lt("processing_started_at", limite)
      .limit(500)

    const ids = ((presos ?? []) as { id: string }[]).map((j) => j.id)
    if (ids.length) {
      for (let i = 0; i < ids.length; i += 100) {
        await wsupabase.from("automation_jobs").update({ status: "scheduled" }).in("id", ids.slice(i, i + 100))
      }
      await createLog({
        automation_id: null,
        event_type: "worker_presos_liberados",
        event_title: `Jobs presos liberados (${ids.length})`,
        event_description: "Voltaram para scheduled; saem nas próximas rodadas.",
      })
    }

    // Conexão zerada fora do app? Restaura para a instância da IA (Patricia).
    const { data: autosCfg } = await wsupabase
      .from("automations")
      .select("id,name,whatsapp_connection_id,trigger_type,trigger_config")
      .is("deleted_at", null)

    const { data: instsCfg } = await wsupabase.from("whatsapp_instancias").select("id,instance_name")
    const patri = ((instsCfg ?? []) as { id: string; instance_name: string }[]).find((x) =>
      x.instance_name.toLowerCase().startsWith("patricia")
    )
    const mae = ((autosCfg ?? []) as { id: string; trigger_type: string }[]).find(
      (a) => a.trigger_type === "lead_inactive"
    )

    for (const a of ((autosCfg ?? []) as {
      id: string
      name: string
      whatsapp_connection_id: string | null
      trigger_type: string
      trigger_config: Record<string, unknown> | null
    }[])) {
      const patch: Record<string, unknown> = {}
      if (!a.whatsapp_connection_id && patri) patch.whatsapp_connection_id = patri.id
      if (a.trigger_type === "no_response_followup") {
        const cfg = a.trigger_config ?? {}
        if (!cfg.parent_automation_id && mae) {
          patch.trigger_config = {
            ...cfg,
            parent_automation_id: mae.id,
            no_response_hours: (cfg.no_response_hours as number | undefined) ?? 24,
          }
        }
      }
      if (Object.keys(patch).length > 0) {
        await wsupabase.from("automations").update(patch).eq("id", a.id)
        await createLog({
          automation_id: a.id,
          event_type: "worker_config_restaurada",
          event_title: `Config restaurada sozinha: ${a.name}`,
          event_description: `Campos zerados fora do app foram recompostos (${Object.keys(patch).join(", ")}).`,
        })
      }
    }
  } catch {
    /* auto-cura nunca derruba a rodada */
  }
}
