// =============================================================================
// dispatcher-helpers.ts — Helpers de Supervisão, Saúde de Conexões e Auditoria
// =============================================================================

import { wsupabase } from "@/lib/whatsapp/server"
import { createLog } from "@/lib/automation-services"
import type { AutomationJob } from "@/lib/automation-types"

/**
 * Verifica a saúde das conexões WhatsApp e filtra fora jobs cujas instâncias estão caídas.
 */
export async function filtrarJobsComInstanciasConectadas(
  jobs: AutomationJob[],
  automations: any[]
): Promise<AutomationJob[]> {
  try {
    const { data: insts } = await wsupabase.from("whatsapp_instancias").select("id,instance_name")
    const nomePorId = new Map(
      ((insts ?? []) as { id: string; instance_name: string }[]).map((i) => [i.id, i.instance_name])
    )
    const saude = new Map<string, boolean>()

    const checar = async (instanceName: string): Promise<boolean> => {
      try {
        const { evolutionConfig } = await import("@/lib/whatsapp/server")
        const cfg = evolutionConfig()
        if (!cfg.ok) return false
        const res = await fetch(`${cfg.url}/instance/connectionState/${encodeURIComponent(instanceName)}`, {
          headers: { apikey: cfg.key },
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) return false
        const j = await res.json().catch(() => null)
        return (j as { instance?: { state?: string } } | null)?.instance?.state === "open"
      } catch {
        return false
      }
    }

    const antes = jobs.length
    const idsBloqueados = new Set<string>()

    for (const job of jobs) {
      const automation = automations.find((a) => a.id === job.automation_id)
      const inst = automation?.whatsapp_connection_id
        ? nomePorId.get(automation.whatsapp_connection_id)
        : undefined
      if (!inst) continue
      if (!saude.has(inst)) saude.set(inst, await checar(inst))
      if (!saude.get(inst)) idsBloqueados.add(job.id)
    }

    if (idsBloqueados.size > 0) {
      const filtrados = jobs.filter((j) => !idsBloqueados.has(j.id))
      await createLog({
        automation_id: null,
        event_type: "worker_instancia_morta",
        event_title: "Instância desconectada — envios pausados",
        event_description: `Sem envio nesta rodada: instância(s) fora do ar. ${idsBloqueados.size} job(s) mantidos em fila (de ${antes}). Retoma sozinho ao reconectar.`,
      })
      return filtrados
    }

    if (antes > 0) {
      const { data: rec } = await wsupabase
        .from("automation_logs")
        .select("id")
        .eq("event_type", "worker_instancia_morta")
        .gte("created_at", new Date(Date.now() - 48 * 3600000).toISOString())
        .limit(1)
      if ((rec ?? []).length > 0) {
        await createLog({
          automation_id: null,
          event_type: "worker_instancia_volto",
          event_title: "Instância reconectada — retomando fila",
          event_description: `Conexão OK. ${antes} job(s) na fila serão processados nas próximas rodadas (respeitando teto e espaçamento).`,
        })
      }
    }

    return jobs
  } catch {
    return jobs
  }
}

/**
 * Aplica a supervisão do gestor sobre o lead após envio com sucesso, caso habilitada na regra.
 */
export async function aplicarSupervisaoGestor(
  automation: any,
  lead: any,
  job: AutomationJob,
  isContencao: boolean,
  updateData: Record<string, unknown>
): Promise<void> {
  if (!automation.supervision_enabled || !automation.supervisor_user_id) return

  const isFollowupAutomation = automation.trigger_type === "no_response_followup"
  const supervisionUpdate: Record<string, unknown> = {
    gestor_responsavel: automation.supervisor_user_id,
  }
  const estagioMaquina = ["em_automacao", "atendimento_ia", "em_followup"].includes(
    String((lead as { status?: unknown }).status ?? "")
  )
  if (!isFollowupAutomation && !estagioMaquina && !isContencao) {
    supervisionUpdate.status = "em_atendimento"
  }

  const { error: supErr } = await wsupabase
    .from("leads")
    .update(supervisionUpdate)
    .eq("id", job.lead_id)

  if (supErr) {
    updateData.supervision_status = "failed"
    updateData.supervision_error = supErr.message
    return
  }

  updateData.supervision_status = "applied"
  updateData.supervision_applied_at = new Date().toISOString()

  if (automation.create_automatic_note) {
    const noteText = (automation.automatic_note_template ?? "")
      .replaceAll("{{nome_automacao}}", automation.name)
      .replaceAll(
        "{{data_atual}}",
        new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
      )
      .replaceAll("{{hora_atual}}", new Date().toLocaleTimeString("pt-BR"))
      .replaceAll("{{nome_gestor}}", "Patricia")

    await wsupabase.from("auditoria").insert({
      lead_id: job.lead_id,
      lead_nome: lead.nome,
      usuario_nome: "Sistema",
      tipo: "edicao",
      descricao: noteText,
    })
  }

  await createLog({
    automation_id: automation.id,
    job_id: job.id,
    lead_id: job.lead_id,
    event_type: "supervision_applied",
    event_title: "Supervisão aplicada",
    event_description: "Gestor assumiu supervisão do lead",
    new_status: "supervision_applied",
  })
}

/**
 * Consulta quantidade de mensagens enviadas hoje por uma conexão específica (BRT).
 */
export async function contarEnviosHojePorLinha(
  connectionId: string,
  todayStartIso: string
): Promise<number> {
  const { count } = await wsupabase
    .from("automation_jobs")
    .select("id", { count: "exact", head: true })
    .gte("sent_at", todayStartIso)
    .in("status", ["sent", "delivered", "read", "responded"])
    .eq("metadata->>connection_id" as never, connectionId as never)
  return count ?? 0
}
