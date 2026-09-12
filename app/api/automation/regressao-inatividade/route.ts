import { NextResponse } from "next/server"
import { normalizePhone } from "@/lib/labels"
import { onlyDigits, wsupabase } from "@/lib/whatsapp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

// Regressão por inatividade: lead parado em atendimento volta sozinho para
// Novo Lead (frio), com o motivo registrado nas observações + auditoria.
// Regra: 2 dias SEM contato (WhatsApp/visita) E SEM alteração lógica no CRM.
// Travas: ignora quem teve regressão nos últimos 7 dias (anti-loop com a
// reativação) e quem tem job de automação aberto.
const DIAS_INATIVIDADE = 2
const DIAS_ANTI_LOOP = 7
const ESTAGIOS = ["em_atendimento", "atendimento_humano"]
const LIMITE = 500

const TERMINAL_JOBS = ["sent", "delivered", "read", "responded", "cancelled_human", "cancelled_condition", "cancelled_manual", "blocked_limit", "failed", "cancelled"]

function dataBR(d: Date): string {
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get("authorization")
    const qs = url.searchParams.get("secret")
    const ok = auth === `Bearer ${secret}` || qs === secret
    if (!ok) return NextResponse.json({ ok: false, erro: "não autorizado" }, { status: 401 })
  }
  const dry = url.searchParams.get("dry") === "1"
  const dias = Math.max(1, Number(url.searchParams.get("dias") ?? DIAS_INATIVIDADE) || DIAS_INATIVIDADE)
  const corte = new Date(Date.now() - dias * 86400000)

  const { data: leads, error } = await wsupabase
    .from("leads")
    .select("id,nome,telefone,temperatura,observacoes,atualizado_em,status,corretor_id")
    .in("status", ESTAGIOS)
    .is("arquivado_em", null)
    .is("fechado_em", null)
    .lt("atualizado_em", corte.toISOString())
    .order("atualizado_em", { ascending: true })
    .limit(LIMITE)
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  const lista = (leads ?? []) as {
    id: string; nome: string; telefone: string; temperatura: string;
    observacoes: string; atualizado_em: string; status: string; corretor_id: string | null;
  }[]
  if (!lista.length) return NextResponse.json({ ok: true, avaliados: 0, regredidos: 0, dry })

  const ids = lista.map((l) => l.id)

  // Regressões recentes (anti-loop 7d) + jobs abertos — em lote.
  const ha7d = new Date(Date.now() - DIAS_ANTI_LOOP * 86400000).toISOString()
  const [{ data: regs }, { data: jobs }] = await Promise.all([
    wsupabase.from("automation_logs").select("lead_id").eq("event_type", "lead_regressado_inatividade").in("lead_id", ids).gte("created_at", ha7d).limit(2000),
    wsupabase.from("automation_jobs").select("lead_id").in("lead_id", ids).not("status", "in", `(${TERMINAL_JOBS.join(",")})`).limit(2000),
  ])
  const regredidosRecente = new Set(((regs ?? []) as { lead_id: string }[]).map((r) => r.lead_id))
  const comJobAberto = new Set(((jobs ?? []) as { lead_id: string }[]).map((j) => j.lead_id))

  // Último contato WhatsApp (por lead_id) + por telefone (variações) + visitas — em lote.
  const [{ data: zapPorLead }, { data: visitas }] = await Promise.all([
    wsupabase.from("whatsapp_mensagens").select("lead_id,criado_em").in("lead_id", ids).order("criado_em", { ascending: false }).limit(5000),
    wsupabase.from("visitas").select("lead_id,data,horario").in("lead_id", ids).order("data", { ascending: false }).limit(2000),
  ])
  const ultimoZap = new Map<string, number>()
  for (const w of ((zapPorLead ?? []) as { lead_id: string; criado_em: string }[])) {
    if (!ultimoZap.has(w.lead_id)) ultimoZap.set(w.lead_id, new Date(w.criado_em).getTime())
  }
  const telefonesUnicos = Array.from(new Set(lista.map((l) => onlyDigits(l.telefone || "")).filter(Boolean)))
  const condTel = telefonesUnicos.flatMap((t) => {
    const sem55 = t.startsWith("55") ? t.slice(2) : t
    return [`telefone.ilike.%${t}%`, `telefone.ilike.%${sem55}%`]
  })
  if (condTel.length) {
    const { data: zapPorTel } = await wsupabase
      .from("whatsapp_mensagens")
      .select("telefone,criado_em")
      .or(condTel.join(","))
      .order("criado_em", { ascending: false })
      .limit(5000)
    const porTel = new Map<string, number>()
    for (const w of ((zapPorTel ?? []) as { telefone: string; criado_em: string }[])) {
      const k = normalizePhone(w.telefone || "")
      const t = new Date(w.criado_em).getTime()
      if (k && (!porTel.has(k) || (porTel.get(k) ?? 0) < t)) porTel.set(k, t)
    }
    for (const l of lista) {
      const k = normalizePhone(l.telefone || "")
      const t = porTel.get(k)
      if (t && (!ultimoZap.has(l.id) || (ultimoZap.get(l.id) ?? 0) < t)) ultimoZap.set(l.id, t)
    }
  }
  const ultimaVisita = new Map<string, number>()
  for (const v of ((visitas ?? []) as { lead_id: string; data: string; horario: string }[])) {
    const dt = new Date(`${v.data}T${String(v.horario || "00:00").slice(0, 5)}:00`)
    const t = isNaN(dt.getTime()) ? 0 : dt.getTime()
    if (!ultimaVisita.has(v.lead_id) || (ultimaVisita.get(v.lead_id) ?? 0) < t) ultimaVisita.set(v.lead_id, t)
  }

  let regredidos = 0
  const pulados: Record<string, number> = { contato_recente: 0, regressao_recente: 0, job_aberto: 0 }
  const detalhes: { id: string; nome: string; de: string; ultimo_contato: string | null }[] = []
  const corteMs = corte.getTime()

  for (const l of lista) {
    if (regredidosRecente.has(l.id)) { pulados.regressao_recente++; continue }
    if (comJobAberto.has(l.id)) { pulados.job_aberto++; continue }
    const ultimoContato = Math.max(ultimoZap.get(l.id) ?? 0, ultimaVisita.get(l.id) ?? 0)
    if (ultimoContato > corteMs) { pulados.contato_recente++; continue }

    const ultimoTxt = ultimoContato ? dataBR(new Date(ultimoContato)) : "nenhum contato registrado"
    const linha = `🔄 [${dataBR(new Date())}] Retornado para Novo Lead por inatividade: ${dias} dias sem contato e sem movimentação no CRM (último contato: ${ultimoTxt}). Temperatura ajustada para frio.`
    if (!dry) {
      const obs = `${(l.observacoes ?? "").trim()}\n${linha}`.trim().slice(-6000)
      const { error: upErr } = await wsupabase
        .from("leads")
        .update({ status: "novo", temperatura: "frio", observacoes: obs, atualizado_em: new Date().toISOString() })
        .eq("id", l.id)
      if (upErr) continue
      try {
        await wsupabase.from("automation_logs").insert({
          lead_id: l.id,
          event_type: "lead_regressado_inatividade",
          event_title: `Lead voltou para Novo (inatividade): ${l.nome}`,
          event_description: `De "${l.status}" para "novo" + frio após ${dias}d sem contato e sem alteração (último contato: ${ultimoTxt}).`,
          actor_type: "system",
        })
      } catch { /* log é best-effort */ }
    }
    regredidos++
    detalhes.push({ id: l.id, nome: l.nome, de: l.status, ultimo_contato: ultimoContato ? new Date(ultimoContato).toISOString() : null })
  }

  try {
    await wsupabase.from("automation_logs").insert({
      event_type: "regressao_resumo",
      event_title: dry ? "Regressão por inatividade (simulação)" : "Regressão por inatividade executada",
      event_description: `Avaliados: ${lista.length} | Regredidos: ${regredidos} | Pulados: ${JSON.stringify(pulados)}`,
      actor_type: "system",
    })
  } catch { /* log é best-effort */ }

  return NextResponse.json({ ok: true, avaliados: lista.length, regredidos, pulados, dry, detalhes: detalhes.slice(0, 50) })
}
