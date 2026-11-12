import { getBoundInstances } from "./rules"
import {
  db,
  MANUAL_PIPELINE_INSTANCES,
  chaveConversa,
  moverLeadPipeline,
  registrarResumoConversa,
} from "./inbox-common"
import { acharLeadVinculado } from "./inbox-resolution"

// STOP automático: gestor/corretor enviou mensagem manualmente na instância. A conversa
// IA daquele contato é PAUSADA (ai_responding=false), leva o lead para em_atendimento e
// registra o resumo nas observações — o atendimento passa a ser manual.
export async function pausarIaMensagemManual({
  telefone,
  instanceName,
  textoOutbound,
}: {
  telefone: string
  instanceName?: string
  textoOutbound?: string
}): Promise<void> {
  try {
    const { data: agentes } = await db().from("ai_agents").select("id,name,config")
    const agente = ((agentes ?? []) as { id: string; name: string; config: unknown }[]).find((a) =>
      getBoundInstances(a.config).includes(instanceName || "")
    )
    if (!telefone) return
    const lead = await acharLeadVinculado(telefone, instanceName)
    const key = chaveConversa(lead?.id, telefone)

    // Anti-rajada: mesmo contato+texto nos últimos 5min → um pause basta.
    // (Retries da Evolution disparam N eventos por mensagem enviada.)
    if (textoOutbound?.trim()) {
      try {
        const desde = new Date(Date.now() - 5 * 60000).toISOString()
        const { data: repetida } = await db()
          .from("whatsapp_mensagens")
          .select("mensagem_id")
          .eq("instance_name", instanceName ?? "")
          .eq("telefone", telefone)
          .eq("de_mim", true)
          .eq("corpo", textoOutbound.trim())
          .gte("criado_em", desde)
          .limit(3)
        if (((repetida ?? []) as unknown[]).length > 1) return
      } catch {
        /* segue o fluxo */
      }
    }

    // Eco de envio da AUTOMAÇÃO (job sent recente com mesmo texto) não é
    // atendimento manual — ignora sem pausar, mover ou logar.
    if (textoOutbound?.trim() && lead) {
      try {
        const desdeJobs = new Date(Date.now() - 30 * 60000).toISOString()
        const { data: jobs } = await db()
          .from("automation_jobs")
          .select("message_content_rendered")
          .eq("lead_id", lead.id)
          .in("status", ["sent", "delivered", "read"])
          .gte("sent_at", desdeJobs)
          .limit(5)
        const norm = (s: string) => s.toLowerCase().trim()
        const ecoAutomacao = (
          (jobs ?? []) as { message_content_rendered?: unknown }[]
        ).some((j) => norm(String(j.message_content_rendered ?? "")) === norm(textoOutbound))
        if (ecoAutomacao) return
      } catch {
        /* segue o fluxo */
      }
    }

    let convHandoff: string | undefined
    if (agente) {
      const { data: conv } = await db()
        .from("conversations_ia")
        .select("id,ai_responding")
        .eq("ai_id", agente.id)
        .eq("contact_id", key)
        .maybeSingle()

      // Já pausada: 1ª mensagem manual fez o handoff completo (resumo, etapa,
      // aviso); as seguintes são só mensagens — sem re-log, re-mover ou re-avisar.
      // (Sem isso, uma rajada humana gera N pausas/logs em minutos.)
      const convRecord = conv as { id: string; ai_responding: boolean } | null
      if (convRecord?.id && !convRecord.ai_responding) return
      if (convRecord?.id) {
        // Eco da própria IA (o envio de uma resposta gera um evento fromMe na Evolution).
        // Se o texto que saiu é igual à última resposta da IA, NÃO é atendimento manual —
        // e não pode pausar a conversa nem mover o lead.
        if (textoOutbound) {
          try {
            const { data: ultima } = await db()
              .from("messages_ia")
              .select("content")
              .eq("conversation_id", convRecord.id)
              .eq("role", "ai")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()
            const u = ultima as { content?: string } | null
            if (u && (u.content || "").trim() === (textoOutbound || "").trim()) return
          } catch {
            /* comparação é best-effort */
          }
        }
        if (convRecord.ai_responding) {
          await registrarResumoConversa(
            convRecord.id,
            lead?.id,
            "pausada — atendimento manual pelo corretor"
          )
        }
        await db().from("conversations_ia").update({ ai_responding: false }).eq("id", convRecord.id)
        convHandoff = convRecord.id
      }
    }

    if (lead) {
      if (convHandoff) {
        // Assumiu com histórico IA: qualificação + etapa + aviso ao responsável.
        const { finalizarParaHumano } = await import("./qualificacao")
        await finalizarParaHumano({
          leadId: lead.id,
          convId: convHandoff,
          aiId: (agente as { id: string }).id,
          motivo: "atendimento manual pelo corretor",
          telefone,
          instanceName,
        })
      } else if (!MANUAL_PIPELINE_INSTANCES.has(instanceName || "")) {
        // Exceção: instâncias 100% manuais (ex.: Brayon) — nunca move sozinho.
        await moverLeadPipeline(lead.id, "em_atendimento")
      }
    }

    try {
      await db().from("automation_logs").insert({
        lead_id: lead?.id ?? null,
        event_type: "ia_pausada_mensagem_manual",
        event_title: "Atendimento manual iniciado — IA pausada",
        event_description: `Corretor enviou mensagem manual para ${telefone} (${instanceName || "instância"}). Conversa IA pausada e lead movido para em_atendimento.`,
        actor_type: "gestor",
      })
    } catch {
      /* best-effort */
    }
  } catch {
    /* best-effort */
  }
}
