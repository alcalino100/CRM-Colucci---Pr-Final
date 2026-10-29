// =============================================================================
// /api/automation/resgate-ia — Diagnóstico e Execução do Plano de Contenção IA
// Identifica leads travados em atendimento_ia, separa elegíveis (silêncio do lead)
// de leads aguardando resposta humana, e permite disparo controlado.
// =============================================================================

import { NextResponse } from "next/server"
import { wsupabase } from "@/lib/whatsapp/server"
import {
  TEMPLATE_CONTENCAO_IA,
  AUTOMATION_CONTENCAO_IA_ID,
  runWorker,
} from "@/app/api/automation/worker/route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 180

export async function GET() {
  try {
    const agora = Date.now()
    const cutoff24h = new Date(agora - 24 * 3600_000).toISOString()

    // 1. Busca todos os leads em 'atendimento_ia' não arquivados e não fechados
    const { data: leadsIA, error: leadsErr } = await wsupabase
      .from("leads")
      .select("id, nome, telefone, temperatura, status, corretor_id, criado_em, atualizado_em, observacoes")
      .eq("status", "atendimento_ia")
      .is("arquivado_em", null)
      .is("fechado_em", null)
      .order("atualizado_em", { ascending: true })
      .limit(500)

    if (leadsErr) {
      return NextResponse.json({ ok: false, error: leadsErr.message }, { status: 500 })
    }

    const totalLeads = leadsIA?.length ?? 0
    if (totalLeads === 0) {
      return NextResponse.json({
        ok: true,
        metricas: {
          total_atendimento_ia: 0,
          parados_24h: 0,
          elegiveis_contencao: 0,
          aguardando_resposta: 0,
          jobs_agendados: 0,
          jobs_enviados: 0,
        },
        elegiveis: [],
        aguardando_resposta_leads: [],
        template_id: TEMPLATE_CONTENCAO_IA,
      })
    }

    const ids = (leadsIA ?? []).map((l) => l.id)

    // 2. Busca histórico de mensagens em lote
    const { data: msgs } = await wsupabase
      .from("whatsapp_mensagens")
      .select("lead_id, de_mim, criado_em, corpo, telefone")
      .in("lead_id", ids)
      .order("criado_em", { ascending: false })
      .limit(5000)

    // Agrupa mensagens por lead_id
    const msgPorLead = new Map<string, { de_mim: boolean; criado_em: string; corpo: string }>()
    for (const m of (msgs ?? []) as { lead_id: string; de_mim: boolean; criado_em: string; corpo: string }[]) {
      if (!msgPorLead.has(m.lead_id)) {
        msgPorLead.set(m.lead_id, m)
      }
    }

    // 3. Busca jobs já existentes da automação de contenção
    const { data: jobsContencao } = await wsupabase
      .from("automation_jobs")
      .select("id, lead_id, status, scheduled_at, sent_at")
      .eq("automation_id", AUTOMATION_CONTENCAO_IA_ID)
      .limit(1000)

    const jobPorLead = new Map<string, { status: string; sent_at: string | null }>()
    for (const j of (jobsContencao ?? []) as { lead_id: string; status: string; sent_at: string | null }[]) {
      jobPorLead.set(j.lead_id, j)
    }

    const elegiveis: any[] = []
    const aguardandoResposta: any[] = []
    let parados24hCount = 0

    for (const lead of leadsIA ?? []) {
      const ultMsg = msgPorLead.get(lead.id)
      const dataRef = ultMsg?.criado_em ? new Date(ultMsg.criado_em).getTime() : new Date(lead.atualizado_em || lead.criado_em).getTime()
      const horasSilencio = Math.max(0, Math.round((agora - dataRef) / (3600_000)))
      const parado24h = horasSilencio >= 24

      if (parado24h) parados24hCount++

      const item = {
        id: lead.id,
        nome: lead.nome,
        telefone: lead.telefone,
        horas_silencio: horasSilencio,
        dias_silencio: Math.round(horasSilencio / 24),
        ultima_mensagem: ultMsg?.corpo ? ultMsg.corpo.slice(0, 140) : "Sem mensagem no histórico",
        ultima_msg_de_mim: ultMsg ? ultMsg.de_mim : true,
        data_ultima_interacao: ultMsg?.criado_em || lead.atualizado_em,
        job_status: jobPorLead.get(lead.id)?.status ?? null,
      }

      if (parado24h) {
        if (ultMsg && !ultMsg.de_mim) {
          // Lead enviou mensagem por último e está esperando resposta nossa
          aguardandoResposta.push(item)
        } else {
          // Nós falamos por último e o lead silenciou (elegível para "Notei que você não respondeu mais...")
          elegiveis.push(item)
        }
      }
    }

    // Carrega dados da automação e template
    const [{ data: template }, { data: automacao }] = await Promise.all([
      wsupabase.from("automation_message_templates").select("*").eq("id", TEMPLATE_CONTENCAO_IA).maybeSingle(),
      wsupabase.from("automations").select("*").eq("id", AUTOMATION_CONTENCAO_IA_ID).maybeSingle(),
    ])

    return NextResponse.json({
      ok: true,
      metricas: {
        total_atendimento_ia: totalLeads,
        parados_24h: parados24hCount,
        elegiveis_contencao: elegiveis.length,
        aguardando_resposta: aguardandoResposta.length,
        jobs_agendados: (jobsContencao ?? []).filter((j) => ["scheduled", "retrying"].includes(j.status)).length,
        jobs_enviados: (jobsContencao ?? []).filter((j) => ["sent", "delivered", "read", "responded"].includes(j.status)).length,
      },
      template: template
        ? {
            id: template.id,
            name: template.name,
            content: template.content,
          }
        : null,
      automacao: automacao
        ? {
            id: automacao.id,
            name: automacao.name,
            status: automacao.status,
            max_daily_sends: automacao.limits_config?.max_daily_sends,
          }
        : null,
      elegiveis: elegiveis.slice(0, 50),
      aguardando_resposta_leads: aguardandoResposta.slice(0, 30),
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error)?.message ?? "Erro interno" }, { status: 500 })
  }
}

// POST: dispara a execução controlada da contenção IA via worker
export async function POST() {
  try {
    const resWorker = await runWorker()
    return resWorker
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error)?.message ?? "Erro ao executar resgate" }, { status: 500 })
  }
}
